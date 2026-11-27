import Phaser from 'phaser';
import { DEBUG } from '../config';
import { PointerController } from '../control/PointerController';
import { type Difficulty } from '../data/difficulty';
import { loadTrack } from '../data/tracks';
import { speedOf } from '../physics/BoatPhysics';
import { lerp } from '../physics/math';
import { RaceSimulation, STEP } from '../race/RaceSimulation';
import type { RaceEvent } from '../race/types';
import type { Selection } from '../session';
import { BoatView } from '../view/BoatView';
import { TrackRenderer } from '../view/TrackRenderer';

type Sprite = Phaser.GameObjects.Image;

export class RaceScene extends Phaser.Scene {
  sim!: RaceSimulation;
  pointer!: PointerController;
  selection!: Selection;
  private views: BoatView[] = [];
  private trackView!: TrackRenderer;
  private accumulator = 0;
  private crateSprites = new Map<number, Sprite>();
  private volSprites = new Map<number, Sprite>();
  private drillSprites = new Map<number, Sprite>();
  private puddleSprites = new Map<number, Sprite>();
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
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

    this.trackView = new TrackRenderer(this, track);
    const wake = this.add.particles(0, 0, 'wake', {
      lifespan: 900, speed: 0, scale: { start: 0.3, end: 1.3 }, alpha: { start: 0.4, end: 0 }, emitting: false,
    }).setDepth(5);
    this.sparks = this.add.particles(0, 0, 'spark', {
      lifespan: 500, speed: { min: 80, max: 260 }, scale: { start: 1.2, end: 0 }, emitting: false,
    }).setDepth(40);

    for (const c of this.sim.items.crates) {
      const s = this.add.image(c.x, c.y, 'crate').setDepth(8);
      this.tweens.add({ targets: s, scale: { from: 0.9, to: 1.1 }, duration: 650, yoyo: true, repeat: -1, delay: Math.random() * 600 });
      this.crateSprites.set(c.id, s);
    }
    for (const r of this.sim.racers) this.views.push(new BoatView(this, r, wake));

    const cam = this.cameras.main;
    cam.setBackgroundColor(track.def.colors.land);
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

  /** Where the player's boat is on screen, in game pixels. */
  private playerScreen(): { x: number; y: number } {
    const cam = this.cameras.main;
    const v = this.views[this.sim.player!.id];
    return { x: (v.x - cam.worldView.x) * cam.zoom, y: (v.y - cam.worldView.y) * cam.zoom };
  }

  update(time: number): void {
    // Raw frame time: Phaser's smoothed `delta` would slow the simulation down at low frame rates.
    const dt = Math.min(this.game.loop.rawDelta / 1000, 0.25);
    this.accumulator += dt;
    while (this.accumulator >= STEP && this.sim.phase !== 'over') {
      for (const v of this.views) v.snapshot();
      this.sim.step(STEP);
      this.accumulator -= STEP;
    }
    const alpha = this.sim.phase === 'over' ? 1 : this.accumulator / STEP;
    for (let i = 0; i < this.views.length; i++) this.views[i].render(alpha, time, dt);
    this.syncEntities(time);
    this.trackView.update(time);
    this.updateCamera(dt);
    for (const e of this.sim.takeEvents()) this.handleEvent(e);
    if (this.fpsText) this.fpsText.setText(`${this.game.loop.actualFps.toFixed(0)} fps`);
  }

  private updateCamera(dt: number): void {
    const cam = this.cameras.main;
    const p = this.sim.player!;
    const v = this.views[p.id];
    const tx = v.x + p.vx * 0.35;
    const ty = v.y + p.vy * 0.35;
    const k = 1 - Math.exp(-dt * 5);
    this.camX = lerp(this.camX, tx, k);
    this.camY = lerp(this.camY, ty, k);
    const zoom = lerp(0.95, 0.72, Math.min(1, speedOf(p) / 440));
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
    }, (s) => this.retire(s, 'wave'));
    this.syncGroup(this.drillSprites, items.drills, (d) => this.add.image(d.x, d.y, 'drill').setDepth(14), (s, d) => {
      s.setPosition(d.x, d.y).setRotation(d.heading);
    }, (s) => this.retire(s, 'fade'));
    this.syncGroup(this.puddleSprites, items.puddles, (p) => this.add.image(p.x, p.y, 'glue').setDepth(4), (s, p) => {
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
    const player = this.sim.player!;
    switch (e.type) {
      case 'hit': {
        const r = this.sim.racers[e.racer];
        this.sparks.setParticleTint(e.source === 'bank' ? 0xcccccc : 0xfff2a0);
        this.sparks.emitParticleAt(r.x, r.y, 14);
        if (e.racer === player.id && !this.reduceShake()) this.cameras.main.shake(220, 0.007);
        break;
      }
      case 'sunk': {
        const r = this.sim.racers[e.racer];
        this.sparks.setParticleTint(0x9fd8ff);
        this.sparks.emitParticleAt(r.x, r.y, 24);
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

  private reduceShake(): boolean {
    return false;
  }

  private finish(): void {
    if (this.over) return;
    this.over = true;
    const rows = this.sim.results().map((r) => ({
      name: r.racer.name,
      boat: r.racer.boat.name,
      color: r.racer.color,
      time: r.time,
      finished: r.finished,
      isPlayer: r.racer.isPlayer,
    }));
    this.time.delayedCall(400, () => {
      this.scene.start('Results', { rows, trackName: this.sim.track.def.name, selection: this.selection });
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
