import Phaser from 'phaser';
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
import type { Selection } from '../session';
import { BoatView } from '../view/BoatView';
import { MapRenderer, type SceneryData } from '../view/MapRenderer';
import { TrackRenderer } from '../view/TrackRenderer';
import { options } from '../options';
import { Fx } from '../view/fx';
import { RaceAudio } from '../view/raceAudio';
import { audio } from '../audio/AudioManager';

type Sprite = Phaser.GameObjects.Image;

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
  /** 0..1: how psychedelic the screen is (mushrooms). The HUD reads this for its colour wash. */
  trip = 0;
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

  init(data: Selection): void {
    this.selection = data;
    this.views = [];
    this.accumulator = 0;
    this.over = false;
    this.crateSprites.clear();
    this.volSprites.clear();
    this.drillSprites.clear();
    this.puddleSprites.clear();
    this.fakeSprites.clear();
    this.blobSprites.clear();
    this.trip = 0;
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
    const track = loadTrack(sel.trackId);
    if (DEBUG.laps) track.def.laps = DEBUG.laps;
    this.pointer = new PointerController(this, () => this.playerScreen());
    this.sim = new RaceSimulation({
      track,
      playerBoat: sel.boatId,
      difficulty: sel.difficulty as Difficulty,
      seed: DEBUG.seed ?? (Date.now() & 0xffff),
      aiCount: DEBUG.noAI ? 0 : 3,
      forcedItem: DEBUG.item,
      playerController: this.pointer,
    });

    this.trackView = track.def.scenery
      ? new MapRenderer(this, track, this.cache.json.get(track.def.scenery) as SceneryData)
      : new TrackRenderer(this, track);
    const wake = this.add.particles(0, 0, 'wake', {
      lifespan: 900, speed: 0, scale: { start: 0.3, end: 1.3 }, alpha: { start: 0.4, end: 0 }, emitting: false,
    }).setDepth(5);
    this.sparks = this.add.particles(0, 0, 'spark', {
      lifespan: 500, speed: { min: 80, max: 260 }, scale: { start: 1.2, end: 0 }, emitting: false,
    }).setDepth(40);

    for (const c of this.sim.items.crates) this.crateSprites.set(c.id, this.makeCrateSprite(c.x, c.y));
    for (const r of this.sim.racers) this.views.push(new BoatView(this, r, wake));
    this.fx = new Fx(this);
    this.raceAudio = new RaceAudio(this, this.sim);
    audio.muteEngines(false);
    audio.duckMusic(false);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.raceAudio.destroy());

    const cam = this.cameras.main;
    if (!track.def.scenery) cam.setBackgroundColor(track.def.colors.land);
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
    const s = this.add.image(x, y, 'crate').setDepth(8);
    this.tweens.add({ targets: s, scale: { from: 0.9, to: 1.1 }, duration: 650, yoyo: true, repeat: -1, delay: Math.random() * 600 });
    return s;
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
    if (this.freeze > 0) this.freeze -= dt; // hit pause: time stands still for a moment
    else this.accumulator += dt;
    while (this.accumulator >= STEP && this.sim.phase !== 'over') {
      for (const v of this.views) v.snapshot();
      this.sim.step(STEP);
      this.accumulator -= STEP;
    }
    const alpha = this.sim.phase === 'over' ? 1 : this.accumulator / STEP;
    for (let i = 0; i < this.views.length; i++) this.views[i].render(alpha, time, dt);
    this.syncEntities(time);
    this.trackView.update(time);
    this.updateTrip(time, dt);
    this.raceAudio.update(dt);
    this.updateCamera(dt, time);
    for (const e of this.sim.takeEvents()) this.handleEvent(e);
    if (this.fpsText) this.fpsText.setText(`${this.game.loop.actualFps.toFixed(0)} fps`);
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

  private syncEntities(time: number): void {
    const items = this.sim.items;
    for (const c of items.crates) {
      const s = this.crateSprites.get(c.id)!;
      s.setVisible(c.respawn <= 0).setRotation(Math.sin(time / 500 + c.id) * 0.12);
    }
    this.syncGroup(this.volSprites, items.volunteers, (v) => this.add.image(v.x, v.y, 'volunteer').setDepth(14), (s, v) => {
      s.setPosition(v.x, v.y).setRotation(v.heading + Math.sin(v.age * 24) * 0.35);
    }, (s) => {
      // A volunteer lands in the water (after a hit or a miss).
      this.fx.splash(s.x, s.y, 0.7);
      this.raceAudio.at('splash', s.x, s.y, 0.6);
      this.retire(s, 'wave');
    });
    this.syncGroup(this.drillSprites, items.drills, (d) => this.add.image(d.x, d.y, 'drill').setDepth(14), (s, d) => {
      s.setPosition(d.x, d.y).setRotation(d.heading);
    }, (s) => this.retire(s, 'fade'));
    // Fake crates are drawn exactly like real ones (same sprite, same bobbing).
    this.syncGroup(this.fakeSprites, items.fakeCrates, (f) => this.makeCrateSprite(f.x, f.y), (s, f) => {
      s.setPosition(f.x, f.y).setRotation(Math.sin(time / 500 + f.id) * 0.12);
    }, (s) => {
      this.fx.crate(s.x, s.y);
      this.retire(s, 'fade');
    });
    this.syncGroup(this.blobSprites, items.blobs, (b) => this.add.image(b.x, b.y, 'blob').setDepth(14), (s, b) => {
      s.setPosition(b.x, b.y).setRotation(b.heading).setScale(1 + Math.sin(b.age * 30) * 0.08);
    }, (s) => this.retire(s, 'fade'));
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
    const player = this.sim.player!;
    switch (e.type) {
      case 'hit': {
        const r = this.sim.racers[e.racer];
        this.sparks.setParticleTint(e.source === 'bank' ? 0xcccccc : 0xfff2a0);
        this.sparks.emitParticleAt(r.x, r.y, 14);
        if (e.source !== 'bank') this.fx.splash(r.x, r.y, 0.8);
        if (e.racer === player.id && !this.reduceShake()) this.cameras.main.shake(220, 0.007);
        // A short hit pause when the player is hit by an item, or lands a hit.
        if (e.source !== 'bank' && (e.racer === player.id || e.by === player.id) && !this.reduceShake()) this.freeze = 0.07;
        break;
      }
      case 'sunk': {
        const r = this.sim.racers[e.racer];
        this.sparks.setParticleTint(0x9fd8ff);
        this.sparks.emitParticleAt(r.x, r.y, 24);
        this.fx.sink(r.x, r.y);
        if (e.racer === player.id && !this.reduceShake()) this.freeze = 0.12;
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
        if (e.item === 'whitePowder' || e.item === 'bigBag') this.fx.puff(r.x - Math.cos(r.heading) * r.boat.size.length * 0.5, r.y - Math.sin(r.heading) * r.boat.size.length * 0.5);
        break;
      }
      case 'bump': {
        const a = this.sim.racers[e.a];
        this.sparks.setParticleTint(0xffffff);
        this.sparks.emitParticleAt((a.x + this.sim.racers[e.b].x) / 2, (a.y + this.sim.racers[e.b].y) / 2, 4);
        break;
      }
      case 'raceOver':
        this.finish();
        break;
      default:
        break;
    }
  }

  /**
   * Mushrooms: for a while the screen cycles through colours and bulges. Needs WebGL for the
   * colour/lens effects; elsewhere only the HUD's colour wash and the zoom breathing show.
   */
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
    this.time.delayedCall(400, () => {
      this.scene.start('Results', { rows, trackId: this.sim.track.def.id, selection: this.selection });
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
