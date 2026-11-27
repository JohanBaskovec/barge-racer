import { readFileSync } from 'node:fs';
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

describe('Reims bridge labels', () => {
  const scenery = JSON.parse(readFileSync(new URL('../public/maps/reims-canal.json', import.meta.url), 'utf8')) as {
    labels: [number, number, number, string][];
  };
  const t = loadTrack('reimsCanal');

  it('names the bridges that cross the canal, in order along it', () => {
    const names = scenery.labels.map((l) => l[3]);
    expect(names.length).toBeGreaterThanOrEqual(6);
    for (const n of ['Pont de Venise', 'Pont de Fléchambault', 'Pont Huon', 'Pont de Vrilly', 'Pont Saint-Léonard']) expect(names).toContain(n);
    const along = scenery.labels.map(([x, y]) => t.nearest(x, y).along);
    expect([...along].sort((a, b) => a - b)).toEqual(along);
  });

  it('puts every label on the canal, with a valid kind and a name where one is needed', () => {
    for (const [x, y, kind, name] of scenery.labels) {
      const n = t.nearest(x, y);
      expect(Math.abs(n.lateral), name).toBeLessThan(t.halfWidth(n.index));
      expect([0, 1, 2]).toContain(kind);
      if (kind !== 2) expect(name.length).toBeGreaterThan(3);
    }
  });

  it('has accents restored on names IGN stores in plain capitals', () => {
    const names = scenery.labels.map((l) => l[3]).join('|');
    expect(names).not.toMatch(/Flechambault|Nicephore|Niepce|Leonard/);
  });
});

describe('Reims street labels', () => {
  const scenery = JSON.parse(readFileSync(new URL('../public/maps/reims-canal.json', import.meta.url), 'utf8')) as {
    streets: [number, number, number, number, string, number][];
  };
  const t = loadTrack('reimsCanal');
  const px = t.def.pxPerM ?? 10;

  it('has a good number of named streets', () => {
    expect(scenery.streets.length).toBeGreaterThan(40);
    const names = scenery.streets.map((s) => s[4]);
    for (const n of ['Boulevard Paul Doumer', 'Rue de Venise', 'Rue Clovis', 'Boulevard Docteur Henri Henrot']) expect(names).toContain(n);
  });

  it('writes each name along its street: upright, sized to fit, near the canal but not on the water', () => {
    let wrong = 0;
    for (const [x, y, angle, font, name, len] of scenery.streets) {
      const n = t.nearest(x, y);
      const ok =
        name.length > 2 &&
        angle > (-Math.PI / 2) * 1000 && angle <= (Math.PI / 2) * 1000 + 1 && // reads left to right, never upside down
        font >= 13 && font <= 26 &&
        len > 0 &&
        Math.abs(n.lateral) > t.halfWidth(n.index) && // on land
        Math.sqrt(n.distSq) < 150 * px + 400; // within the corridor of the canal
      if (!ok) wrong++;
    }
    expect(wrong).toBe(0);
  });

  it('puts one name per street: repeats are 1.5 km apart or more', () => {
    const byName = new Map<string, [number, number][]>();
    for (const [x, y, , , name] of scenery.streets) byName.set(name, [...(byName.get(name) ?? []), [x, y]]);
    for (const [name, spots] of byName) {
      for (let i = 0; i < spots.length; i++) {
        for (let j = i + 1; j < spots.length; j++) {
          expect(Math.hypot(spots[i][0] - spots[j][0], spots[i][1] - spots[j][1]) / px, name).toBeGreaterThanOrEqual(1500 - 1);
        }
      }
    }
  });

  it('expanded the abbreviations BAN uses', () => {
    const names = scenery.streets.map((s) => s[4]).join('|');
    expect(names).not.toMatch(/(^|\|)(R|Bd|Av) /);
  });
});
