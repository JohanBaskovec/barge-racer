import Phaser from 'phaser';
import { hasEffect } from '../effects/effects';
import { angleDiff } from '../physics/math';
import { speedOf } from '../physics/BoatPhysics';
import { createBoatSprite } from './boatSprite';
import { getBoat } from '../data/boats';
import { TUNING } from '../data/items';
import { WORLD_ART_SCALE } from './textures';
import type { Racer } from '../race/types';
import { TEAM_COLORS } from '../race/battle';

/** Sprite, shadow, saw, boost and damage overlays for one racer. */
export class BoatView {
  readonly container: Phaser.GameObjects.Container;
  private shadow: Phaser.GameObjects.Image;
  /** The jigsaw's three saws, one sticking out of each side and one on the bow. */
  private saws: Phaser.GameObjects.Image[];
  private dildo: Phaser.GameObjects.Image;
  private nozzle: Phaser.GameObjects.Image;
  /** The tugboat towing this boat, ahead of it on a rope. */
  private tug: Phaser.GameObjects.Container;
  /** Over the boat while its fuel is siphoned: an empty can. */
  private emptyCan: Phaser.GameObjects.Image;
  private boost: Phaser.GameObjects.Graphics;
  private smoke: Phaser.GameObjects.Graphics;
  private bar: Phaser.GameObjects.Graphics;
  /** Drawn over the hull, in the boat's own frame: Kärcher jets, electrical sparks, cheese. */
  private over: Phaser.GameObjects.Graphics;
  /** In the world, under the boats: the magnet's rings. */
  private aura: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text | null = null;
  /** Team battles: the team's flag flying over the boat. */
  private teamFlag: Phaser.GameObjects.Container | null = null;
  private prev: { x: number; y: number; h: number };
  x: number;
  y: number;
  heading: number;
  private wakeTimer = 0;

  private armTimer = 0;

