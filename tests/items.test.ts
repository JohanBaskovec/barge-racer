import { describe, expect, it } from 'vitest';
import { TUNING } from '../src/data/items';
import { loadTrack } from '../src/data/tracks';
import { addEffect, hasEffect } from '../src/effects/effects';
import { RaceSimulation, STEP } from '../src/race/RaceSimulation';
import type { Racer } from '../src/race/types';

/** A 4-AI race, past the countdown, with the AI's own item use switched off by emptying slots each step. */
function raceReady(seed = 1, trackId = 'lockAndLoad'): RaceSimulation {
  const sim = new RaceSimulation({ track: loadTrack(trackId), playerBoat: null, difficulty: 'river', seed });
  for (let i = 0; i < 4 * 60; i++) sim.step(STEP); // countdown
  for (const r of sim.racers) r.slots = [null, null];
  return sim;
}
const quiet = (sim: RaceSimulation): void => {
  for (const r of sim.racers) r.slots = [null, null];
  sim.items.volunteers.length = sim.items.drills.length = sim.items.blobs.length = sim.items.puddles.length = sim.items.fakeCrates.length = 0;
};
const step = (sim: RaceSimulation, seconds: number, hold?: () => void): void => {
  for (let i = 0; i < seconds / STEP; i++) {
    hold?.();
    sim.step(STEP);
  }
};
const place = (r: Racer, x: number, y: number): void => {
  r.x = x;
  r.y = y;
  r.vx = r.vy = 0;
};

describe('two item slots', () => {
  it('fills the first free slot, then the second, and refuses a third', () => {
    const sim = raceReady();
    const r = sim.racers[0];
    sim.items.give(r, 'glue');
    sim.items.give(r, 'drill');
    expect(r.slots.map((s) => s?.id)).toEqual(['glue', 'drill']);
    expect(sim.items.freeSlot(r)).toBe(-1);
    sim.items.give(r, 'jigsaw');
    expect(r.slots.map((s) => s?.id)).toEqual(['glue', 'drill']);
  });

  it('fires the chosen slot and leaves the other alone', () => {
    const sim = raceReady();
    const r = sim.racers[0];
    sim.items.give(r, 'glue');
    sim.items.give(r, 'whitePowder');
    sim.items.use(r, 1, 'forward');
    expect(r.slots.map((s) => s?.id ?? null)).toEqual(['glue', null]);
    expect(hasEffect(r, 'boost')).toBe(true);
    sim.items.use(r, 0, 'forward');
    expect(r.slots).toEqual([null, null]);
    expect(sim.items.puddles.length).toBe(1);
  });

  it('a multi-use item keeps its slot until used up', () => {
    const sim = raceReady();
    const r = sim.racers[0];
    sim.items.give(r, 'bigBag');
    sim.items.use(r, 0, 'forward');
    sim.items.use(r, 0, 'forward');
    expect(r.slots[0]).toEqual({ id: 'bigBag', uses: 1 });
  });

  it('a crate gives nothing when both slots are full', () => {
    const sim = raceReady();
    const r = sim.racers[0];
    const crate = sim.items.crates[0];
    sim.items.give(r, 'glue');
    sim.items.give(r, 'drill');
    for (const o of sim.racers) if (o !== r) place(o, crate.x + 9000, crate.y);
    place(r, crate.x, crate.y);
    sim.step(STEP);
    expect(crate.respawn).toBeGreaterThan(0); // it still breaks
    expect(r.rouletteItem).toBeNull();
  });
});

describe('beer', () => {
  it('heals immediately by half the hull, without taking a slot', () => {
    const sim = raceReady();
    const r = sim.racers[0];
    r.hull = r.stats.maxHull * 0.2;
    sim.items.give(r, 'beer');
    expect(r.hull).toBeCloseTo(r.stats.maxHull * 0.7, 5);
    expect(r.slots).toEqual([null, null]);
    expect(sim.takeEvents().some((e) => e.type === 'heal' && e.racer === r.id)).toBe(true);
  });

  it('never heals above the maximum', () => {
    const sim = raceReady();
    const r = sim.racers[0];
    r.hull = r.stats.maxHull * 0.9;
    sim.items.give(r, 'beer');
    expect(r.hull).toBe(r.stats.maxHull);
  });

  it('comes out of a crate and is applied when the roulette lands', () => {
    const sim = raceReady();
    const r = sim.racers[0];
    r.hull = r.stats.maxHull * 0.3;
    r.rouletteItem = 'beer';
    r.rouletteT = 0.5;
    step(sim, 0.7);
    expect(r.hull).toBeGreaterThan(r.stats.maxHull * 0.6);
    expect(r.slots).toEqual([null, null]);
  });
});

