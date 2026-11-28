import Phaser from 'phaser';
import { PAINT_COLORS } from '../view/worldArt';
import type { TauntId } from '../data/taunts';
import { tauntBubble } from '../view/tauntBubble';
import { type CupState, cupGrid, cupRace, cupTrack, scoreRace } from '../cup/championship';
import { activeCup } from '../cup/offlineCup';
import { DEBUG } from '../config';
import { PointerController } from '../control/PointerController';
import { TUNING } from '../data/items';
import { t } from '../i18n';
import { type Difficulty } from '../data/difficulty';
import { getTrackDef, loadTrack } from '../data/tracks';
import { speedOf } from '../physics/BoatPhysics';
import { lerp } from '../physics/math';
import { RaceSimulation, STEP } from '../race/RaceSimulation';
import type { RaceEvent } from '../race/types';
import { session, type Selection } from '../session';
import { net } from '../net/client';
import { OnlineRace } from '../net/onlineRace';
import type { ServerMsg } from '../net/protocol';
import type { ResultRow } from './ResultsScene';
import { BoatView } from '../view/BoatView';
import { MapRenderer, type SceneryData } from '../view/MapRenderer';
import { generateScenery } from '../view/sceneryGen';
import { TrafficView } from '../view/trafficView';
import { StreetLife } from '../view/streetLife';
import { HazardView } from '../view/hazardView';
import { STREET_ART_SCALE } from '../view/streetArt';
import { WORLD_ART_SCALE } from '../view/textures';
import { options } from '../options';
import { hasEffect } from '../effects/effects';
import { Fx } from '../view/fx';
import { RaceAudio } from '../view/raceAudio';
import { audio } from '../audio/AudioManager';

type Sprite = Phaser.GameObjects.Image;

/** What AI boats say when they overtake you, and when they answer your taunt. */
const AI_PASS: TauntId[] = ['bye', 'slow', 'honk'];
const AI_REPLIES: TauntId[] = ['sorry', 'nice', 'cheers', 'honk', 'slow'];

export class RaceScene extends Phaser.Scene {
  sim!: RaceSimulation;
  pointer!: PointerController;
  selection!: Selection;
  private views: BoatView[] = [];
  private trackView!: { update(time: number): void };
  private accumulator = 0;
  private crateSprites = new Map<number, Sprite>();
  private volSprites = new Map<number, Sprite>();
  private drillSprites = new Map<number, Sprite>();
  private puddleSprites = new Map<number, Sprite>();
  private fakeSprites = new Map<number, Sprite>();
  private blobSprites = new Map<number, Sprite>();
  private shotSprites = new Map<number, Sprite>();
  private cloudSprites = new Map<number, Sprite>();
  private boobSprites = new Map<number, Sprite>();
  private dropSprites = new Map<number, Sprite>();
  /** The barges (the HUD's minimap reads their positions). */
  trafficView: TrafficView | null = null;
  /** Cars and people round the camera: decoration only. */
  streetLife: StreetLife | null = null;
  private hazardView: HazardView | null = null;
  /** 0..1: how psychedelic the screen is (mushrooms). The HUD reads this for its colour wash. */
  trip = 0;
  /** How drunk the player is (0..1), for the swaying camera and the HUD's green waves. */
  drunk = 0;
  private tripT = 0;
  private tripFx: { colors: Phaser.FX.ColorMatrix; barrel: Phaser.FX.Barrel } | null = null;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private fx!: Fx;
  private raceAudio!: RaceAudio;
  /** Hit pause: the simulation holds still for this long after a big hit involving the player. */
  private freeze = 0;
  private camX = 0;
  private camY = 0;
  private over = false;
  private debugGfx?: Phaser.GameObjects.Graphics;
  private fpsText?: Phaser.GameObjects.Text;

  constructor() {
    super('Race');
  }

  /** Online race: the server runs it; this screen predicts your boat and shows the others. */
  online: OnlineRace | null = null;
  /** Online, joined during the race: no boat of your own; the camera follows `sim.player`, which a tap changes. */
  spectating = false;
  private onlineStart: Extract<ServerMsg, { t: 'start' }> | null = null;
  /** Taunt bubbles following their boats. */
  private taunts: { c: Phaser.GameObjects.Container; racer: number; dy: number }[] = [];
  private lastPositions: number[] = [];
  private aiTauntAt = -1e9;
  /** A single-player championship race: who is in each seat (null: not a championship race). */
  private cupKeys: string[] | null = null;