  constructor(
    scene: Phaser.Scene,
    private r: Racer,
    private wake: Phaser.GameObjects.Particles.ParticleEmitter,
    /** The arms of the V behind big boats (optional: the title screen has none). */
    private wakeArm: Phaser.GameObjects.Particles.ParticleEmitter | null = null,
    /** Team battles: 0 Corsica, 1 Brittany (-1: no team). */
    team = -1,
  ) {
    const { length: L, width: W } = r.boat.size;
    this.shadow = scene.add.image(3, 5, 'shadow').setDisplaySize(L * 1.05, W * 1.1);
    const hull = createBoatSprite(scene, r.boat, r.color);
    // Team battles: a ring of the team's colour round the hull (it turns and shrinks with it), and
    // the team's flag over the boat, so you can tell friend from foe at a glance.
    const ring = scene.add.graphics();
    if (team >= 0) {
      const c = TEAM_COLORS[team], m = 9;
      ring.fillStyle(c, 0.3).fillRoundedRect(-L / 2 - m, -W / 2 - m, L + m * 2, W + m * 2, Math.min(W / 2 + m, 22));
      ring.lineStyle(5, c, 1).strokeRoundedRect(-L / 2 - m, -W / 2 - m, L + m * 2, W + m * 2, Math.min(W / 2 + m, 22));
      ring.lineStyle(2, 0xffffff, 0.9).strokeRoundedRect(-L / 2 - m - 3.5, -W / 2 - m - 3.5, L + m * 2 + 7, W + m * 2 + 7, Math.min(W / 2 + m + 3.5, 25));
      // (framed in the team's colour: the Corsican flag is mostly white)
      this.teamFlag = scene.add.container(0, 0, [
        scene.add.rectangle(0, 0, 42, 30, c).setStrokeStyle(2, 0xffffff),
        scene.add.image(0, 0, `flatFlag_${team}`).setDisplaySize(36, 24),
      ]).setDepth(31);
    }
    // The jigsaw's three saws: out of each side, and on the bow.
    this.saws = [-1, 1].map((side) => scene.add.image(0, side * (W / 2 + 2), 'saw').setOrigin(0, 0.5).setRotation((side * Math.PI) / 2).setScale(WORLD_ART_SCALE).setVisible(false));
    this.saws.push(scene.add.image(L / 2 + 6, 0, 'saw').setOrigin(0, 0.5).setScale(WORLD_ART_SCALE).setVisible(false));
    this.dildo = scene.add.image(L / 2 - 4, 0, 'dildo').setOrigin(0, 0.5).setScale(WORLD_ART_SCALE).setVisible(false);
    this.nozzle = scene.add.image(L / 2 - 8, 0, 'nozzle').setOrigin(0, 0.5).setDisplaySize(46, 26).setVisible(false);
    const tugDef = getBoat('tugboat');
    this.tug = createBoatSprite(scene, tugDef, 0xd23b2f).setPosition(L / 2 + 70 + tugDef.size.length / 2, 0).setVisible(false);
    this.emptyCan = scene.add.image(0, 0, 'icon_siphon').setDisplaySize(40, 40).setDepth(31).setVisible(false);
    this.boost = scene.add.graphics();
    this.smoke = scene.add.graphics();
    this.bar = scene.add.graphics();
    this.over = scene.add.graphics();
    this.aura = scene.add.graphics().setDepth(9);
    this.container = scene.add.container(r.x, r.y, [this.shadow, ring, this.boost, this.tug, hull, ...this.saws, this.dildo, this.nozzle, this.smoke, this.over]).setDepth(10);
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
    // Rocked by another boat's wake: it rolls a little.
    const roll = hasEffect(r, 'rocked') ? Math.sin(time / 70 + r.id) * 0.07 : 0;
    c.setRotation(this.heading + r.spin + roll);
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

    // Jigsaw: a buzzing saw out of each side
    const sawOn = hasEffect(r, 'jigsaw') && !sinking;
    for (const saw of this.saws) {
      saw.setVisible(sawOn);
      if (sawOn) saw.setScale((1 + Math.sin(time / 25) * 0.04) * WORLD_ART_SCALE, (1 + Math.cos(time / 30) * 0.08) * WORLD_ART_SCALE);
    }
    // Dildo on the bow, wobbling
    const dildoOn = hasEffect(r, 'dildo') && !sinking;
    this.dildo.setVisible(dildoOn);
    if (dildoOn) this.dildo.setRotation(Math.sin(time / 90) * 0.06);
    // Vacuum cleaner: a hose and nozzle on the bow, shaking
    const sucking = hasEffect(r, 'vacuum') && !sinking;
    this.nozzle.setVisible(sucking);
    if (sucking) this.nozzle.setY(Math.sin(time / 30) * 0.8);
    // Towed: the tug ahead, its rope taut (drawn in drawOver)
    const towed = hasEffect(r, 'towed') && !sinking;
    this.tug.setVisible(towed);
    if (towed) this.tug.setRotation(Math.sin(time / 260) * 0.05);
    // Fuel siphoned: an empty can bobbing over the boat
    const dry = hasEffect(r, 'siphoned') && !sinking;
    this.emptyCan.setVisible(dry);
    if (dry) this.emptyCan.setPosition(this.x, this.y - 78 + Math.sin(time / 150) * 4).setAngle(Math.sin(time / 200) * 10);

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
    // (with a team flag, the player's marker goes above it)
    this.teamFlag?.setPosition(this.x, this.y - 72).setVisible(!sinking);
    this.label?.setPosition(this.x, this.y - (this.teamFlag ? 102 : 70)).setVisible(!sinking);

    // Wake
    this.wakeTimer -= dt;
    if (this.wakeTimer <= 0 && speedOf(r) > 60 && !sinking) {
      this.wakeTimer = 0.035;
      const back = this.heading + Math.PI;
      const L = r.boat.size.length;
      this.wake.emitParticleAt(this.x + Math.cos(back) * L * 0.45, this.y + Math.sin(back) * L * 0.45, 1);
    }
    // Heavy boats going fast leave the arms of a V: the wake that pushes lighter boats around.
    this.armTimer -= dt;
    if (this.wakeArm && this.armTimer <= 0 && r.stats.mass >= 2.3 && speedOf(r) > r.stats.topSpeed * 0.4 && !sinking) {
      this.armTimer = 0.09;
      const back = this.heading + Math.PI;
      const L = r.boat.size.length * r.size, Wd = r.boat.size.width * r.size;
      for (const side of [-1, 1]) {
        this.wakeArm.setEmitterAngle(Phaser.Math.RadToDeg(back + side * 0.6));
        const sx = this.x + Math.cos(back) * L * 0.45 + Math.cos(this.heading + (side * Math.PI) / 2) * Wd * 0.4;
        const sy = this.y + Math.sin(back) * L * 0.45 + Math.sin(this.heading + (side * Math.PI) / 2) * Wd * 0.4;
        this.wakeArm.emitParticleAt(sx, sy, 1);
      }
    }
  }

