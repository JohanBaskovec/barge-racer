import Phaser from 'phaser';
import { TUNING } from '../data/items';
import type { Angler, Critter, HazardSystem } from '../race/hazards';
import type { RaceSimulation } from '../race/RaceSimulation';
import type { RaceEvent } from '../race/types';
import { STREET_ART_SCALE } from './streetArt';
import type { RaceAudio } from './raceAudio';

type Img = Phaser.GameObjects.Image;

/**
 * Draws the hazards (hazards.ts): the police boat with its flashing lights and its bullets, anglers
 * with their lines, flocks of ducks, rowing boats and swimmers, and the mess when a boat runs into
 * them. Reads the simulation's state each frame, like the rest of the view.
 */
export class HazardView {
  private police: Phaser.GameObjects.Container;
  private policeHull: Img;
  private lights: Phaser.GameObjects.Graphics;
  private sirenT = 0;
  private bullets = new Map<number, Img>();
  private anglers = new Map<number, { man: Img; line: Phaser.GameObjects.Graphics }>();
  private critters = new Map<number, { box: Phaser.GameObjects.Container; parts: Img[]; kind: number }>();
  private blood: Phaser.GameObjects.Particles.ParticleEmitter;
  private gibs: Phaser.GameObjects.Particles.ParticleEmitter;
  private feathers: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(private scene: Phaser.Scene, private sim: RaceSimulation, private audio: RaceAudio) {
    const C = TUNING.cops;
    this.policeHull = scene.add.image(0, 0, 'police').setDisplaySize(C.length, C.width);
    this.lights = scene.add.graphics();
    this.police = scene.add.container(0, 0, [this.policeHull, this.lights]).setDepth(10.5).setVisible(false);
    this.blood = scene.add.particles(0, 0, 'droplet', {
      lifespan: 700, speed: { min: 60, max: 260 }, scale: { start: 1.1, end: 0.3 }, tint: [0xb3121c, 0x8a0a12, 0xd8262f], gravityY: 0, emitting: false,
    }).setDepth(15);
    this.gibs = scene.add.particles(0, 0, 'gib', {
      lifespan: 900, speed: { min: 80, max: 240 }, scale: { start: 0.45, end: 0.25 }, rotate: { min: 0, max: 360 }, alpha: { start: 1, end: 0 }, emitting: false,
    }).setDepth(15);
    this.feathers = scene.add.particles(0, 0, 'feather', {
      lifespan: 1600, speed: { min: 40, max: 180 }, scale: { start: 0.5, end: 0.35 }, rotate: { min: 0, max: 360 }, alpha: { start: 1, end: 0 }, emitting: false,
    }).setDepth(15);
  }

  private get hz(): HazardSystem {
    return this.sim.hazards;
  }

  update(time: number, dt: number): void {
    this.updatePolice(time, dt);
    this.sync(this.bullets, this.hz.bullets, (b) => {
      const p = this.hz.police;
      if (p) this.audio.at('gunshot', p.x, p.y, 0.9);
      return this.scene.add.image(b.x, b.y, 'bullet').setDisplaySize(16, 4).setDepth(14);
    }, (img, b) => img.setPosition(b.x, b.y).setRotation(b.heading), (img) => img.destroy());
    this.sync(this.anglers, this.hz.anglers, (a) => this.makeAngler(a), (v, a) => this.drawAngler(v, a, time), (v) => {
      this.scene.tweens.add({ targets: [v.man, v.line], alpha: 0, duration: 600, onComplete: () => (v.man.destroy(), v.line.destroy()) });
    });
    this.sync(this.critters, this.hz.critters, (c) => this.makeCritter(c), (v, c) => this.drawCritter(v, c, time), (v) => v.box.destroy());
  }

  /** Police lights, the siren, and the boat fading in and out. */
  private updatePolice(time: number, dt: number): void {
    const p = this.hz.police;
    const shown = !!p && p.phase !== 'warn';
    this.police.setVisible(shown);
    if (!p || !shown) return;
    const fade = p.phase === 'leave' ? Math.max(0, 1 - p.t / 1.6) : p.phase === 'chase' ? Math.min(1, p.t / 0.5) : 1;
    this.police.setPosition(p.x, p.y).setRotation(p.heading).setAlpha(fade);
    const g = this.lights.clear();
    const blink = Math.floor(time / 140) % 2;
    // the light bar on the wheelhouse roof (local coords: x along the boat), and a glow on the water
    g.fillStyle(blink ? 0xff2a2a : 0x2a6bff, 0.25).fillCircle(5, 0, 26);
    g.fillStyle(0xff3030, blink ? 1 : 0.35).fillRect(3, -9, 4, 8);
    g.fillStyle(0x3a7bff, blink ? 0.35 : 1).fillRect(3, 1, 4, 8);
    if (p.phase === 'chase' || p.phase === 'ticket') {
      this.sirenT -= dt;
      if (this.sirenT <= 0) {
        this.sirenT = 1.1;
        this.audio.at('siren', p.x, p.y, 0.9);
      }
    }
  }

  private makeAngler(a: Angler): { man: Img; line: Phaser.GameObjects.Graphics } {
    const man = this.scene.add.image(0, 0, `angler_${a.id % 3}`).setScale((2.2 * 1) / STREET_ART_SCALE).setDepth(1.8);
    const line = this.scene.add.graphics().setDepth(11);
    return { man, line };
  }

