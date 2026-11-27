import { describe, expect, it } from 'vitest';
import { BOATS, deriveStats } from '../src/data/boats';
import { addEffect, computeMods } from '../src/effects/effects';
import { stepBoat, speedOf } from '../src/physics/BoatPhysics';
import { angleDiff } from '../src/physics/math';
import { RaceSimulation } from '../src/race/RaceSimulation';
import { loadTrack } from '../src/data/tracks';
import type { Racer } from '../src/race/types';

function fresh(boatId: string): Racer {
  const sim = new RaceSimulation({ track: loadTrack('lockAndLoad'), playerBoat: boatId, difficulty: 'river', seed: 1 });
  const r = sim.player!;
  r.vx = r.vy = 0;
  return r;
}

describe('boat physics', () => {
  it('settles at top speed under full throttle', () => {
    for (const b of BOATS) {
      const r = fresh(b.id);
      r.pace = 1;
      for (let i = 0; i < 60 * 30; i++) stepBoat(r, { desiredHeading: r.heading, throttle: 1, fire: 'none' }, 1 / 60, true);
      expect(speedOf(r)).toBeGreaterThan(deriveStats(b).topSpeed * 0.97);
      expect(speedOf(r)).toBeLessThan(deriveStats(b).topSpeed * 1.03);
    }
  });

  it('coasts to a stop', () => {
    const r = fresh('tugboat');
    for (let i = 0; i < 60 * 5; i++) stepBoat(r, { desiredHeading: r.heading, throttle: 1, fire: 'none' }, 1 / 60, true);
    for (let i = 0; i < 60 * 15; i++) stepBoat(r, { desiredHeading: null, throttle: 0, fire: 'none' }, 1 / 60, true);
    expect(speedOf(r)).toBeLessThan(10);
  });

  it('ignores throttle before GO', () => {
    const r = fresh('tugboat');
    for (let i = 0; i < 120; i++) stepBoat(r, { desiredHeading: r.heading, throttle: 1, fire: 'none' }, 1 / 60, false);
    expect(speedOf(r)).toBe(0);
  });

  it('limits the turn rate', () => {
    const r = fresh('narrowboat');
    for (let i = 0; i < 60 * 3; i++) stepBoat(r, { desiredHeading: r.heading, throttle: 1, fire: 'none' }, 1 / 60, true);
    const h0 = r.heading;
    stepBoat(r, { desiredHeading: h0 + Math.PI, throttle: 1, fire: 'none' }, 1 / 60, true);
    expect(Math.abs(angleDiff(r.heading, h0))).toBeLessThanOrEqual(r.stats.turnRate / 60 + 1e-9);
  });

  it('applies effect multipliers', () => {
    const r = fresh('tugboat');
    addEffect(r, 'boost', 2);
    expect(computeMods(r).topSpeed).toBeGreaterThan(1.4);
    addEffect(r, 'spinOut', 1);
    expect(computeMods(r).control).toBe(0);
  });

  it('heavier boats have more mass and fewer spin-outs', () => {
    const barge = deriveStats(BOATS[0]);
    const speedboat = deriveStats(BOATS[3]);
    expect(barge.mass).toBeGreaterThan(speedboat.mass);
    expect(barge.spinMult).toBeLessThan(speedboat.spinMult);
    expect(speedboat.topSpeed).toBeGreaterThan(barge.topSpeed);
  });
});