describe('fake crate', () => {
  it('is dropped behind the boat and hurts the first boat that drives into it', () => {
    const sim = raceReady();
    const [owner, victim] = sim.racers;
    sim.items.give(owner, 'fakeCrate');
    sim.items.use(owner, 0, 'forward');
    const f = sim.items.fakeCrates[0];
    const behind = Math.cos(owner.heading + Math.PI) * (f.x - owner.x) + Math.sin(owner.heading + Math.PI) * (f.y - owner.y);
    expect(behind).toBeGreaterThan(0);

    victim.hull = victim.stats.maxHull;
    for (const o of sim.racers) if (o !== victim) place(o, f.x + 9000, f.y);
    place(victim, f.x, f.y);
    sim.step(STEP);
    expect(victim.hull).toBe(victim.stats.maxHull - TUNING.fakeCrate.damage);
    expect(hasEffect(victim, 'spinOut')).toBe(true);
    expect(sim.items.fakeCrates.length).toBe(0);
    const ev = sim.takeEvents().find((e) => e.type === 'hit' && e.source === 'fakeCrate');
    expect(ev).toBeTruthy();
  });

  it('is harmless to its owner for a moment, then arms against everyone', () => {
    const sim = raceReady();
    const owner = sim.racers[0];
    sim.items.give(owner, 'fakeCrate');
    sim.items.use(owner, 0, 'forward');
    const f = sim.items.fakeCrates[0];
    for (const o of sim.racers) if (o !== owner) place(o, f.x + 9000, f.y);
    place(owner, f.x, f.y);
    sim.step(STEP);
    expect(sim.items.fakeCrates.length).toBe(1);
    step(sim, TUNING.fakeCrate.ownerImmunity + 0.2, () => place(owner, f.x, f.y));
    expect(owner.hull).toBeLessThan(owner.stats.maxHull);
  });

  it('does not exist as a real crate: it is not in the crate list', () => {
    const sim = raceReady();
    const before = sim.items.crates.length;
    sim.items.give(sim.racers[0], 'fakeCrate');
    sim.items.use(sim.racers[0], 0, 'forward');
    expect(sim.items.crates.length).toBe(before);
  });

  it('a blinking boat drives through it and the trap stays armed', () => {
    const sim = raceReady();
    const [owner, victim] = sim.racers;
    sim.items.give(owner, 'fakeCrate');
    sim.items.use(owner, 0, 'forward');
    const f = sim.items.fakeCrates[0];
    for (const o of sim.racers) if (o !== victim) place(o, f.x + 9000, f.y);
    addEffect(victim, 'invulnerable', 1);
    place(victim, f.x, f.y);
    sim.step(STEP);
    expect(sim.items.fakeCrates.length).toBe(1);
  });
});