  private drawAngler(v: { man: Img; line: Phaser.GameObjects.Graphics }, a: Angler, time: number): void {
    const g = this.hz.anglerGeometry(a);
    // Facing the water, the rod reaching out over it.
    const face = g.heading - (a.side * Math.PI) / 2;
    v.man.setPosition(g.x, g.y).setRotation(face);
    if (!v.man.getData('cast')) {
      v.man.setData('cast', true);
      this.audio.at('cast', g.x, g.y, 0.8);
    }
    const k = 2.2 / 1; // drawn 2.2 x its street size: the rod tip is 12 px ahead, 2 px aside, of the middle
    const tipX = g.x + Math.cos(face) * 12 * k - Math.sin(face) * -2 * k;
    const tipY = g.y + Math.sin(face) * 12 * k + Math.cos(face) * -2 * k;
    const line = v.line.clear();
    const T = this.sim.racers[a.target];
    const end = a.hooked ? { x: T.x, y: T.y } : g.tip;
    // A light line, sagging a little, and the float.
    const mx = (tipX + end.x) / 2 + Math.sin(time / 300) * 4, my = (tipY + end.y) / 2 + 6;
    line.lineStyle(2, 0xffffff, 0.85).beginPath().moveTo(tipX, tipY);
    for (let i = 1; i <= 12; i++) {
      const t = i / 12;
      line.lineTo((1 - t) * (1 - t) * tipX + 2 * (1 - t) * t * mx + t * t * end.x, (1 - t) * (1 - t) * tipY + 2 * (1 - t) * t * my + t * t * end.y);
    }
    line.strokePath();
    if (!a.hooked) {
      line.fillStyle(0xff3b3b, 1).fillCircle(end.x, end.y, 5);
      line.fillStyle(0xffffff, 1).fillCircle(end.x, end.y, 2.2);
      line.lineStyle(1.5, 0xffffff, 0.4).strokeCircle(end.x, end.y, 9 + Math.sin(time / 200) * 2);
    }
  }

  private makeCritter(c: Critter): { box: Phaser.GameObjects.Container; parts: Img[]; kind: number } {
    const parts: Img[] = [];
    let seed = c.id * 7919;
    const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    if (c.kind === 0) {
      // A flock of ducks, bunched up.
      const n = 4 + Math.floor(rnd() * 4);
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * 28;
        parts.push(this.scene.add.image(Math.cos(a) * d, Math.sin(a) * d, `duck_${rnd() < 0.5 ? 0 : 1}`).setDisplaySize(18, 12).setRotation((rnd() - 0.5) * 1.2).setData('y0', Math.sin(a) * d));
      }
    } else if (c.kind === 1) {
      parts.push(this.scene.add.image(0, 0, 'rowboat_0').setDisplaySize(96, 64));
    } else {
      const n = 2 + Math.floor(rnd() * 2);
      for (let i = 0; i < n; i++) parts.push(this.scene.add.image((rnd() - 0.5) * 34, (rnd() - 0.5) * 34, `swimmer_${Math.floor(rnd() * 4)}_0`).setDisplaySize(26, 26).setData('cap', Math.floor(rnd() * 4)));
    }
    const box = this.scene.add.container(0, 0, parts).setDepth(6);
    return { box, parts, kind: c.kind };
  }

  private drawCritter(v: { box: Phaser.GameObjects.Container; parts: Img[]; kind: number }, c: Critter, time: number): void {
    const p = this.hz.critterPos(c);
    const fade = Math.min(1, c.age / 0.5, (TUNING.critters.life - c.age) / 1);
    v.box.setPosition(p.x, p.y).setRotation(p.heading).setAlpha(Math.max(0, fade));
    if (v.kind === 0) v.parts.forEach((d, i) => d.setY((d.getData('y0') as number) + Math.sin(time / 400 + i * 1.7) * 1.5));
    else if (v.kind === 1) v.parts[0].setTexture(`rowboat_${Math.floor(time / 420 + c.id) % 2}`);
    else v.parts.forEach((s, i) => s.setTexture(`swimmer_${s.getData('cap')}_${Math.floor(time / 350 + i) % 2}`));
  }

  /** A boat ran into birds, rowers or swimmers: blood, bits (feathers for birds), a stain on the water. */
  onEvent(e: RaceEvent): void {
    if (e.type !== 'splat') return;
    const stain = this.scene.add.image(e.x, e.y, 'bloodSplat').setDisplaySize(120, 120).setDepth(4).setRotation(Math.random() * Math.PI * 2).setAlpha(0.9);
    this.scene.tweens.add({ targets: stain, alpha: 0, delay: 4000, duration: 3000, onComplete: () => stain.destroy() });
    this.blood.emitParticleAt(e.x, e.y, 34);
    this.gibs.emitParticleAt(e.x, e.y, e.kind === 0 ? 6 : 14);
    if (e.kind === 0) this.feathers.emitParticleAt(e.x, e.y, 22);
    this.audio.at('splat', e.x, e.y, 1.1);
  }

  private sync<T extends { id: number }, V>(map: Map<number, V>, list: T[], make: (e: T) => V, draw: (v: V, e: T) => void, drop: (v: V) => void): void {
    const seen = new Set<number>();
    for (const e of list) {
      seen.add(e.id);
      let v = map.get(e.id);
      if (!v) map.set(e.id, (v = make(e)));
      draw(v, e);
    }
    for (const [id, v] of map) {
      if (seen.has(id)) continue;
      drop(v);
      map.delete(id);
    }
  }
}
