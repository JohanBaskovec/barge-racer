import Phaser from 'phaser';
import { Rng } from '../physics/math';
import type { Track } from '../track/Track';
import { drawLine } from './lines';

export interface WorldBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Draws land, shore, animated water (masked to the channel) and scenery for a track. */
export class TrackRenderer {
  readonly bounds: WorldBounds;
  private water: Phaser.GameObjects.TileSprite;

  constructor(private scene: Phaser.Scene, private track: Track) {
    const margin = 700;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of track.samples) {
      minX = Math.min(minX, s.x - s.width); maxX = Math.max(maxX, s.x + s.width);
      minY = Math.min(minY, s.y - s.width); maxY = Math.max(maxY, s.y + s.width);
    }
    this.bounds = { x: minX - margin, y: minY - margin, w: maxX - minX + margin * 2, h: maxY - minY + margin * 2 };
    const c = track.def.colors;

    // Land
    scene.add.rectangle(this.bounds.x, this.bounds.y, this.bounds.w, this.bounds.h, c.land).setOrigin(0).setDepth(0);

    // Shore, then water masked to the channel.
    const shore = scene.add.graphics().setDepth(1);
    const mask = scene.make.graphics({}, false);
    const skip = 2;
    const n = track.samples.length;
    shore.fillStyle(c.shore, 1);
    mask.fillStyle(0xffffff, 1);
    for (let i = 0; i < n; i += skip) {
      const a = track.samples[i];
      const b = track.samples[(i + skip) % n];
      this.quad(shore, a, b, 38);
      this.quad(mask, a, b, 0);
    }
    this.water = scene.add.tileSprite(this.bounds.x, this.bounds.y, this.bounds.w, this.bounds.h, 'water').setOrigin(0).setDepth(2);
    this.water.setTint(c.waterDeep);
    const base = scene.add.rectangle(this.bounds.x, this.bounds.y, this.bounds.w, this.bounds.h, c.water).setOrigin(0).setDepth(1.5);
    const geo = mask.createGeometryMask();
    this.water.setMask(geo);
    base.setMask(geo);

    drawLine(scene, track, 0);

    this.scatterScenery();
  }

  private quad(g: Phaser.GameObjects.Graphics, a: { x: number; y: number; nx: number; ny: number; width: number }, b: { x: number; y: number; nx: number; ny: number; width: number }, extra: number): void {
    const ha = a.width / 2 + extra;
    const hb = b.width / 2 + extra;
    g.fillPoints([
      new Phaser.Math.Vector2(a.x + a.nx * ha, a.y + a.ny * ha),
      new Phaser.Math.Vector2(b.x + b.nx * hb, b.y + b.ny * hb),
      new Phaser.Math.Vector2(b.x - b.nx * hb, b.y - b.ny * hb),
      new Phaser.Math.Vector2(a.x - a.nx * ha, a.y - a.ny * ha),
    ], true);
  }

  private scatterScenery(): void {
    const t = this.track.def.theme;
    const rng = new Rng(1234);
    const { x, y, w, h } = this.bounds;
    const count = 380;
    const tint = t === 'bayou' ? [0x2f6b2f, 0x3d7a35, 0x25562a] : t === 'industrial' ? [0x777b80, 0x8a8f94, 0x6b5d54] : [0xa05a44, 0x8c4c3a, 0xb9714f, 0x7d7a74];
    let placed = 0;
    for (let tries = 0; tries < count * 4 && placed < count; tries++) {
      const px = x + rng.next() * w;
      const py = y + rng.next() * h;
      const n = this.track.nearest(px, py, -1);
      const hw = this.track.halfWidth(n.index);
      if (Math.abs(n.lateral) < hw + 95 && n.distSq < (hw + 200) ** 2) continue;
      const block = t !== 'bayou' && rng.chance(0.75);
      const img = this.scene.add.image(px, py, block ? 'deco_block' : 'deco_tree').setDepth(1.2);
      img.setTint(tint[rng.int(0, tint.length - 1)]);
      const sc = block ? rng.range(0.9, 2.1) : rng.range(0.8, 2.2);
      img.setScale(sc);
      if (block) img.setRotation(Math.round(rng.range(0, 4)) * (Math.PI / 2) + rng.range(-0.1, 0.1));
      else img.setRotation(rng.range(0, 6.28));
      placed++;
    }
  }

  update(time: number): void {
    this.water.tilePositionX = time * 0.012;
    this.water.tilePositionY = time * 0.008;
  }
}
