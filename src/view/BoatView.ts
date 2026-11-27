import Phaser from 'phaser';
import { hasEffect } from '../effects/effects';
import { angleDiff } from '../physics/math';
import { speedOf } from '../physics/BoatPhysics';
import { createBoatSprite } from './boatSprite';
import { WORLD_ART_SCALE } from './textures';
import type { Racer } from '../race/types';

/** Sprite, shadow, saw, boost and damage overlays for one racer. */
export class BoatView {
  readonly container: Phaser.GameObjects.Container;
  private shadow: Phaser.GameObjects.Image;
  private saw: Phaser.GameObjects.Image;
  private boost: Phaser.GameObjects.Graphics;
  private smoke: Phaser.GameObjects.Graphics;
  private bar: Phaser.GameObjects.Graphics;
  /** Drawn over the hull, in the boat's own frame: Kärcher jets, electrical sparks, cheese. */
  private over: Phaser.GameObjects.Graphics;
  /** In the world, under the boats: the magnet's rings. */
  private aura: Phaser.GameObjects.Graphics;
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
    this.saw = scene.add.image(L / 2 + 6, 0, 'saw').setOrigin(0, 0.5).setScale(WORLD_ART_SCALE).setVisible(false);
    this.boost = scene.add.graphics();
    this.smoke = scene.add.graphics();
    this.bar = scene.add.graphics();
    this.over = scene.add.graphics();
    this.aura = scene.add.graphics().setDepth(9);
    this.container = scene.add.container(r.x, r.y, [this.shadow, this.boost, hull, this.saw, this.smoke, this.over]).setDepth(10);
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
  /** Drawn this far from the boat's real position, fading out: a smoothed-out online correction. */
  private err = { x: 0, y: 0, h: 0 };

  /**
   * The boat was moved by (-dx, -dy, -dh) between frames (an online correction). Keep drawing it
   * where it was and glide to the corrected place over about a fifth of a second.
   */
  correct(dx: number, dy: number, dh: number): void {
    this.prev.x -= dx;
    this.prev.y -= dy;
    this.prev.h -= dh;
    this.err.x += dx;
    this.err.y += dy;
    this.err.h += dh;
  }

  snapshot(): void {
    this.prev = { x: this.r.x, y: this.r.y, h: this.r.heading };
  }