describe('silicone gun', () => {
  it('shoots glue forward instead of dropping it behind, with two shots', () => {
    const sim = raceReady();
    const r = sim.racers[0];
    sim.items.give(r, 'siliconeGun');
    sim.items.use(r, 0, 'forward');
    expect(r.slots[0]).toEqual({ id: 'siliconeGun', uses: 1 });
    expect(sim.items.blobs.length).toBe(1);
    expect(sim.items.puddles.length).toBe(0); // nothing is dropped behind
    const b = sim.items.blobs[0];
    expect((b.x - r.x) * Math.cos(r.heading) + (b.y - r.y) * Math.sin(r.heading)).toBeGreaterThan(0);
  });

  it('glues the boat it hits: a puddle appears on it and slows it', () => {
    const sim = raceReady();
    const [shooter, target] = sim.racers;
    // Put the target straight ahead of the shooter on open water.
    const p = sim.track.pointAt(sim.track.alongOf(shooter.progress + 260));
    place(target, p.x, p.y);
    shooter.heading = Math.atan2(target.y - shooter.y, target.x - shooter.x);
    for (const o of sim.racers) if (o !== shooter && o !== target) place(o, p.x + 9000, p.y);
    sim.items.give(shooter, 'siliconeGun');
    sim.items.use(shooter, 0, 'forward');
    step(sim, 0.8, () => place(target, p.x, p.y));
    expect(sim.items.puddles.length).toBe(1);
    const puddle = sim.items.puddles[0];
    expect(Math.hypot(puddle.x - p.x, puddle.y - p.y)).toBeLessThan(40);
    expect(hasEffect(target, 'glued')).toBe(true);
  });

  it('leaves a puddle on the water where it runs out of range', () => {
    const sim = raceReady();
    const r = sim.racers[0];
    for (const o of sim.racers) if (o !== r) place(o, r.x + 9000, r.y);
    const p = sim.track.pointAt(sim.track.alongOf(r.progress));
    r.heading = p.heading;
    sim.items.give(r, 'siliconeGun');
    sim.items.use(r, 0, 'forward');
    step(sim, 2);
    expect(sim.items.blobs.length).toBe(0);
    expect(sim.items.puddles.length).toBe(1);
  });
});

describe('boats that have just been hit do not collide', () => {
  it('pass through each other while blinking, and collide normally otherwise', () => {
    const sim = raceReady();
    const [a, b] = sim.racers;
    for (const o of sim.racers) if (o !== a && o !== b) place(o, a.x + 9000, a.y);
    quiet(sim);
    place(a, b.x - 20, b.y);
    a.vx = 200;
    const startX = a.x;
    addEffect(b, 'invulnerable', 1.5);
    sim.step(STEP);
    expect(a.x - startX).toBeCloseTo(200 * STEP, 0); // not bounced, not pushed apart
    expect(sim.isIntangible(b)).toBe(true);

    // Same overlap once nobody is blinking: they get pushed apart.
    const sim2 = raceReady();
    const [c, d] = sim2.racers;
    for (const o of sim2.racers) if (o !== c && o !== d) place(o, c.x + 9000, c.y);
    place(c, d.x - 20, d.y);
    c.vx = 200;
    sim2.step(STEP);
    expect(Math.hypot(c.x - d.x, c.y - d.y)).toBeGreaterThan(40);
  });

  it('a boat that is spun out by an item stays intangible until it recovers', () => {
    const sim = raceReady();
    const r = sim.racers[0];
    expect(sim.isIntangible(r)).toBe(false);
    sim.hit(r, 10, 1, 'drill');
    expect(hasEffect(r, 'spinOut')).toBe(true);
    expect(sim.isIntangible(r)).toBe(true);
    step(sim, TUNING.hitInvulnerable + 0.1);
    expect(sim.isIntangible(r)).toBe(false);
  });
});

describe('mushroom', () => {
  it('can be held and used, and changes nothing in the simulation', () => {
    const sim = raceReady();
    const r = sim.racers[0];
    const before = { hull: r.hull, effects: r.effects.length, blobs: sim.items.blobs.length };
    sim.items.give(r, 'mushroom');
    sim.items.use(r, 0, 'forward');
    expect(r.slots[0]).toBeNull();
    expect({ hull: r.hull, effects: r.effects.length, blobs: sim.items.blobs.length }).toEqual(before);
    expect(sim.takeEvents().some((e) => e.type === 'itemUsed' && e.item === 'mushroom')).toBe(true);
  });
});

describe('AI with two slots', () => {
  it('still finishes a full race using the new items', { timeout: 60000 }, () => {
    const sim = new RaceSimulation({ track: loadTrack('bayouBends'), playerBoat: null, difficulty: 'river', seed: 21 });
    const used = new Set<string>();
    for (let i = 0; i < 400 / STEP && sim.phase !== 'over'; i++) {
      sim.step(STEP);
      for (const e of sim.takeEvents()) if (e.type === 'itemUsed') used.add(e.item);
    }
    expect(sim.racers.every((r) => r.finished)).toBe(true);
    expect(used.size).toBeGreaterThanOrEqual(4);
  });
});
