import { describe, expect, it } from 'vitest';
import { TRACK_DEFS, loadTrack } from '../src/data/tracks';

describe('tracks', () => {
  for (const def of TRACK_DEFS) {
    it(`${def.id}: samples evenly and never overlaps itself`, () => {
      const t = loadTrack(def.id);
      expect(t.length).toBeGreaterThan(3000);
      const n = t.samples.length;
      // Evenly spaced
      for (let i = 0; i < n; i++) {
        const a = t.samples[i];
        const b = t.samples[(i + 1) % n];
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        expect(d).toBeGreaterThan(t.spacing * 0.5);
        expect(d).toBeLessThan(t.spacing * 1.6);
      }
      // Sections far apart along the lap must be farther apart than their combined half widths
      for (let i = 0; i < n; i += 3) {
        for (let j = i + 1; j < n; j += 3) {
          const along = Math.min(Math.abs(t.samples[j].dist - t.samples[i].dist), t.length - Math.abs(t.samples[j].dist - t.samples[i].dist));
          if (along < 900) continue;
          const d = Math.hypot(t.samples[i].x - t.samples[j].x, t.samples[i].y - t.samples[j].y);
          expect(d).toBeGreaterThan((t.samples[i].width + t.samples[j].width) / 2 + 40);
        }
      }
    });
  }

  it('nearest() finds lateral offset and distance along', () => {
    const t = loadTrack('lockAndLoad');
    const p = t.pointAt(1234, 50);
    const n = t.nearest(p.x, p.y);
    expect(n.lateral).toBeCloseTo(50, 0);
    expect(n.along).toBeCloseTo(1234, -1);
  });

  it('nearest() with a hint stays on the local section', () => {
    const t = loadTrack('lockAndLoad');
    const p = t.pointAt(500);
    const n = t.nearest(p.x, p.y, Math.round(480 / t.spacing));
    expect(Math.abs(n.along - 500)).toBeLessThan(t.spacing);
  });
});