  render(alpha: number, time: number, dt: number): void {
    const r = this.r;
    this.x = this.prev.x + (r.x - this.prev.x) * alpha;
    this.y = this.prev.y + (r.y - this.prev.y) * alpha;
    this.heading = this.prev.h + angleDiff(r.heading, this.prev.h) * alpha;
    if (this.err.x || this.err.y || this.err.h) {
      this.x += this.err.x;
      this.y += this.err.y;
      this.heading += this.err.h;
      const k = Math.exp(-dt * 12);
      this.err.x *= k;
      this.err.y *= k;
      this.err.h *= k;
      if (Math.abs(this.err.x) + Math.abs(this.err.y) < 0.05 && Math.abs(this.err.h) < 0.001) this.err = { x: 0, y: 0, h: 0 };
    }
    const sinking = r.sinkTimer > 0;
    const c = this.container;
    c.setPosition(this.x, this.y);
    c.setRotation(this.heading + r.spin);
    this.shadow.setRotation(0);

    // Hit flashing, sinking, bobbing
    let a = 1;
    if (hasEffect(r, 'invulnerable') && !sinking) a = Math.floor(time / 90) % 2 ? 0.45 : 1;
    let scale = (1 + Math.sin(time / 300 + r.id) * 0.015) * r.size; // smaller while shrunk by a mushroom
    if (sinking) {
      const t = 1 - r.sinkTimer / 2;
      scale *= Math.max(0.05, 1 - t);
      a = Math.max(0, 1 - t * 1.2);
    }
    c.setAlpha(a).setScale(scale);

    // Jigsaw
    const sawOn = hasEffect(r, 'jigsaw');
    this.saw.setVisible(sawOn);
    if (sawOn) this.saw.setScale((1 + Math.sin(time / 25) * 0.04) * WORLD_ART_SCALE, (1 + Math.cos(time / 30) * 0.08) * WORLD_ART_SCALE);

    // Boost flames
    this.boost.clear();
    if (hasEffect(r, 'boost')) {
      const L = r.boat.size.length;
      const flick = 0.7 + Math.random() * 0.5;
      this.boost.fillStyle(0xffffff, 0.8).fillTriangle(-L / 2, -8, -L / 2, 8, -L / 2 - 36 * flick, 0);
      this.boost.fillStyle(0xbfe6ff, 0.6).fillTriangle(-L / 2, -14, -L / 2, 14, -L / 2 - 20 * flick, 0);
    }

    // Hasty (mushrooms: the boats behind the user): pink flames, like a boost but cheekier
    if (hasEffect(r, 'hasty') && !sinking) {
      const L = r.boat.size.length;
      const flick = 0.7 + Math.random() * 0.5;
      this.boost.fillStyle(0xff9ad5, 0.75).fillTriangle(-L / 2, -7, -L / 2, 7, -L / 2 - 28 * flick, 0);
      this.boost.fillStyle(0xffe3f2, 0.7).fillTriangle(-L / 2, -3.5, -L / 2, 3.5, -L / 2 - 14 * flick, 0);
    }

    this.drawOver(time, sinking);
    this.drawAura(time, sinking);

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

  /** Kärcher jets, electrical sparks and cheese drips on the hull. */
  private drawOver(time: number, sinking: boolean): void {
    const r = this.r;
    const g = this.over.clear();
    if (sinking) return;
    const { length: L, width: W } = r.boat.size;
    if (hasEffect(r, 'karcher')) {
      // A fan of water to each side, from the middle of the boat: streaks and drops.
      for (const side of [-1, 1]) {
        // a soft fan of spray under the streaks
        const x0 = -L * 0.2, x1 = L * 0.2, reach = 250 + Math.sin(time / 45) * 25;
        g.fillStyle(0xbfe6ff, 0.22).fillTriangle(x0, side * (W / 2), x1, side * (W / 2), 0, side * (W / 2 + reach));
        g.fillStyle(0xffffff, 0.2).fillTriangle(x0 * 0.5, side * (W / 2), x1 * 0.5, side * (W / 2), 0, side * (W / 2 + reach * 0.8));
        for (let k = 0; k < 7; k++) {
          const a = (k - 3) * 0.1 + Math.sin(time / 40 + k * 2 + side) * 0.03;
          const reach = 150 + ((k * 53 + Math.floor(time / 30)) % 7) * 18;
          const x0 = ((k - 3) * L) / 14, y0 = side * (W / 2);
          g.lineStyle(5 - Math.abs(k - 3) * 0.6, k % 2 ? 0xffffff : 0xbfe6ff, 0.9)
            .lineBetween(x0, y0, x0 + Math.sin(a) * reach, y0 + side * Math.cos(a) * reach);
        }
        g.fillStyle(0xffffff, 0.85);
        for (let k = 0; k < 7; k++) g.fillCircle(((k - 3) * L) / 9 + Math.sin(time / 50 + k) * 8, side * (W / 2 + 120 + ((k * 37 + Math.floor(time / 35)) % 7) * 22), 3.2);
      }
    }
    if (hasEffect(r, 'blackout')) {
      // Crackling arcs over the hull
      g.fillStyle(0x59b8ff, 0.18 + Math.random() * 0.12).fillCircle(0, 0, L * 0.5 + 12);
      for (let k = 0; k < 6; k++) {
        let x = (Math.random() - 0.5) * L * 0.8, y = (Math.random() - 0.5) * W * 0.6;
        g.lineStyle(k % 2 ? 3 : 5, k % 2 ? 0xffffff : 0xffe04a, 0.95).beginPath().moveTo(x, y);
        for (let j = 0; j < 5; j++) {
          x += (Math.random() - 0.5) * 34;
          y += (Math.random() - 0.5) * 26;
          g.lineTo(x, y);
        }
        g.strokePath();
      }
      g.fillStyle(0x000000, 0.18 + Math.random() * 0.2).fillRoundedRect(-L / 2, -W / 2, L, W, 6); // the lights flicker
    }
    if (hasEffect(r, 'cheesed')) {
      g.fillStyle(0xffc933, 0.95);
      for (const [fx, fy, fr] of [[-0.25, -0.15, 0.16], [0.05, 0.2, 0.2], [0.3, -0.1, 0.14], [-0.02, -0.28, 0.12]] as const) g.fillCircle(fx * L, fy * W, fr * W);
      g.fillStyle(0xffe58a, 0.9).fillCircle(0.0 * L, 0.2 * W, 0.08 * W);
    }
  }

  /** Mushrooms: rings contract on the boat, pulling the crates in. */
  private drawAura(time: number, sinking: boolean): void {
    const g = this.aura.clear();
    if (!hasEffect(this.r, 'magnet') || sinking) return;
    for (let k = 0; k < 3; k++) {
      const phase = ((time / 1100 + k / 3) % 1);
      const radius = 30 + 190 * (1 - phase);
      const c = Phaser.Display.Color.HSVToRGB(((time / 2000) + k / 3) % 1, 0.7, 1) as Phaser.Types.Display.ColorObject;
      g.lineStyle(5, Phaser.Display.Color.GetColor(c.r, c.g, c.b), 0.55 * phase).strokeCircle(this.x, this.y, radius);
    }
  }

  destroy(): void {
    this.over.destroy();
    this.aura.destroy();
    this.container.destroy();
    this.bar.destroy();
    this.label?.destroy();
  }
}
