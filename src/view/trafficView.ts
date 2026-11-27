import Phaser from 'phaser';
import { TUNING } from '../data/items';
import type { RaceSimulation } from '../race/RaceSimulation';
import type { BargePose } from '../race/traffic';
import type { RaceAudio } from './raceAudio';

/**
 * Draws the traffic: each barge with its shadow and its wake (a trail and the two arms of a V),
 * and sounds its horn when it passes close to the boat the camera follows. Barges far from the
 * camera are hidden; at the ends of an open track they fade out and back in.
 */
export class TrafficView {
  private sprites: Phaser.GameObjects.Container[] = [];
  private wakeT = 0;
  private hornAt = new Map<number, number>();
  /** Where the barges were drawn this frame (the minimap shows them). */
  poses: BargePose[] = [];

  constructor(
    private scene: Phaser.Scene,
    private sim: RaceSimulation,
    private wake: Phaser.GameObjects.Particles.ParticleEmitter,
    private wakeArm: Phaser.GameObjects.Particles.ParticleEmitter,
    private audio: RaceAudio,
  ) {
    const T = TUNING.traffic;
    for (const b of sim.traffic.barges) {
      const shadow = scene.add.image(4, 6, 'shadow').setDisplaySize(T.length * 1.04, T.width * 1.3).setAlpha(0.9);
      const img = scene.add.image(0, 0, `barge_${b.kind}`).setDisplaySize(T.length + 4, T.width + 4);
      this.sprites.push(scene.add.container(0, 0, [shadow, img]).setDepth(9.9).setVisible(false));
    }
  }

  /** `t`: the traffic's clock to draw at; `focus`: the boat the camera follows. */
  update(t: number, dt: number, focus: { x: number; y: number } | null): void {
    const T = TUNING.traffic;
    const v = this.scene.cameras.main.worldView;
    const m = T.length;
    this.poses = this.sim.traffic.poses(t);
    this.wakeT -= dt;
    const emit = this.wakeT <= 0;
    if (emit) this.wakeT = 0.07;
    const now = this.scene.time.now / 1000;
    this.poses.forEach((p, i) => {
      const s = this.sprites[i];
      const visible = p.alpha > 0 && p.x > v.x - m && p.x < v.right + m && p.y > v.y - m && p.y < v.bottom + m;
      s.setVisible(visible);
      if (!visible) return;
      s.setPosition(p.x, p.y).setRotation(p.heading).setAlpha(p.alpha);
      if (emit && p.alpha > 0.5) {
        const back = p.heading + Math.PI;
        const sx = p.x + Math.cos(back) * T.length * 0.48, sy = p.y + Math.sin(back) * T.length * 0.48;
        this.wake.emitParticleAt(sx, sy, 1);
        for (const side of [-1, 1]) {
          this.wakeArm.setEmitterAngle(Phaser.Math.RadToDeg(back + side * 0.6));
          this.wakeArm.emitParticleAt(sx + Math.cos(p.heading + (side * Math.PI) / 2) * T.width * 0.4, sy + Math.sin(p.heading + (side * Math.PI) / 2) * T.width * 0.4, 1);
        }
      }
      if (focus && Math.hypot(focus.x - p.x, focus.y - p.y) < 320 && now - (this.hornAt.get(p.id) ?? -99) > 15) {
        this.hornAt.set(p.id, now);
        this.audio.at('horn', p.x, p.y, 0.8);
      }
    });
  }
}