  /** Kärcher jets, electrical sparks and cheese drips on the hull. */
  private drawOver(time: number, sinking: boolean): void {
    const r = this.r;
    const g = this.over.clear();
    if (sinking) return;
    const { length: L, width: W } = r.boat.size;
    if (hasEffect(r, 'towed')) {
      // The tow rope, from the bow to the tug's stern, and the tug's churning wash.
      g.lineStyle(3, 0x5a4326, 1).lineBetween(L / 2, 0, L / 2 + 70, 0);
      g.lineStyle(1.5, 0xd9b77a, 1).lineBetween(L / 2, -0.8, L / 2 + 70, -0.8);
      for (let k = 0; k < 4; k++) g.fillStyle(0xffffff, 0.5).fillCircle(L / 2 + 64 - ((time / 6 + k * 9) % 36), Math.sin(time / 70 + k) * 9, 4);
    }
    if (hasEffect(r, 'vacuum')) {
      // Streaks of air and water rushing into the nozzle.
      const mouth = L / 2 + 38;
      for (let k = 0; k < 9; k++) {
        const t = ((time / 420 + k / 9) % 1);
        const a = ((k * 0.61) % 1 - 0.5) * 2 * TUNING.vacuum.halfAngle * 0.8;
        const d0 = 40 + (1 - t) * 420, d1 = d0 * 0.55;
        g.lineStyle(3, 0xffffff, 0.15 + 0.4 * t)
          .lineBetween(mouth + Math.cos(a) * d0, Math.sin(a) * d0, mouth + Math.cos(a) * d1, Math.sin(a) * d1);
      }
    }
    if (hasEffect(r, 'splattered')) {
      // Blood smeared over the bow.
      g.fillStyle(0xb3121c, 0.75);
      for (const [x, y, s] of [[0.35, -0.2, 5], [0.42, 0.18, 4], [0.28, 0.05, 6], [0.15, -0.25, 3], [0.2, 0.3, 3.5]]) g.fillCircle(L * x, W * y, s);
    }
    if (hasEffect(r, 'siphoned')) {
      // Out of fuel: the engine coughs black puffs.
      for (let k = 0; k < 3; k++) {
        const t = ((time / 500 + k / 3) % 1);
        g.fillStyle(0x2b2b2b, 0.5 * (1 - t)).fillCircle(-L / 2 - 6 - t * 26, Math.sin(k * 2.1) * 6, 5 + t * 8);
      }
    }
    if (hasEffect(r, 'karcher')) {
      // A fan of water out of the middle of each side, widening as it goes: where it pushes boats.
      const K = TUNING.karcher;
      const x0 = (-L * K.base) / 2, x1 = (L * K.base) / 2;
      for (const side of [-1, 1]) {
        const y0 = side * (W / 2), reach = K.reach * (0.94 + Math.sin(time / 45) * 0.06);
        const y1 = side * (W / 2 + reach), wide = K.spread * reach;
        g.fillStyle(0xbfe6ff, 0.2).fillPoints([{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1 + wide, y: y1 }, { x: x0 - wide, y: y1 }] as Phaser.Math.Vector2[], true);
        g.fillStyle(0xffffff, 0.14).fillPoints([{ x: x0 * 0.6, y: y0 }, { x: x1 * 0.6, y: y0 }, { x: x1 * 0.6 + wide * 0.5, y: side * (W / 2 + reach * 0.8) }, { x: x0 * 0.6 - wide * 0.5, y: side * (W / 2 + reach * 0.8) }] as Phaser.Math.Vector2[], true);
        // streaks from nozzles along the middle of the side, fanning out
        for (let k = 0; k < 7; k++) {
          const t = k / 6;
          const sx = x0 + (x1 - x0) * t;
          const a = (t - 0.5) * 2 * Math.atan(K.spread) + Math.sin(time / 40 + k * 2 + side) * 0.03;
          const len = reach * (0.55 + ((k * 53 + Math.floor(time / 30)) % 7) * 0.065);
          g.lineStyle(5 - Math.abs(k - 3) * 0.6, k % 2 ? 0xffffff : 0xbfe6ff, 0.9)
            .lineBetween(sx, y0, sx + Math.sin(a) * len, y0 + side * Math.cos(a) * len);
        }
        g.fillStyle(0xffffff, 0.85);
        for (let k = 0; k < 7; k++) {
          const d = reach * (0.45 + ((k * 37 + Math.floor(time / 35)) % 7) * 0.08);
          const t = ((k * 0.37) % 1) - 0.5;
          g.fillCircle(t * (x1 - x0 + 2 * K.spread * d), side * (W / 2 + d), 3.2);
        }
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
    if (hasEffect(r, 'draft')) {
      // In a slipstream: streaks of air sliding back along both sides
      for (const side of [-1, 1]) {
        for (let k = 0; k < 3; k++) {
          const ph = ((time / 260 + k / 3 + (side > 0 ? 0.5 : 0)) % 1);
          const x0 = L / 2 - ph * L * 1.2;
          g.lineStyle(2.5, 0xffffff, 0.75 * (1 - ph)).lineBetween(x0, side * (W / 2 + 7 + k * 3), x0 - 26, side * (W / 2 + 7 + k * 3));
        }
      }
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
    if (hasEffect(this.r, 'shielded') && !sinking) {
      // A head of beer foam round the boat: a creamy ring with bubbles.
      const R = this.r.boat.size.length * 0.5 + 16;
      g.lineStyle(9, 0xfff3c4, 0.55 + Math.sin(time / 180) * 0.1).strokeCircle(this.x, this.y, R);
      g.lineStyle(3, 0xf2b02e, 0.5).strokeCircle(this.x, this.y, R + 6);
      g.fillStyle(0xffffff, 0.8);
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2 + time / 900;
        g.fillCircle(this.x + Math.cos(a) * R, this.y + Math.sin(a) * R, 2.5 + ((k * 7) % 3));
      }
    }
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
    this.emptyCan.destroy();
    this.aura.destroy();
    this.container.destroy();
    this.bar.destroy();
    this.label?.destroy();
    this.teamFlag?.destroy();
  }
}
