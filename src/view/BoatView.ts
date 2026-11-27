import Phaser from 'phaser';
import { hasEffect } from '../effects/effects';
import { angleDiff } from '../physics/math';
import { speedOf } from '../physics/BoatPhysics';
import { createBoatSprite } from './boatSprite';
import type { Racer } from '../race/types';

/** Sprite, shadow, saw, boost and damage overlays for one racer. */
export class BoatView {
  readonly container: Phaser.GameObjects.Container;
  private shadow: Phaser.GameObjects.Image;
  private saw: Phaser.GameObjects.Image;
  private boost: Phaser.GameObjects.Graphics;
  private smoke: Phaser.GameObjects.Graphics;
  private bar: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text | null = null;
  private prev: { x: number; y: number; h: number };
  x: number;
  y: number;
  heading: number;
  private wakeTimer = 0;

  constructor(scene: Phaser.Scene, private r: Racer, private wake: Phaser.GameObjects.Particles.ParticleEmitter) {
    const { length: L, width: W } = r.boat.size;
    this.shadow = scene.add.image(3, 5, 'shadow').setDisplaySize(L * 1.05, W * 1.1);
    const hull = createBoatSprite(scene, r.boat, r.color);
    this.saw = scene.add.image(L / 2 + 6, 0, 'saw').setOrigin(0, 0.5).setVisible(false);
    this.boost = scene.add.graphics();
    this.smoke = scene.add.graphics();
    this.bar = scene.add.graphics();
    this.container = scene.add.container(r.x, r.y, [this.shadow, this.boost, hull, this.saw, this.smoke]).setDepth(10);
    this.bar.setDepth(30);
    if (r.isPlayer) {
      this.label = scene.add.text(0, 0, '▼', { fontSize: '26px', color: '#ffffff', stroke: '#000', strokeThickness: 4, resolution: 2 }).setOrigin(0.5).setDepth(31);
    }
    this.x = r.x;
    this.y = r.y;
    this.heading = r.heading;
    this.prev = { x: r.x, y: r.y, h: r.heading };
  }

  /** Call right before each simulation step. */
  snapshot(): void {
    this.prev = { x: this.r.x, y: this.r.y, h: this.r.heading };
  }

  render(alpha: number, time: number, dt: number): void {
    const r = this.r;
    this.x = this.prev.x + (r.x - this.prev.x) * alpha;
    this.y = this.prev.y + (r.y - this.prev.y) * alpha;
    this.heading = this.prev.h + angleDiff(r.heading, this.prev.h) * alpha;
    const sinking = r.sinkTimer > 0;
    const c = this.container;
    c.setPosition(this.x, this.y);
    c.setRotation(this.heading + r.spin);
    this.shadow.setRotation(0);

    // Hit flashing, sinking, bobbing
    let a = 1;
    if (hasEffect(r, 'invulnerable') && !sinking) a = Math.floor(time / 90) % 2 ? 0.45 : 1;
    let scale = 1 + Math.sin(time / 300 + r.id) * 0.015;
    if (sinking) {
      const t = 1 - r.sinkTimer / 2;
      scale *= Math.max(0.05, 1 - t);
      a = Math.max(0, 1 - t * 1.2);
    }
    c.setAlpha(a).setScale(scale);

    // Jigsaw
    const sawOn = hasEffect(r, 'jigsaw');
    this.saw.setVisible(sawOn);
    if (sawOn) this.saw.setScale(1 + Math.sin(time / 25) * 0.04, 1 + Math.cos(time / 30) * 0.08);

    // Boost flames
    this.boost.clear();
    if (hasEffect(r, 'boost')) {
      const L = r.boat.size.length;
      const flick = 0.7 + Math.random() * 0.5;
      this.boost.fillStyle(0xffffff, 0.8).fillTriangle(-L / 2, -8, -L / 2, 8, -L / 2 - 36 * flick, 0);
      this.boost.fillStyle(0xbfe6ff, 0.6).fillTriangle(-L / 2, -14, -L / 2, 14, -L / 2 - 20 * flick, 0);
    }

    // Damage smoke
    this.smoke.clear();
    const frac = r.hull / r.stats.maxHull;
    if (frac < 0.5 && !sinking) {
      const puff = (Math.sin(time / 120) + 1) * 3;
      this.smoke.fillStyle(0x333333, 0.55).fillCircle(-4, -2, 6 + puff);
      if (frac < 0.25) this.smoke.fillStyle(0xff8a1f, 0.8).fillCircle(4, 3, 3 + puff / 2);
    }

    // Hull bar, only when damaged
    this.bar.clear();
    if (frac < 0.999 && !sinking) {
      const w = 54;
      this.bar.fillStyle(0x000000, 0.6).fillRect(this.x - w / 2 - 1, this.y - 54, w + 2, 8);
      this.bar.fillStyle(frac > 0.5 ? 0x62d26f : frac > 0.25 ? 0xffd23f : 0xff5a4d, 1).fillRect(this.x - w / 2, this.y - 53, w * frac, 6);
    }
    this.label?.setPosition(this.x, this.y - 70).setVisible(!sinking);

    // Wake
    this.wakeTimer -= dt;
    if (this.wakeTimer <= 0 && speedOf(r) > 60 && !sinking) {
      this.wakeTimer = 0.035;
      const back = this.heading + Math.PI;
      const L = r.boat.size.length;
      this.wake.emitParticleAt(this.x + Math.cos(back) * L * 0.45, this.y + Math.sin(back) * L * 0.45, 1);
    }
  }

  destroy(): void {
    this.container.destroy();
    this.bar.destroy();
    this.label?.destroy();
  }
}
