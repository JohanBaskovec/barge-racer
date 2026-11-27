import Phaser from 'phaser';
import type { Track } from '../track/Track';

/** A chequered start/finish line across the channel at a distance along the centre line. */
export function drawLine(scene: Phaser.Scene, track: Track, along: number): void {
  const s = track.sampleAt(along);
  const line = scene.add.graphics().setDepth(3);
  const cells = 8;
  const cw = s.width / cells;
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < 2; j++) {
      line.fillStyle((i + j) % 2 ? 0x111111 : 0xffffff, 0.9);
      const lx = (i - cells / 2) * cw;
      const px = s.x + s.nx * lx + s.tx * (j * 14 - 14);
      const py = s.y + s.ny * lx + s.ty * (j * 14 - 14);
      line.fillPoints([
        new Phaser.Math.Vector2(px, py),
        new Phaser.Math.Vector2(px + s.nx * cw, py + s.ny * cw),
        new Phaser.Math.Vector2(px + s.nx * cw + s.tx * 14, py + s.ny * cw + s.ty * 14),
        new Phaser.Math.Vector2(px + s.tx * 14, py + s.ty * 14),
      ], true);
    }
  }
}
