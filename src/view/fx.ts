import Phaser from 'phaser';

/** Water and impact effects: splashes, ripples, splinters, bubbles, dust. */
export class Fx {
  private droplets: Phaser.GameObjects.Particles.ParticleEmitter;
  private splinters: Phaser.GameObjects.Particles.ParticleEmitter;
  private bubbles: Phaser.GameObjects.Particles.ParticleEmitter;
  private dust: Phaser.GameObjects.Particles.ParticleEmitter;
  private goo: Phaser.GameObjects.Particles.ParticleEmitter;
  private cheeseDrops: Phaser.GameObjects.Particles.ParticleEmitter;
  private toxicPuff: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(private scene: Phaser.Scene) {
    this.droplets = scene.add.particles(0, 0, 'droplet', {
      emitting: false, lifespan: { min: 300, max: 650 }, speed: { min: 60, max: 230 }, scale: { start: 1, end: 0.2 },
      alpha: { start: 0.95, end: 0 }, tint: [0xffffff, 0xd9efff, 0xa9d8ff],
    }).setDepth(16);
    this.splinters = scene.add.particles(0, 0, 'splinter', {
      emitting: false, lifespan: { min: 350, max: 700 }, speed: { min: 80, max: 260 }, rotate: { min: 0, max: 360 },
      scale: { start: 1, end: 0.5 }, alpha: { start: 1, end: 0 }, tint: [0x9a6a3a, 0x7a4a1c, 0xc79a62],
    }).setDepth(16);
    this.bubbles = scene.add.particles(0, 0, 'bubble', {
      emitting: false, lifespan: { min: 500, max: 1000 }, speed: { min: 10, max: 50 }, scale: { start: 0.5, end: 1.2 }, alpha: { start: 0.9, end: 0 },
    }).setDepth(6);
    this.dust = scene.add.particles(0, 0, 'droplet', {
      emitting: false, lifespan: { min: 400, max: 800 }, speed: { min: 30, max: 120 }, scale: { start: 1.6, end: 3 }, alpha: { start: 0.55, end: 0 }, tint: 0xffffff,
    }).setDepth(15);
    this.goo = scene.add.particles(0, 0, 'droplet', {
      emitting: false, lifespan: { min: 250, max: 500 }, speed: { min: 50, max: 160 }, scale: { start: 1.2, end: 0.4 }, alpha: { start: 1, end: 0 }, tint: [0xf2e27a, 0xfff3a8],
    }).setDepth(16);
    this.cheeseDrops = scene.add.particles(0, 0, 'droplet', {
      emitting: false, lifespan: { min: 300, max: 650 }, speed: { min: 60, max: 220 }, scale: { start: 1.5, end: 0.4 }, alpha: { start: 1, end: 0 }, tint: [0xffc933, 0xffd965, 0xe8a01c],
    }).setDepth(16);
    this.toxicPuff = scene.add.particles(0, 0, 'droplet', {
      emitting: false, lifespan: { min: 500, max: 900 }, speed: { min: 20, max: 90 }, scale: { start: 2, end: 4 }, alpha: { start: 0.6, end: 0 }, tint: [0x9bbd3c, 0x7fa334, 0xc8e070],
    }).setDepth(15);
  }

  /** An expanding ring on the water. */
  ripple(x: number, y: number, size = 1, delay = 0): void {
    const ring = this.scene.add.image(x, y, 'ring').setDepth(4).setScale(0.2 * size).setAlpha(0.7);
    this.scene.tweens.add({ targets: ring, scale: 1.6 * size, alpha: 0, duration: 750, delay, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
  }

  splash(x: number, y: number, size = 1): void {
    this.droplets.explode(Math.round(10 * size), x, y);
    this.ripple(x, y, size);
  }

  /** A boat going under: a big splash, rings and bubbles. */
  sink(x: number, y: number): void {
    this.splash(x, y, 2);
    this.ripple(x, y, 1.6, 250);
    for (let i = 0; i < 5; i++) this.scene.time.delayedCall(i * 280, () => this.bubbles.explode(5, x + (Math.random() - 0.5) * 30, y + (Math.random() - 0.5) * 30));
  }

  /** A crate breaking. */
  crate(x: number, y: number): void {
    this.splinters.explode(10, x, y);
    this.droplets.explode(5, x, y);
  }

  /** White powder or a start boost: a puff behind the boat. */
  puff(x: number, y: number): void {
    this.dust.explode(12, x, y);
  }

  glue(x: number, y: number): void {
    this.goo.explode(12, x, y);
    this.ripple(x, y, 0.8);
  }

  /** Cheese splattering: orange-yellow drops. */
  cheese(x: number, y: number): void {
    this.cheeseDrops.explode(16, x, y);
    this.ripple(x, y, 0.7);
  }

  /** A puff of toxic green. */
  toxic(x: number, y: number): void {
    this.toxicPuff.explode(7, x, y);
  }

  heal(x: number, y: number): void {
    this.bubbles.explode(10, x, y);
  }
}
