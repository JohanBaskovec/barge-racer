import { describe, expect, it } from 'vitest';
import { TRACK_DEFS, loadTrack } from '../src/data/tracks';

describe('tracks', () => {
  for (const def of TRACK_DEFS) {
    it(`${def.id}: samples evenly and never overlaps itself`, () => {
      const t = loadTrack(def.id);
      expect(t.length).toBeGreaterThan(3000);
      const n = t.samples.length;
      // Evenly spaced
      for (let i = 0; i < (t.closed ? n : n - 1); i++) {
        const a = t.samples[i];
        const b = t.samples[(i + 1) % n];
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        expect(d).toBeGreaterThan(t.spacing * 0.5);
        expect(d).toBeLessThan(t.spacing * 1.6);
      }
      // Sections far apart along the lap must be farther apart than their combined half widths.
      // (Collect violations and assert once: 350,000 expect() calls make this test take seconds.)
      let violations = 0;
      for (let i = 0; i < n; i += 3) {
        for (let j = i + 1; j < n; j += 3) {
          const gap = Math.abs(t.samples[j].dist - t.samples[i].dist);
          const along = t.closed ? Math.min(gap, t.length - gap) : gap;
          if (along < 900) continue;
          const d = Math.hypot(t.samples[i].x - t.samples[j].x, t.samples[i].y - t.samples[j].y);
          if (d <= (t.samples[i].width + t.samples[j].width) / 2 + 40) violations++;
        }
      }
      expect(violations).toBe(0);
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

describe('point-to-point track (Reims)', () => {
  const t = loadTrack('reimsCanal');

  it('is open, at true scale, about 10 km long', () => {
    expect(t.closed).toBe(false);
    expect(t.laps).toBe(1);
    const km = t.lapLength / (t.def.pxPerM ?? 1) / 1000;
    expect(km).toBeGreaterThan(9);
    expect(km).toBeLessThan(11);
    expect(t.startDist).toBeGreaterThan(200); // room for the starting grid
    expect(t.length - (t.startDist + t.lapLength)).toBeGreaterThan(300); // room to slow down after the finish
  });

  it('maps progress to positions without wrapping', () => {
    expect(t.alongOf(0)).toBe(t.startDist);
    expect(t.alongOf(-80)).toBe(t.startDist - 80);
    expect(t.advance(123, t.startDist + 500)).toBe(500);
    expect(t.wrap(-5)).toBe(0);
    expect(t.wrap(t.samples.length + 5)).toBe(t.samples.length - 1);
  });

  it('is wide enough for a boat everywhere', () => {
    expect(Math.min(...t.samples.map((s) => s.width))).toBeGreaterThan(100);
  });
});
