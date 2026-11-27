import { describe, expect, it } from 'vitest';
import { BOATS, deriveStats } from '../src/data/boats';
import { loadTrack } from '../src/data/tracks';
import { capsule, isTouching, resolveBank, resolveBoatPair } from '../src/physics/collisions';
import { RaceSimulation } from '../src/race/RaceSimulation';
import type { Racer } from '../src/race/types';
import { session } from '../src/session';

describe('boat roster', () => {
  it('starts with the Garden Barge, which is also the default boat', () => {
    expect(BOATS[0].id).toBe('gardenBarge');
    expect(session.boatId).toBe('gardenBarge');
  });

  it('keeps every boat balanced: ratings add up to 30', () => {
    for (const b of BOATS) {
      const r = b.ratings;
      expect(r.speed + r.accel + r.handling + r.weight + r.hull, b.id).toBe(30);
    }
  });

  it('the Garden Barge is the longest and thinnest boat, drawn in its own colours', () => {
    const barge = BOATS[0];
    for (const b of BOATS.slice(1)) {
      expect(barge.size.length).toBeGreaterThan(b.size.length);
      expect(barge.size.length / barge.size.width).toBeGreaterThan(b.size.length / b.size.width);
    }
    expect(barge.accent).toBe(true);
  });

  it('every boat id is unique', () => {
    expect(new Set(BOATS.map((b) => b.id)).size).toBe(BOATS.length);
  });

  it('the capsule covers the whole hull', () => {
    for (const b of BOATS) {
      const s = deriveStats(b);
      expect(2 * (s.halfLen + s.capRadius)).toBeCloseTo(b.size.length, 5);
      expect(2 * s.capRadius).toBeGreaterThanOrEqual(b.size.width);
    }
  });
});

describe('capsule collisions (long boats)', () => {
  const two = (): [Racer, Racer, RaceSimulation] => {
    const sim = new RaceSimulation({ track: loadTrack('lockAndLoad'), playerBoat: 'gardenBarge', difficulty: 'river', seed: 1 });
    const a = sim.player!;
    const b = sim.racers.find((r) => r !== a)!;
    for (const r of [a, b]) {
      r.vx = r.vy = 0;
      r.heading = 0;
    }
    return [a, b, sim];
  };

  it('a boat touching the very tip of the barge collides, though the old circle would have missed', () => {
    const [barge, other] = two();
    barge.x = 0; barge.y = 0;
    // Just past the bow tip (75 px from the centre), well outside the old circle (radius 44).
    other.x = 75 + other.stats.capRadius + other.stats.halfLen - 6; other.y = 0;
    other.vx = -100;
    expect(Math.hypot(other.x - barge.x, other.y - barge.y)).toBeGreaterThan(barge.stats.radius + other.stats.radius);
    expect(resolveBoatPair(barge, other)).toBeGreaterThan(0);
  });

  it('boats side by side are as close as their hulls allow, not their length', () => {
    const [barge, other] = two();
    barge.x = 0; barge.y = 0;
    other.x = 0; other.y = barge.stats.capRadius + other.stats.capRadius + 2;
    expect(resolveBoatPair(barge, other)).toBe(0); // 2 px apart: no contact
    other.y -= 4;
    other.vy = -50;
    expect(resolveBoatPair(barge, other)).toBeGreaterThan(0);
  });

  it('items hit the barge anywhere along its hull', () => {
    const [barge] = two();
    barge.x = 0; barge.y = 0;
    expect(isTouching(barge, 70, 0, 4)).toBe(true); // at the bow
    expect(isTouching(barge, -70, 0, 4)).toBe(true); // at the stern
    expect(isTouching(barge, 0, 30, 4)).toBe(false); // beside it
  });

  it("the barge's bow is kept out of the bank when it points into it", () => {
    const [barge, , sim] = two();
    const t = sim.track;
    const s = t.samples[40];
    // Put the barge near one bank, angled 40 degrees towards it.
    const side = t.halfWidth(40) - 30;
    barge.x = s.x + s.nx * side; barge.y = s.y + s.ny * side;
    barge.heading = Math.atan2(s.ty, s.tx) + 0.7;
    barge.nearestIndex = 40;
    for (let i = 0; i < 3; i++) resolveBank(barge, t);
    const c = capsule(barge, 0.7);
    for (const [x, y] of [[c.ax, c.ay], [c.bx, c.by]]) {
      const n = t.nearest(x, y, 40);
      expect(Math.abs(n.lateral)).toBeLessThanOrEqual(t.halfWidth(n.index) - barge.stats.capRadius + 0.5);
    }
  });
});

describe('starting grid', () => {
  it('fits the longest boat without overlapping the row in front', () => {
    const sim = new RaceSimulation({ track: loadTrack('bayouBends'), playerBoat: 'gardenBarge', difficulty: 'river', seed: 3 });
    for (let i = 0; i < sim.racers.length; i++) {
      for (let j = i + 1; j < sim.racers.length; j++) {
        const a = sim.racers[i], b = sim.racers[j];
        const before = { ax: a.x, ay: a.y, bx: b.x, by: b.y };
        expect(resolveBoatPair(a, b), `${a.boat.id} vs ${b.boat.id}`).toBe(0);
        expect([a.x, a.y, b.x, b.y]).toEqual([before.ax, before.ay, before.bx, before.by]);
      }
    }
  });
});