  init(data: Selection & { online?: Extract<ServerMsg, { t: 'start' }>; cup?: boolean }): void {
    // Online, the room's settings say which stretch is raced; offline, the stretch saved for the track.
    this.onlineStart = data.online ?? null;
    this.online = null;
    this.spectating = false;
    // A single-player championship: the cup says which track is next.
    this.cupKeys = data.cup && activeCup && !data.online ? [] : null;
    this.selection = data.online
      ? { ...session, trackId: data.online.settings.trackId, difficulty: data.online.settings.difficulty }
      : this.cupKeys && activeCup ? { ...data, trackId: cupTrack(activeCup.state), difficulty: activeCup.difficulty } : data;
    this.views = [];
    this.taunts = [];
    this.lastPositions = [];
    this.aiTauntAt = -1e9;
    this.accumulator = 0;
    this.over = false;
    this.crateSprites.clear();
    this.volSprites.clear();
    this.drillSprites.clear();
    this.puddleSprites.clear();
    this.fakeSprites.clear();
    this.blobSprites.clear();
    this.shotSprites.clear();
    this.cloudSprites.clear();
    this.boobSprites.clear();
    this.dropSprites.clear();
    this.trafficView = null;
    this.streetLife = null;
    this.hazardView = null;
    this.trip = 0;
    this.drunk = 0;
    this.tripT = 0;
    this.tripFx = null;
    this.freeze = 0;
  }

  /** Real-world tracks keep their scenery in a separate file, loaded only when that track is raced. */
  preload(): void {
    const def = getTrackDef(this.selection.trackId);
    if (def.scenery && !this.cache.json.exists(def.scenery)) this.load.json(def.scenery, def.scenery);
  }

  create(): void {
    const sel = this.selection;
    // Online the room says which stretch and how many laps; in a championship, the race does.
    const race = this.cupKeys && activeCup ? cupRace(activeCup.state) : null;
    const track = this.onlineStart
      ? loadTrack(sel.trackId, this.onlineStart.settings.section, this.onlineStart.settings.laps)
      : race ? loadTrack(race.trackId, race.section, race.laps) : loadTrack(sel.trackId, sel.sections?.[sel.trackId]);
    if (DEBUG.laps) track.def.laps = DEBUG.laps;
    this.pointer = new PointerController(this, () => this.playerScreen());
    const start = this.onlineStart;
    if (start) {
      // Online: a local copy of the server's race, kept in step by snapshots (never simulated here).
      const mine = start.roster.findIndex((e) => e.playerId === net.you);
      this.spectating = mine < 0;
      this.sim = new RaceSimulation({
        track,
        difficulty: start.settings.difficulty,
        seed: start.seed,
        roster: start.roster.map((e) => ({ name: e.name, boatId: e.boatId, human: e.human })),
        localRacer: mine, // -1 when watching: then sim.player is just the boat being watched
      });
      const online = new OnlineRace(this.sim, this.spectating ? null : this.sim.player!);
      this.online = online;
      online.onCorrection = (dx, dy, dh) => this.views[this.sim.player!.id]?.correct(dx, dy, dh);
      net.on(this, 'snap', (m) => online.onSnap(m, performance.now()));
      net.on(this, 'results', (m) => this.finishOnline(m));
      net.on(this, 'taunt', (m) => {
        const i = start.roster.findIndex((e) => e.playerId === m.from);
        if (i >= 0) this.showTaunt(i, m.id);
      });
      net.on(this, 'closed', () => this.scene.start('Online', { error: t('online.lost') }));
      // Back after losing the connection: the same race carries on; a different one starts afresh.
      net.on(this, 'start', (m) => {
        if (m.seed === start.seed) online.resume();
        else this.scene.start('Race', { online: m });
      });
      // The race ended while the connection was down (we missed the results): back to the room.
      net.on(this, 'lobby', (m) => {
        if (!m.racing && !this.over) this.scene.start('Lobby');
      });
      if (this.spectating) {
        // Tap to watch the next boat.
        this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
          if (p.leftButtonDown() || p.wasTouch) this.watchNext();
        });
      }
    } else if (this.cupKeys && activeCup) {
      // A championship race: always the same boats, the leader at the back of the grid.
      const grid = cupGrid(activeCup.state, activeCup.boats, (b) => b.key);
      this.cupKeys = grid.map((b) => b.key);
      this.sim = new RaceSimulation({
        track,
        difficulty: activeCup.difficulty,
        seed: DEBUG.seed ?? (Date.now() & 0xffff),
        forcedItem: DEBUG.item,
        roster: grid.map((b) => ({ name: b.name, boatId: b.boatId, human: b.human, controller: b.human ? this.pointer : undefined })),
      });
    } else {
      this.sim = new RaceSimulation({
        track,
        playerBoat: sel.boatId,
        difficulty: sel.difficulty as Difficulty,
        seed: DEBUG.seed ?? (Date.now() & 0xffff),
        aiCount: DEBUG.noAI ? 0 : 3,
        forcedItem: DEBUG.item,
        playerController: this.pointer,
      });
    }

    // Real-world tracks bring their scenery in a file; the invented ones have theirs generated.
    const scenery = track.def.scenery ? (this.cache.json.get(track.def.scenery) as SceneryData) : generateScenery(track);
    this.trackView = new MapRenderer(this, track, scenery);
    this.streetLife = new StreetLife(this, track, scenery);
    const wake = this.add.particles(0, 0, 'wake', {
      lifespan: 900, speed: 0, scale: { start: 0.3, end: 1.3 }, alpha: { start: 0.4, end: 0 }, emitting: false,
    }).setDepth(5);
    this.sparks = this.add.particles(0, 0, 'spark', {
      lifespan: 500, speed: { min: 80, max: 260 }, scale: { start: 1.2, end: 0 }, emitting: false,
    }).setDepth(40);

    for (const c of this.sim.items.crates) this.crateSprites.set(c.id, this.makeCrateSprite(c.x, c.y));
    // The two arms of the V a moving boat leaves behind: particles drifting outward.
    const wakeArm = this.add.particles(0, 0, 'wake', {
      lifespan: 1600, speed: { min: 22, max: 40 }, scale: { start: 0.22, end: 0.9 }, alpha: { start: 0.38, end: 0 }, emitting: false,
    }).setDepth(5);
    for (const r of this.sim.racers) this.views.push(new BoatView(this, r, wake, wakeArm));
    this.fx = new Fx(this);
    this.raceAudio = new RaceAudio(this, this.sim);
    this.trafficView = new TrafficView(this, this.sim, wake, wakeArm, this.raceAudio);
    this.hazardView = new HazardView(this, this.sim, this.raceAudio);
    audio.muteEngines(false);
    audio.duckMusic(false);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.raceAudio.destroy());

    const cam = this.cameras.main;
    const p = this.sim.player!;
    this.camX = p.x;
    this.camY = p.y;
    cam.setZoom(0.9);
    cam.centerOn(p.x, p.y);

    this.scene.launch('Hud', { race: this });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scene.stop('Hud'));

    if (DEBUG.enabled) {
      this.debugGfx = this.add.graphics().setDepth(50);
      this.fpsText = this.add.text(10, 10, '', { color: '#fff', backgroundColor: '#000a', fontSize: '16px' }).setScrollFactor(0).setDepth(100);
      this.drawDebug();
    }
  }

  /** Real item crates and fake ones use this same sprite on purpose: they must look identical. */
  private makeCrateSprite(x: number, y: number): Sprite {
    const s = this.add.image(x, y, 'crate').setDepth(8).setScale(WORLD_ART_SCALE);
    this.tweens.add({ targets: s, scale: { from: 0.92 * WORLD_ART_SCALE, to: 1.08 * WORLD_ART_SCALE }, duration: 650, yoyo: true, repeat: -1, delay: Math.random() * 600 });
    return s;
  }

  /** Where a boat is on screen, in game pixels. */
  boatOnScreen(racer: number): { x: number; y: number } | null {
    const cam = this.cameras.main;
    const v = this.views[racer];
    return v ? { x: (v.x - cam.worldView.x) * cam.zoom, y: (v.y - cam.worldView.y) * cam.zoom } : null;
  }

  /** Where the player's boat is on screen, in game pixels. */
  private playerScreen(): { x: number; y: number } {
    const cam = this.cameras.main;
    const v = this.views[this.sim.player!.id];
    return { x: (v.x - cam.worldView.x) * cam.zoom, y: (v.y - cam.worldView.y) * cam.zoom };
  }

  update(time: number): void {
    // Raw frame time: Phaser's smoothed `delta` would slow the simulation down at low frame rates.
    const dt = Math.min(this.game.loop.rawDelta / 1000, 0.25);
    if (this.online) this.stepOnline(dt);
    else {
      if (this.freeze > 0) this.freeze -= dt; // hit pause: time stands still for a moment
      else this.accumulator += dt;
      while (this.accumulator >= STEP && this.sim.phase !== 'over') {
        for (const v of this.views) v.snapshot();
        this.sim.step(STEP);
        this.accumulator -= STEP;
      }
    }
    const alpha = this.sim.phase === 'over' ? 1 : this.accumulator / STEP;
    for (let i = 0; i < this.views.length; i++) this.views[i].render(alpha, time, dt);
    // Barges: offline at the simulation's clock (smoothed between steps); online at your boat's clock.
    const trafficT = this.online ? this.online.trafficTime : (this.sim.steps + alpha) * STEP;
    const followed = this.views[this.sim.player!.id];
    this.trafficView?.update(trafficT, dt, followed ? { x: followed.x, y: followed.y } : null);
    this.syncEntities(time, dt);
    this.hazardView?.update(time, dt);
    this.trackView.update(time);
    this.streetLife?.update(Math.min(dt, 0.1));
    this.updateTrip(time, dt);
    this.updateDrunk(time, dt);
    this.raceAudio.update(dt);
    this.updateCamera(dt, time);
    this.updateTaunts(time);
    for (const e of this.online ? this.online.takeEvents() : this.sim.takeEvents()) this.handleEvent(e);
    if (this.fpsText) this.fpsText.setText(`${this.game.loop.actualFps.toFixed(0)} fps`);
  }

  /** A taunt in a bubble over a boat (one bubble per boat at a time). */
  showTaunt(racer: number, id: TauntId): void {
    const v = this.views[racer];
    if (!v) return;
    for (const b of this.taunts) if (b.racer === racer) b.c.destroy();
    this.taunts = this.taunts.filter((b) => b.racer !== racer);
    const c = tauntBubble(this, v.x, v.y - 42, id, 'down').setDepth(60);
    this.taunts.push({ c, racer, dy: c.y - v.y });
  }

  /** The player taunts (the HUD's taunt menu). Online it goes to everyone; offline an AI boat may answer. */
  taunt(id: TauntId): void {
    if (this.online) {
      net.send({ t: 'taunt', id });
      return;
    }
    const me = this.sim.player;
    if (!me) return;
    this.showTaunt(me.id, id);
    const ais = this.sim.racers.filter((r) => !r.human && !r.finished);
    if (ais.length && Math.random() < 0.5) {
      const ai = ais[Math.floor(Math.random() * ais.length)];
      const replies = AI_REPLIES.filter((x) => x !== id);
      this.time.delayedCall(1300, () => this.showTaunt(ai.id, replies[Math.floor(Math.random() * replies.length)]));
    }
  }

  /** Bubbles follow their boats; an AI boat that overtakes you close by sometimes rubs it in. */
  private updateTaunts(time: number): void {
    this.taunts = this.taunts.filter((b) => b.c.active);
    for (const b of this.taunts) {
      const v = this.views[b.racer];
      b.c.setPosition(v.x, v.y + b.dy);
    }
    const me = this.sim.player;
    const prev = this.lastPositions;
    if (me && !this.spectating && this.sim.phase === 'racing' && prev.length && time - this.aiTauntAt > 7000) {
      for (const r of this.sim.racers) {
        if (r.human || r.finished || prev[r.id] === undefined) continue;
        const passed = prev[r.id] > prev[me.id] && r.position < me.position;
        if (passed && Math.hypot(r.x - me.x, r.y - me.y) < 450 && Math.random() < 0.45) {
          this.aiTauntAt = time;
          this.showTaunt(r.id, AI_PASS[Math.floor(Math.random() * AI_PASS.length)]);
          break;
        }
      }
    }
    this.lastPositions = this.sim.racers.map((r) => r.position);
  }

  /** Online: your controls drive your boat locally each step (and go to the server); the others follow the snapshots. */
  private stepOnline(dt: number): void {
    const online = this.online!;
    const me = this.sim.player!;
    const myView = this.spectating ? null : this.views[me.id];
    this.accumulator += dt;
    while (this.accumulator >= STEP) {
      if (myView) {
        myView.snapshot();
        online.local(this.pointer.update(me, this.sim, STEP));
      }
      this.accumulator -= STEP;
    }
    for (const v of this.views) if (v !== myView) v.snapshot();
    online.render(performance.now());
  }

  /** Watching: follow the next boat (the HUD and the sounds follow it too). */
  private watchNext(): void {
    const sim = this.sim;
    sim.player = sim.racers[((sim.player?.id ?? -1) + 1) % sim.racers.length];
    const v = this.views[sim.player.id];
    this.camX = v.x;
    this.camY = v.y;
  }

  /** Online results arrive from the server. */
  private finishOnline(m: Extract<ServerMsg, { t: 'results' }>): void {
    if (this.over) return;
    this.over = true;
    const start = this.onlineStart!;
    const rows: ResultRow[] = m.rows.map((r) => {
      const i = start.roster.findIndex((e) => (r.playerId ? e.playerId === r.playerId : e.name === r.name && e.boatId === r.boatId));
      return {
        name: r.playerId === net.you ? t('you') : r.name,
        boatId: r.boatId,
        color: this.sim.racers[Math.max(0, i)]?.color ?? 0xffffff,
        time: r.time,
        finished: r.finished,
        isPlayer: r.playerId === net.you,
      };
    });
    this.time.delayedCall(1200, () => this.scene.start('Results', { rows, trackId: this.sim.track.def.id, selection: this.selection, online: true, cup: m.cup, you: net.you }));
  }

  private updateCamera(dt: number, time: number): void {
    const cam = this.cameras.main;
    const p = this.sim.player!;
    const v = this.views[p.id];
    const tx = v.x + p.vx * 0.35;
    const ty = v.y + p.vy * 0.35;
    const k = 1 - Math.exp(-dt * 5);
    this.camX = lerp(this.camX, tx, k);
    this.camY = lerp(this.camY, ty, k);
    // While tripping the zoom breathes a little. (No rotation: steering maps the pointer to the boat.)
    const zoom = lerp(0.95, 0.72, Math.min(1, speedOf(p) / 440)) * (1 + Math.sin(time / 450) * 0.035 * this.trip);
    cam.setZoom(lerp(cam.zoom, zoom, 1 - Math.exp(-dt * 2)));
    cam.centerOn(this.camX, this.camY);
  }

  private syncEntities(time: number, dt: number): void {
    const items = this.sim.items;
    for (const c of items.crates) {
      const s = this.crateSprites.get(c.id)!;
      // A mushroom pulls crates away from home: glide to where the crate really is (online, that
      // arrives 20 times a second), and snap when it jumps home after being taken.
      const d = Math.hypot(c.x - s.x, c.y - s.y);
      if (d > 300 || c.respawn > 0) s.setPosition(c.x, c.y);
      else if (d > 0.3) {
        const k = 1 - Math.exp(-dt * 18);
        s.setPosition(s.x + (c.x - s.x) * k, s.y + (c.y - s.y) * k);
      }
      s.setVisible(c.respawn <= 0).setRotation(Math.sin(time / 500 + c.id) * 0.12);
    }
    this.syncGroup(this.volSprites, items.volunteers, (v) => this.add.image(v.x, v.y, 'volunteer').setDepth(14).setScale(WORLD_ART_SCALE * 1.15), (s, v) => {
      s.setPosition(v.x, v.y).setRotation(v.heading + Math.sin(v.age * 24) * 0.35);
    }, (s) => {
      // A volunteer lands in the water (after a hit or a miss).
      this.fx.splash(s.x, s.y, 0.7);
      this.raceAudio.at('splash', s.x, s.y, 0.6);
      this.retire(s, 'wave');
    });
    // The drill bit: on the bow, then flying; spinning all the while.
    this.syncGroup(this.drillSprites, items.drills, (d) => this.add.image(d.x, d.y, 'drillBit_0').setDepth(14).setDisplaySize(TUNING.drill.length, 16), (s, d) => {
      s.setPosition(d.x, d.y).setRotation(d.heading).setTexture(`drillBit_${Math.floor(time / 45) % 2}`);
    }, (s) => this.retire(s, 'fade'));
    // Fake crates are drawn exactly like real ones (same sprite, same bobbing).
    this.syncGroup(this.fakeSprites, items.fakeCrates, (f) => this.makeCrateSprite(f.x, f.y), (s, f) => {
      s.setPosition(f.x, f.y).setRotation(Math.sin(time / 500 + f.id) * 0.12);
    }, (s) => {
      this.fx.crate(s.x, s.y);
      this.retire(s, 'fade');
    });
    this.syncGroup(this.blobSprites, items.blobs, (b) => this.add.image(b.x, b.y, 'blob').setDepth(14), (s, b) => {
      s.setPosition(b.x, b.y).setRotation(b.heading).setScale((1 + Math.sin(b.age * 30) * 0.08) * WORLD_ART_SCALE);
    }, (s) => this.retire(s, 'fade'));
    // Raclette: a potato and slices of ham, tumbling as they fly.
    // ...and nails, straight and fast (hidden until their turn to leave the gun).
    this.syncGroup(this.shotSprites, items.shots, (s) => this.add.image(s.x, s.y, ['potato', 'ham', 'nail'][s.kind]).setDepth(14).setScale(s.kind === 2 ? 0.25 * 1.3 : WORLD_ART_SCALE * 1.2).setData('kind', s.kind), (sp, s) => {
      sp.setPosition(s.x, s.y).setVisible(s.wait <= 0).setRotation(s.kind === 2 ? s.heading : s.heading + Math.sin(s.age * 18 + s.id) * 0.5);
    }, (sp) => {
      if (sp.getData('kind') === 2) {
        this.sparks.setParticleTint(0xdfe4ea);
        if (sp.visible) this.sparks.emitParticleAt(sp.x, sp.y, 4);
        sp.destroy();
        return;
      }
      this.fx.cheese(sp.x, sp.y);
      this.retire(sp, 'fade');
    });
    // Dicke Titten: a shadow grows on the water while they fall, they land with a splash and jiggle.
    const TT = TUNING.titten;
    this.syncGroup(this.boobSprites, items.boobs, (b) => {
      // (the drawing has the pair along its y axis: across the canal, or turned along it)
      const rot = b.heading + (b.turned ? Math.PI / 2 : 0);
      const shadow = this.add.ellipse(b.x, b.y, 80, 150, 0x000000, 0.25).setDepth(4).setRotation(rot);
      return this.add.image(b.x, b.y, 'boobs').setDepth(13).setRotation(rot).setData('shadow', shadow).setData('landed', false);
    }, (sp, b) => {
      const shadow = sp.getData('shadow') as Phaser.GameObjects.Ellipse;
      const fall = Math.min(1, b.age / TT.warn);
      const fade = b.age > TT.warn + TT.life - 1 ? Math.max(0, TT.warn + TT.life - b.age) : 1;
      shadow.setPosition(b.x, b.y).setScale(0.4 + 0.6 * fall).setAlpha(0.3 * fall * fade);
      if (fall < 1) sp.setPosition(b.x, b.y - (1 - fall) * 260).setScale(WORLD_ART_SCALE * (1.6 - 0.6 * fall)).setAlpha(0.4 + 0.6 * fall);
      else {
        if (!sp.getData('landed')) {
          sp.setData('landed', true).setData('t0', time);
          this.fx.splash(b.x, b.y, 1.4);
          this.raceAudio.at('splash', b.x, b.y, 1);
        }
        // a jiggle that settles
        const t = (time - (sp.getData('t0') as number)) / 1000;
        const j = Math.exp(-t * 2.2) * Math.sin(t * 22) * 0.12 + Math.sin(time / 420 + b.id) * 0.015;
        sp.setPosition(b.x, b.y).setScale(WORLD_ART_SCALE * (1 + j), WORLD_ART_SCALE * (1 - j * 0.6)).setAlpha(fade);
      }
    }, (sp) => {
      (sp.getData('shadow') as Phaser.GameObjects.Ellipse).destroy();
      this.retire(sp, 'fade');
    });
    // Melted cheese, toxic smoke and wet paint lying on the water.
    this.syncGroup(this.cloudSprites, items.clouds, (c) => {
      if (c.kind === 0) this.raceAudio.at('glue', c.x, c.y, 0.7); // (a toilet's trail: the flush is heard once)
      if (c.kind === 0) this.fx.cheese(c.x, c.y);
      if (c.kind === 2) return this.add.image(c.x, c.y, `paint_${c.id % PAINT_COLORS.length}`).setDepth(4).setRotation(c.id * 2.4);
      return this.add.image(c.x, c.y, c.kind === 0 ? 'cheese' : 'smoke').setDepth(c.kind === 0 ? 4 : 12);
    }, (sp, c) => {
      const life = c.kind === 0 ? TUNING.raclette.cheeseLife : c.kind === 1 ? TUNING.toilet.life : TUNING.paint.life;
      const radius = c.kind === 0 ? TUNING.raclette.cheeseRadius : c.kind === 1 ? TUNING.toilet.radius : TUNING.paint.radius;
      const grow = Math.min(1, c.age / 0.4);
      const fade = c.age > life - 2 ? Math.max(0, (life - c.age) / 2) : 1;
      if (c.kind === 0) sp.setPosition(c.x, c.y).setDisplaySize(radius * 2.15 * grow, radius * 2.15 * grow).setAlpha(fade);
      else if (c.kind === 2) sp.setPosition(c.x, c.y).setDisplaySize(radius * 2.3 * grow, radius * 2.3 * grow).setAlpha(0.92 * fade);
      else {
        // Smoke rolls slowly and breathes; a bit bigger than the area that hurts, as it is soft at the edges.
        const k = radius * 2.5 * grow * (1 + Math.sin(time / 380 + c.id) * 0.04);
        sp.setPosition(c.x, c.y).setDisplaySize(k, k).setRotation(time / 2600 + c.id).setAlpha(0.85 * fade);
      }
    }, (sp) => this.retire(sp, 'fade'));
    // Crates tossed by barges: an arc through the air from the barge, then bobbing like any crate.
    const T = TUNING.traffic;
    // Pushed in from the towpath: someone shoving it, then it slides into the water.
    this.syncGroup(this.dropSprites, items.drops, (d) => {
      const crate = this.makeCrateSprite(d.fromX, d.fromY).setData('landed', false);
      if (d.kind === 1) {
        const face = Math.atan2(d.y - d.fromY, d.x - d.fromX);
        const back = 26;
        const man = this.add.image(d.fromX - Math.cos(face) * back, d.fromY - Math.sin(face) * back, `walker_${d.id % 10}`).setScale(2.6 / STREET_ART_SCALE).setRotation(face).setDepth(13);
        // he leans in, then stays a moment to watch, and goes
        this.tweens.add({ targets: man, x: d.fromX - Math.cos(face) * 8, y: d.fromY - Math.sin(face) * 8, duration: T.tossTime * 1000, ease: 'Quad.easeOut' });
        this.tweens.add({ targets: man, alpha: 0, delay: 2600, duration: 600, onComplete: () => man.destroy() });
      }
      return crate;
    }, (s, d) => {
      const k = Math.min(1, d.age / T.tossTime);
      s.setData('age', d.age);
      if (k < 1) {
        this.tweens.killTweensOf(s);
        if (d.kind === 1) {
          // sliding off the towpath into the water
          const e = k * k;
          s.setPosition(d.fromX + (d.x - d.fromX) * e, d.fromY + (d.y - d.fromY) * e).setRotation(k * 0.6).setScale(WORLD_ART_SCALE * (1 + Math.sin(k * Math.PI) * 0.15));
        } else {
          s.setPosition(d.fromX + (d.x - d.fromX) * k, d.fromY + (d.y - d.fromY) * k).setRotation(k * Math.PI * 3);
          s.setScale(WORLD_ART_SCALE * (1 + Math.sin(k * Math.PI) * 0.8));
        }
      } else {
        if (!s.getData('landed')) {
          s.setData('landed', true).setScale(WORLD_ART_SCALE);
          this.fx.splash(d.x, d.y, 0.6);
          this.tweens.add({ targets: s, scale: { from: 0.92 * WORLD_ART_SCALE, to: 1.08 * WORLD_ART_SCALE }, duration: 650, yoyo: true, repeat: -1 });
        }
        s.setPosition(d.x, d.y).setRotation(Math.sin(time / 500 + d.id) * 0.12);
        if (d.age > T.dropLife - 2) s.setAlpha((T.dropLife - d.age) / 2);
      }
    }, (s) => {
      if ((s.getData('age') ?? 0) < T.dropLife - 0.3) {
        // Taken: it breaks like any crate
        this.fx.crate(s.x, s.y);
        this.raceAudio.at('crate', s.x, s.y);
        this.tweens.killTweensOf(s);
        s.destroy();
      } else this.retire(s, 'fade');
    });
    this.syncGroup(this.puddleSprites, items.puddles, (p) => {
      // Glue lands: from the glue item or a silicone gun shot.
      this.fx.glue(p.x, p.y);
      this.raceAudio.at('glue', p.x, p.y);
      return this.add.image(p.x, p.y, 'glue').setDepth(4);
    }, (s, p) => {
      const grow = Math.min(1, p.age / 0.3);
      s.setPosition(p.x, p.y).setDisplaySize(120 * grow, 120 * grow).setAlpha(p.age > 12 ? (15 - p.age) / 3 : 1);
    }, (s) => this.retire(s, 'fade'));
  }

  private syncGroup<T extends { id: number }>(map: Map<number, Sprite>, list: T[], create: (e: T) => Sprite, update: (s: Sprite, e: T) => void, retire: (s: Sprite) => void): void {
    const seen = new Set<number>();
    for (const e of list) {
      seen.add(e.id);
      let s = map.get(e.id);
      if (!s) {
        s = create(e);
        map.set(e.id, s);
      }
      update(s, e);
    }
    for (const [id, s] of map) {
      if (!seen.has(id)) {
        map.delete(id);
        retire(s);
      }
    }
  }

  /** A projectile that has ended: volunteers bob and wave in the water, the rest fade. */
  private retire(s: Sprite, how: 'wave' | 'fade'): void {
    if (how === 'wave') {
      this.tweens.add({ targets: s, y: s.y + 6, rotation: s.rotation + 0.6, duration: 350, yoyo: true, repeat: 2 });
      this.tweens.add({ targets: s, alpha: 0, delay: 900, duration: 500, onComplete: () => s.destroy() });
    } else this.tweens.add({ targets: s, alpha: 0, duration: 300, onComplete: () => s.destroy() });
  }

  private handleEvent(e: RaceEvent): void {
    this.events.emit('race-event', e);
    this.raceAudio.onEvent(e);
    this.hazardView?.onEvent(e);
    const player = this.sim.player!;
    switch (e.type) {
      case 'shieldPop': {
        // The head of foam bursts.
        const r = this.sim.racers[e.racer];
        this.sparks.setParticleTint(0xfff3c4);
        this.sparks.emitParticleAt(r.x, r.y, 26);
        this.fx.splash(r.x, r.y, 0.9);
        break;
      }
      case 'splat':
        if (e.racer === player.id && !this.reduceShake()) this.cameras.main.shake(140, 0.004);
        break;
      case 'hit': {
        const r = this.sim.racers[e.racer];
        if (e.source === 'toilet') {
          this.fx.toxic(r.x, r.y); // breathing the smoke: a green puff, no jolt
          break;
        }
        if (e.source === 'raclette') this.fx.cheese(r.x, r.y);
        // A thrown volunteer bursts on impact, screaming.
        if (e.source === 'volunteer') {
          this.hazardView?.gore(r.x, r.y, 40, 16);
          this.raceAudio.at('scream', r.x, r.y, 1.1);
        }
        this.sparks.setParticleTint(e.source === 'bank' ? 0xcccccc : 0xfff2a0);
        this.sparks.emitParticleAt(r.x, r.y, 14);
        if (e.source !== 'bank') this.fx.splash(r.x, r.y, 0.8);
        if (e.racer === player.id && !this.reduceShake()) this.cameras.main.shake(220, 0.007);
        // A short hit pause when the player is hit by an item, or lands a hit.
        if (e.source !== 'bank' && (e.racer === player.id || e.by === player.id)) this.hitPause = 0.07;
        break;
      }
      case 'sunk': {
        const r = this.sim.racers[e.racer];
        this.sparks.setParticleTint(0x9fd8ff);
        this.sparks.emitParticleAt(r.x, r.y, 24);
        this.fx.sink(r.x, r.y);
        if (e.racer === player.id) this.hitPause = 0.12;
        break;
      }
      case 'respawn': {
        const r = this.sim.racers[e.racer];
        this.fx.splash(r.x, r.y, 1.2);
        break;
      }
      case 'heal': {
        const r = this.sim.racers[e.racer];
        this.sparks.setParticleTint(0x7dff8a);
        this.sparks.emitParticleAt(r.x, r.y, 18);
        this.fx.heal(r.x, r.y);
        break;
      }
      case 'crate': {
        const c = this.sim.items.crates.find((k) => k.id === e.id);
        if (c && e.taken) this.fx.crate(c.x, c.y);
        break;
      }
      case 'boost': {
        const r = this.sim.racers[e.racer];
        this.fx.puff(r.x - Math.cos(r.heading) * r.boat.size.length * 0.5, r.y - Math.sin(r.heading) * r.boat.size.length * 0.5);
        break;
      }
      case 'itemUsed': {
        const r = this.sim.racers[e.racer];
        if (e.racer === player.id && e.item === 'mushroom') this.tripT = TUNING.mushroom.duration;
        if (e.item === 'champagne') {
          // The cork pops and the foam sprays everywhere.
          this.sparks.setParticleTint(0xfff6d0);
          this.sparks.emitParticleAt(r.x, r.y, 30);
          this.fx.splash(r.x, r.y, 0.6);
        }
        if (e.item === 'blackout') {
          // Sparks on every boat that lost its controls
          for (const o of this.sim.racers) {
            if (o.id === e.racer || !hasEffect(o, 'blackout')) continue;
            this.sparks.setParticleTint(0xffe04a);
            this.sparks.emitParticleAt(o.x, o.y, 14);
          }
        }
        if (e.item === 'toilet') this.fx.toxic(r.x - Math.cos(r.heading) * r.boat.size.length * 0.5, r.y - Math.sin(r.heading) * r.boat.size.length * 0.5);
        if (e.item === 'whitePowder') this.fx.puff(r.x - Math.cos(r.heading) * r.boat.size.length * 0.5, r.y - Math.sin(r.heading) * r.boat.size.length * 0.5);
        break;
      }
      case 'bump': {
        const a = this.sim.racers[e.a];
        this.sparks.setParticleTint(0xffffff);
        this.sparks.emitParticleAt((a.x + this.sim.racers[e.b].x) / 2, (a.y + this.sim.racers[e.b].y) / 2, 4);
        break;
      }
      case 'raceOver':
        if (!this.online) this.finish(); // online, the server sends the results
        break;
      default:
        break;
    }
  }

  /**
   * Mushrooms: for a while the screen cycles through colours and bulges. Needs WebGL for the
   * colour/lens effects; elsewhere only the HUD's colour wash and the zoom breathing show.
   */
  /** Drunk (beer): the camera sways, eased in and out (the HUD adds the green waves). */
  private updateDrunk(time: number, dt: number): void {
    const e = this.sim.player?.effects.find((x) => x.kind === 'drunk' && x.remaining > 0);
    const target = e ? Math.min(1, e.remaining / 0.8) : 0;
    this.drunk += (target - this.drunk) * (1 - Math.exp(-dt * 3));
    if (this.drunk < 0.005) this.drunk = 0;
    const sway = this.reduceShake() ? 0.3 : 1;
    this.cameras.main.setRotation(Math.sin(time / 650) * 0.035 * this.drunk * sway);
  }

  private updateTrip(time: number, dt: number): void {
    this.tripT = Math.max(0, this.tripT - dt);
    const target = this.tripT > 0 ? 1 : 0;
    this.trip += (target - this.trip) * (1 - Math.exp(-dt * (target ? 2.5 : 1.2)));
    if (this.trip < 0.01) this.trip = 0;

    const cam = this.cameras.main;
    const webgl = this.renderer.type === Phaser.WEBGL;
    if (this.trip > 0 && webgl && !this.tripFx) {
      this.tripFx = { colors: cam.postFX.addColorMatrix(), barrel: cam.postFX.addBarrel(1) };
    }
    if (this.trip === 0 && this.tripFx) {
      cam.postFX.clear();
      this.tripFx = null;
    }
    if (this.tripFx) {
      const fx = this.tripFx;
      fx.colors.reset();
      fx.colors.hue((time * 0.06) % 360, true); // a full colour cycle about every 6 s
      fx.colors.saturate(this.trip * 0.8, true);
      fx.colors.alpha = this.trip; // fades in and out
      fx.barrel.amount = 1 + Math.sin(time / 600) * 0.14 * this.trip;
    }
  }

  private reduceShake(): boolean {
    return options.reducedShake;
  }

  /** Hit pauses only offline: an online race doesn't stop for anyone. */
  private set hitPause(seconds: number) {
    if (!this.online && !this.reduceShake()) this.freeze = seconds;
  }

  private finish(): void {
    if (this.over) return;
    this.over = true;
    const rows = this.sim.results().map((r) => ({
      name: r.racer.isPlayer ? t('you') : r.racer.name,
      boatId: r.racer.boat.id,
      color: r.racer.color,
      time: r.time,
      finished: r.finished,
      isPlayer: r.racer.isPlayer,
    }));
    // A championship race counts for the standings.
    let cup: CupState | undefined;
    if (this.cupKeys && activeCup) {
      const keys = this.cupKeys;
      const boats = new Map(activeCup.boats.map((b) => [b.key, b]));
      cup = activeCup.state = scoreRace(activeCup.state, this.sim.results().map((r) => ({ ...boats.get(keys[r.racer.id])! })));
    }
    this.time.delayedCall(400, () => {
      this.scene.start('Results', { rows, trackId: this.sim.track.def.id, selection: this.selection, cup, you: 'you' });
    });
  }

  private drawDebug(): void {
    const g = this.debugGfx!;
    const t = this.sim.track;
    g.lineStyle(2, 0xff00ff, 0.8);
    g.strokePoints(t.samples.map((s) => new Phaser.Math.Vector2(s.x, s.y)), true, true);
    g.lineStyle(2, 0xffff00, 0.6);
    g.strokePoints(t.samples.map((s, i) => new Phaser.Math.Vector2(s.x + s.nx * t.racingOffset[i] * s.width / 2, s.y + s.ny * t.racingOffset[i] * s.width / 2)), true, true);
  }
}
