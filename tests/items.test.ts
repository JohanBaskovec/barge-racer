import { describe, expect, it } from 'vitest';
import { AIController } from '../src/control/AIController';
import { DIFFICULTIES } from '../src/data/difficulty';
import { TUNING } from '../src/data/items';
import { loadTrack } from '../src/data/tracks';
import { addEffect, hasEffect } from '../src/effects/effects';
import { RaceSimulation, STEP } from '../src/race/RaceSimulation';
import { Rng } from '../src/physics/math';
import { capsule } from '../src/physics/collisions';
import type { Controller, ControlIntent, Racer } from '../src/race/types';

/** A 4-AI race, past the countdown, with the AI's own item use switched off by emptying slots each step. */
function raceReady(seed = 1, trackId = 'lockAndLoad'): RaceSimulation {
  const sim = new RaceSimulation({ track: loadTrack(trackId), playerBoat: null, difficulty: 'river', seed });
  for (let i = 0; i < 4 * 60; i++) sim.step(STEP); // countdown
  for (const r of sim.racers) r.slots = [null, null];
  return sim;
}
const quiet = (sim: RaceSimulation): void => {
  for (const r of sim.racers) r.slots = [null, null];
  sim.items.volunteers.length = sim.items.drills.length = sim.items.blobs.length = sim.items.puddles.length = sim.items.fakeCrates.length = sim.items.shots.length = sim.items.clouds.length = 0;
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
    sim.items.give(r, 'whitePowder', true);
    sim.items.use(r, 0, 'forward');
    sim.items.use(r, 0, 'forward');
    expect(r.slots[0]).toEqual({ id: 'whitePowder', uses: 1, triple: true });
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
  it('is held in a slot like any item, and heals by half the hull when used', () => {
    const sim = raceReady();
    const r = sim.racers[0];
    r.hull = r.stats.maxHull * 0.2;
    sim.items.give(r, 'beer');
    expect(r.slots[0]).toEqual({ id: 'beer', uses: 1 });
    expect(r.hull).toBeCloseTo(r.stats.maxHull * 0.2, 5); // not drunk yet
    sim.items.use(r, 0, 'forward');
    expect(r.hull).toBeCloseTo(r.stats.maxHull * 0.7, 5);
    expect(r.slots).toEqual([null, null]);
    expect(sim.takeEvents().some((e) => e.type === 'heal' && e.racer === r.id)).toBe(true);
  });

  it('never heals above the maximum', () => {
    const sim = raceReady();
    const r = sim.racers[0];
    r.hull = r.stats.maxHull * 0.9;
    sim.items.give(r, 'beer');
    sim.items.use(r, 0, 'forward');
    expect(r.hull).toBe(r.stats.maxHull);
  });

  it('comes out of a crate into a slot, to drink whenever you like', () => {
    const sim = raceReady();
    const r = sim.racers[0];
    r.hull = r.stats.maxHull * 0.3;
    r.rouletteItem = 'beer';
    r.rouletteT = 0.5;
    step(sim, 0.7);
    expect(r.slots[0]).toEqual({ id: 'beer', uses: 1 });
    expect(r.hull).toBeLessThan(r.stats.maxHull * 0.5);
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

/** A controller that drives along the centre line at full throttle. */
const driver: Controller = {
  update(r: Racer, sim: RaceSimulation): ControlIntent {
    const p = sim.track.pointAt(sim.track.alongOf(r.progress) + 140);
    return { desiredHeading: Math.atan2(p.y - r.y, p.x - r.x), throttle: 1, fire: null };
  },
};
const idle: Controller = { update: () => ({ desiredHeading: null, throttle: 0, fire: null }) };
/**
 * A race past the countdown with everyone but `keep` parked far away. Nobody drives (give the boats
 * you keep a controller yourself) and the crates are out of play, so nothing lands in the slots.
 */
function lone(keep: number[], seed = 5, trackId = 'lockAndLoad'): RaceSimulation {
  const sim = new RaceSimulation({ track: loadTrack(trackId), playerBoat: null, difficulty: 'river', seed });
  for (let i = 0; i < 4 * 60; i++) sim.step(STEP);
  for (const c of sim.items.crates) c.respawn = 1e9;
  sim.traffic.barges.length = 0; // no barges wandering through (tests/traffic.test.ts covers them)
  sim.trafficPoses = [];
  for (const r of sim.racers) {
    r.slots = [null, null];
    sim.setController(r.id, idle);
    r.vx = r.vy = 0;
    if (!keep.includes(r.id)) place(r, r.x + 40000, r.y);
    sims.set(r, sim);
  }
  return sim;
}
/** Put `r` at `f` px ahead of `ref` along its heading and `p` px to its left, going the same way. */
const placeBeside = (r: Racer, ref: Racer, f: number, p: number): void => {
  const c = Math.cos(ref.heading), sn = Math.sin(ref.heading);
  r.x = ref.x + c * f - sn * p;
  r.y = ref.y + sn * f + c * p;
  r.heading = ref.heading;
  r.vx = ref.vx;
  r.vy = ref.vy;
  const sim = sims.get(r);
  if (sim) r.nearestIndex = sim.track.nearest(r.x, r.y, -1).index; // or the bank check thinks it is elsewhere
};
/** The race a racer belongs to (set by lone()). */
const sims = new WeakMap<Racer, RaceSimulation>();

describe('mushroom', () => {
  it('shrinks whoever was ahead, speeds up whoever was behind, and keeps the user as a crate magnet', () => {
    const sim = raceReady();
    const r = sim.racers[1];
    r.progress = 1000;
    sim.racers[0].progress = 1500; // ahead
    sim.racers[2].progress = 600; // behind
    sim.racers[3].progress = 900; // behind
    sim.items.give(r, 'mushroom');
    sim.items.use(r, 0, 'forward');
    expect(r.slots[0]).toBeNull();
    expect(hasEffect(r, 'magnet')).toBe(true);
    expect(hasEffect(sim.racers[0], 'shrunk')).toBe(true);
    expect(hasEffect(sim.racers[2], 'hasty')).toBe(true);
    expect(hasEffect(sim.racers[3], 'hasty')).toBe(true);
    expect(hasEffect(sim.racers[0], 'hasty')).toBe(false);
    expect(hasEffect(r, 'shrunk') || hasEffect(r, 'hasty')).toBe(false); // the user is neither
    expect(r.effects.find((e) => e.kind === 'magnet')!.duration).toBe(TUNING.mushroom.duration);
    expect(sim.takeEvents().some((e) => e.type === 'itemUsed' && e.item === 'mushroom')).toBe(true);
  });

  it('shrunk boats really get smaller (hull, mass) and a little slower; hasty ones go faster; all wears off', () => {
    const sim = raceReady();
    const [user, ahead, behind] = sim.racers;
    user.progress = 1000;
    ahead.progress = 2000;
    behind.progress = 0;
    const len = capsule(ahead).radius;
    const mass = ahead.stats.mass;
    sim.items.give(user, 'mushroom');
    sim.items.use(user, 0, 'forward');
    step(sim, 0.6);
    expect(ahead.size).toBeCloseTo(TUNING.mushroom.shrink, 5);
    expect(capsule(ahead).radius).toBeCloseTo(len * TUNING.mushroom.shrink, 5);
    expect(ahead.stats.mass).toBeLessThan(mass * 0.5);
    expect(behind.size).toBe(1);
    step(sim, TUNING.mushroom.duration + 0.5);
    expect(hasEffect(ahead, 'shrunk')).toBe(false);
    expect(ahead.size).toBe(1);
    expect(ahead.stats.mass).toBe(mass);
    expect(hasEffect(behind, 'hasty')).toBe(false);
  });

  it('hasty boats outrun the same boat without the effect, shrunk ones lag behind it', () => {
    const run = (effect: 'hasty' | 'shrunk' | null): number => {
      const sim = lone([0]);
      sim.setController(0, driver);
      const r = sim.racers[0];
      if (effect) addEffect(r, effect, 20);
      step(sim, 8);
      return r.progress;
    };
    const base = run(null);
    expect(run('hasty')).toBeGreaterThan(base + 150);
    expect(run('shrunk')).toBeLessThan(base - 100);
  });

  it('pulls crates in range towards the user, who then picks them up; the others stay put', () => {
    const sim = lone([0]);
    const user = sim.racers[0];
    const near = sim.items.crates[0], far = sim.items.crates[1];
    placeBeside(user, user, 0, 0);
    const spot = (c: typeof near, f: number): void => {
      const c0 = Math.cos(user.heading), s0 = Math.sin(user.heading);
      c.homeX = c.x = user.x + c0 * f;
      c.homeY = c.y = user.y + s0 * f;
      c.respawn = 0;
    };
    spot(near, 600);
    spot(far, TUNING.mushroom.magnetRadius + 800);
    const farX = far.x, farY = far.y;
    user.vx = user.vy = 0;
    sim.setController(0, idle);
    sim.items.give(user, 'mushroom');
    sim.items.use(user, 0, 'forward');
    const d0 = Math.hypot(near.x - user.x, near.y - user.y);
    step(sim, 0.3);
    expect(Math.hypot(near.x - user.x, near.y - user.y)).toBeLessThan(d0 - 100); // it flies towards the user
    step(sim, 1.5);
    expect(near.respawn).toBeGreaterThan(0); // collected
    expect(near.x).toBe(near.homeX); // and back in its place for the respawn
    expect(user.rouletteItem !== null || user.slots.some((x) => x !== null)).toBe(true);
    expect([far.x, far.y]).toEqual([farX, farY]); // too far to feel it
  });

  it('lets go of a crate when the magnet runs out: it floats home', () => {
    const sim = lone([0]);
    const user = sim.racers[0];
    const c = sim.items.crates[0];
    c.homeX = user.x + 900;
    c.homeY = user.y + 100;
    c.x = user.x + 700;
    c.y = user.y + 60;
    c.respawn = 0;
    sim.step(STEP);
    expect(Math.hypot(c.x - c.homeX, c.y - c.homeY)).toBeLessThan(260); // heading home, nobody pulling
    step(sim, 2);
    expect([c.x, c.y]).toEqual([c.homeX, c.homeY]);
  });
});

describe('electrical failure', () => {
  it('takes the controls from every opponent: no steering, a frozen throttle, no items; not from the user', () => {
    const sim = lone([0, 1]);
    const [user, victim] = sim.racers;
    sim.setController(user.id, driver);
    sim.setController(victim.id, driver);
    step(sim, 3);
    const throttle = victim.throttle;
    expect(throttle).toBeGreaterThan(0.5);
    sim.items.give(victim, 'glue');
    sim.items.give(user, 'blackout');
    sim.items.use(user, 0, 'forward');
    expect(hasEffect(victim, 'blackout')).toBe(true);
    expect(hasEffect(user, 'blackout')).toBe(false);
    expect(hasEffect(sim.racers[2], 'blackout')).toBe(true); // every opponent, however far
    // The victim now only wants to turn hard and stop; it can't.
    const h = victim.heading;
    sim.setController(victim.id, { update: () => ({ desiredHeading: h + 2, throttle: -1, fire: { slot: 0, dir: 'forward' } }) });
    step(sim, 0.8);
    expect(victim.heading).toBeCloseTo(h, 5);
    expect(victim.throttle).toBeCloseTo(throttle, 5);
    expect(victim.slots[0]).toEqual({ id: 'glue', uses: 1 }); // couldn't use its item
    expect(sim.items.puddles.length).toBe(0);
  });

  it('a boat keeps going straight at its speed and wears it off after a few seconds', () => {
    const sim = lone([0, 1]);
    const [user, victim] = sim.racers;
    sim.setController(victim.id, driver);
    step(sim, 4);
    sim.items.give(user, 'blackout');
    sim.items.use(user, 0, 'forward');
    const h = victim.heading;
    const speed = Math.hypot(victim.vx, victim.vy);
    step(sim, 1);
    expect(Math.hypot(victim.vx, victim.vy)).toBeGreaterThan(speed * 0.9); // can't change speed
    expect(Math.abs(victim.heading - h)).toBeLessThan(0.02);
    step(sim, TUNING.blackout.duration);
    expect(hasEffect(victim, 'blackout')).toBe(false);
    step(sim, 1);
    expect(Math.abs(victim.heading - h)).toBeGreaterThan(0.001); // steering again
  });
});

describe('ultimate raclette', () => {
  it('fires a potato and two slices of ham ahead in a fan, and leaves melted cheese behind', () => {
    const sim = lone([0]);
    const r = sim.racers[0];
    sim.items.give(r, 'raclette');
    sim.items.use(r, 0, 'forward');
    expect(r.slots[0]).toBeNull();
    const shots = sim.items.shots;
    expect(shots.map((x) => x.kind).sort()).toEqual([0, 1, 1]);
    for (const x of shots) expect((x.x - r.x) * Math.cos(r.heading) + (x.y - r.y) * Math.sin(r.heading)).toBeGreaterThan(0);
    const headings = shots.map((x) => x.heading - r.heading).sort((a, b) => a - b);
    expect(headings[0]).toBeLessThan(0);
    expect(headings[2]).toBeGreaterThan(0);
    expect(sim.items.clouds.length).toBe(1);
    const cheese = sim.items.clouds[0];
    expect(cheese.kind).toBe(0);
    expect((cheese.x - r.x) * Math.cos(r.heading) + (cheese.y - r.y) * Math.sin(r.heading)).toBeLessThan(0);
  });

  it('fires the same way when swiped backwards: shots ahead, cheese behind', () => {
    const sim = lone([0]);
    const r = sim.racers[0];
    sim.items.give(r, 'raclette');
    sim.items.use(r, 0, 'backward');
    for (const x of sim.items.shots) expect((x.x - r.x) * Math.cos(r.heading) + (x.y - r.y) * Math.sin(r.heading)).toBeGreaterThan(0);
  });

  it('a potato hurts and covers the boat it hits in cheese', () => {
    const sim = lone([0, 1]);
    const [shooter, target] = sim.racers;
    placeBeside(target, shooter, 300, 0);
    sim.items.give(shooter, 'raclette');
    sim.items.use(shooter, 0, 'forward');
    const hull = target.hull;
    for (let i = 0; i < 90; i++) {
      placeBeside(target, shooter, 300, 0);
      sim.step(STEP);
      if (hasEffect(target, 'cheesed')) break;
    }
    expect(hull - target.hull).toBe(TUNING.raclette.potato.damage);
    expect(hasEffect(target, 'cheesed')).toBe(true);
    expect(sim.takeEvents().some((e) => e.type === 'hit' && e.source === 'raclette')).toBe(true);
  });

  it('whoever drives through the melted cheese gets cheesed, the owner only after a moment', () => {
    const sim = lone([0, 1]);
    const [owner, other] = sim.racers;
    sim.items.give(owner, 'raclette');
    sim.items.use(owner, 0, 'forward');
    sim.items.shots.length = 0;
    const cheese = sim.items.clouds[0];
    place(owner, cheese.x, cheese.y);
    sim.step(STEP);
    expect(hasEffect(owner, 'cheesed')).toBe(false); // just dropped it
    place(other, cheese.x, cheese.y);
    sim.step(STEP);
    expect(hasEffect(other, 'cheesed')).toBe(true);
    expect(other.effects.find((e) => e.kind === 'cheesed')!.remaining).toBeGreaterThan(TUNING.raclette.cheeseTime - 0.1);
    step(sim, TUNING.raclette.cheeseOwnerImmunity + 0.1, () => place(owner, cheese.x, cheese.y));
    expect(hasEffect(owner, 'cheesed')).toBe(true);
    step(sim, TUNING.raclette.cheeseLife, () => {});
    expect(sim.items.clouds.length).toBe(0); // it dries up
  });

  it('shots are smashed by a dildo on the bow they fly into, sparing the boat', () => {
    const sim = lone([0, 1]);
    const [shooter, other] = sim.racers;
    sim.items.give(shooter, 'raclette');
    sim.items.use(shooter, 0, 'forward');
    placeBeside(other, shooter, 220, 0);
    addEffect(other, 'dildo', 3);
    other.heading = shooter.heading + Math.PI;
    const hull = other.hull;
    step(sim, 0.4, () => {
      placeBeside(other, shooter, 220, 0);
      other.heading = shooter.heading + Math.PI;
    });
    expect(sim.items.shots.some((x) => x.kind === 0)).toBe(false);
    expect(other.hull).toBe(hull);
  });
});

describe('clogged toilet', () => {
  it('leaves a cloud of smoke behind that hurts every boat in it, per second', () => {
    const sim = lone([0, 1]);
    const [owner, other] = sim.racers;
    sim.items.give(owner, 'toilet');
    sim.items.use(owner, 0, 'forward');
    expect(owner.slots[0]).toBeNull();
    const cloud = sim.items.clouds[0];
    expect(cloud.kind).toBe(1);
    expect((cloud.x - owner.x) * Math.cos(owner.heading) + (cloud.y - owner.y) * Math.sin(owner.heading)).toBeLessThan(0);
    const hull = other.hull;
    step(sim, 1, () => place(other, cloud.x, cloud.y));
    expect(hull - other.hull).toBeGreaterThan(TUNING.toilet.dps * 0.9);
    expect(hull - other.hull).toBeLessThan(TUNING.toilet.dps * 1.1);
    expect(hasEffect(other, 'spinOut')).toBe(false); // damage, not a hit: no spin, no blinking
    expect(hasEffect(other, 'invulnerable')).toBe(false);
  });

  it('hurts its owner too, after a moment, and the smoke clears after its lifetime', () => {
    const sim = lone([0]);
    const owner = sim.racers[0];
    sim.items.give(owner, 'toilet');
    sim.items.use(owner, 0, 'forward');
    const cloud = sim.items.clouds[0];
    place(owner, cloud.x, cloud.y);
    sim.step(STEP);
    expect(owner.hull).toBe(owner.stats.maxHull); // grace
    step(sim, TUNING.toilet.ownerImmunity + 0.5, () => place(owner, cloud.x, cloud.y));
    expect(owner.stats.maxHull - owner.hull).toBeGreaterThan(TUNING.toilet.dps * 0.3);
    place(owner, cloud.x + 5000, cloud.y);
    step(sim, TUNING.toilet.life + 0.5);
    expect(sim.items.clouds.length).toBe(0);
  });

  it('announces the damage now and then, not every step, and can sink a boat', () => {
    const sim = lone([0, 1]);
    const [owner, other] = sim.racers;
    sim.items.give(owner, 'toilet');
    sim.items.use(owner, 0, 'forward');
    const cloud = sim.items.clouds[0];
    sim.takeEvents();
    step(sim, 1, () => place(other, cloud.x, cloud.y));
    const hits = sim.takeEvents().filter((e) => e.type === 'hit' && e.source === 'toilet' && e.racer === other.id);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits.length).toBeLessThanOrEqual(2);
    other.hull = 5;
    step(sim, 0.5, () => place(other, cloud.x, cloud.y));
    expect(other.sinkTimer > 0 || other.hull > 5).toBe(true); // it went under (and may already be back)
    expect(sim.takeEvents().some((e) => e.type === 'sunk' && e.racer === other.id)).toBe(true);
  });

  it('spares boats that are blinking after a hit', () => {
    const sim = lone([0, 1]);
    const [owner, other] = sim.racers;
    sim.items.give(owner, 'toilet');
    sim.items.use(owner, 0, 'forward');
    const cloud = sim.items.clouds[0];
    addEffect(other, 'invulnerable', 1);
    const hull = other.hull;
    step(sim, 0.5, () => place(other, cloud.x, cloud.y));
    expect(other.hull).toBe(hull);
  });
});

describe('karcher', () => {
  it('pushes a boat alongside sideways, away from the user, into the bank: a crash', () => {
    for (const trackId of ['lockAndLoad', 'bayouBends']) {
      const sim = lone([0, 1], 5, trackId);
      const [user, victim] = sim.racers;
      sim.setController(user.id, driver);
      sim.setController(victim.id, driver);
      const a = sim.track.pointAt(sim.track.alongOf(user.progress + 400));
      Object.assign(user, { x: a.x, y: a.y, heading: a.heading, vx: Math.cos(a.heading) * 300, vy: Math.sin(a.heading) * 300 });
      placeBeside(victim, user, 0, 80);
      step(sim, 1);
      sim.items.give(user, 'karcher');
      sim.items.use(user, 0, 'forward');
      expect(hasEffect(user, 'karcher')).toBe(true);
      sim.takeEvents();
      const side0 = (victim.x - user.x) * -Math.sin(user.heading) + (victim.y - user.y) * Math.cos(user.heading);
      step(sim, 1, () => {});
      const side1 = (victim.x - user.x) * -Math.sin(user.heading) + (victim.y - user.y) * Math.cos(user.heading);
      expect(side1, trackId).toBeGreaterThan(side0 + 20); // pushed away from the user
      expect(hasEffect(victim, 'soaked')).toBe(true);
      let crash = false;
      for (let i = 0; i < 3 / STEP; i++) {
        sim.step(STEP);
        if (sim.takeEvents().some((e) => e.type === 'hit' && e.source === 'karcher' && e.racer === victim.id)) crash = true;
      }
      expect(crash, trackId).toBe(true);
      expect(victim.hull, trackId).toBeLessThan(victim.stats.maxHull);
      expect(user.hull).toBe(user.stats.maxHull);
    }
  });

  it('leaves boats out of reach alone, and the jets stop after their duration', () => {
    const sim = lone([0, 1]);
    const [user, far] = sim.racers;
    // Well ahead of the nozzles, on the water (the canal bends: straight ahead may be the bank).
    const pt = sim.track.pointAt(sim.track.alongOf(user.progress) + 600, 0);
    place(far, pt.x, pt.y);
    far.nearestIndex = sim.track.nearest(pt.x, pt.y, -1).index;
    sim.items.give(user, 'karcher');
    sim.items.use(user, 0, 'forward');
    const { x, y } = far;
    step(sim, 0.5);
    expect(hasEffect(far, 'soaked')).toBe(false);
    expect(Math.hypot(far.x - x, far.y - y)).toBeLessThan(5);
    step(sim, TUNING.karcher.duration);
    expect(hasEffect(user, 'karcher')).toBe(false);
  });

  it('heavy boats are pushed less than light ones', () => {
    const shove = (boat: string): number => {
      const sim = new RaceSimulation({ track: loadTrack('lockAndLoad'), playerBoat: boat, difficulty: 'river', seed: 4 });
      for (let i = 0; i < 4 * 60; i++) sim.step(STEP);
      const user = sim.racers.find((r) => r !== sim.player && r.boat.id !== boat)!;
      const victim = sim.player!;
      for (const o of sim.racers) {
        o.slots = [null, null];
        sim.setController(o.id, idle);
        if (o !== user && o !== victim) place(o, o.x + 40000, o.y);
      }
      const a = sim.track.pointAt(sim.track.alongOf(user.progress + 300));
      Object.assign(user, { x: a.x, y: a.y, heading: a.heading, vx: 0, vy: 0 });
      placeBeside(victim, user, 0, 70);
      victim.vx = victim.vy = 0;
      sim.items.give(user, 'karcher');
      sim.items.use(user, 0, 'forward');
      const p0 = (victim.x - user.x) * -Math.sin(user.heading) + (victim.y - user.y) * Math.cos(user.heading);
      step(sim, 0.4);
      return (victim.x - user.x) * -Math.sin(user.heading) + (victim.y - user.y) * Math.cos(user.heading) - p0;
    };
    expect(shove('cigaretteSpeedboat')).toBeGreaterThan(shove('coalBarge'));
  });
});

describe('weapons hit harder, glue and silicone cost more than a hit', () => {
  it('every weapon does more damage than in the first version (volunteer 30, jigsaw 25, drill 35, fake crate 25)', () => {
    expect(TUNING.volunteer.damage).toBeGreaterThan(30);
    expect(TUNING.jigsaw.damage).toBeGreaterThan(25);
    expect(TUNING.drill.damage).toBeGreaterThan(35);
    expect(TUNING.fakeCrate.damage).toBeGreaterThan(25);
    // ...but only slightly
    for (const [d, old] of [[TUNING.volunteer.damage, 30], [TUNING.jigsaw.damage, 25], [TUNING.drill.damage, 35], [TUNING.fakeCrate.damage, 25]]) expect(d / old).toBeLessThan(1.35);
  });

  /** Metres of progress lost over a stretch to an event, as seconds at the boat's own speed. */
  function timeLost(boatIdx: number, setup: (sim: RaceSimulation, r: Racer) => void): number {
    const run = (withEvent: boolean): { dist: number; speed: number } => {
      const sim = lone([boatIdx]);
      const r = sim.racers[boatIdx];
      sim.setController(r.id, driver);
      step(sim, 4);
      const start = r.progress;
      if (withEvent) setup(sim, r);
      step(sim, 9);
      return { dist: r.progress - start, speed: 0 };
    };
    const base = run(false);
    const ev = run(true);
    return (base.dist - ev.dist) / (base.dist / 9);
  }

  it('crossing a glue puddle costs well over the time a hit costs, for light and heavy boats alike', () => {
    for (const boatIdx of [0, 1, 2]) {
      const hit = timeLost(boatIdx, (sim, r) => void sim.hit(r, 30, 3, 'drill'));
      const glue = timeLost(boatIdx, (sim, r) => {
        const p = sim.track.pointAt(sim.track.alongOf(r.progress + 160));
        sim.items.puddles.push({ id: 900, owner: 3, x: p.x, y: p.y, age: 1, boatsStuck: new Set(), dead: false });
      });
      expect(hit, `boat ${boatIdx}`).toBeGreaterThan(1.2);
      expect(glue, `boat ${boatIdx}`).toBeGreaterThan(hit * 1.4); // clearly more annoying than a hit...
      expect(glue, `boat ${boatIdx}`).toBeLessThan(hit * 3); // ...without being the end of the race
    }
  });

  it('a silicone shot costs the same as the glue it makes', () => {
    const sim = lone([0, 1]);
    const [shooter, target] = sim.racers;
    placeBeside(target, shooter, 250, 0);
    sim.items.give(shooter, 'siliconeGun');
    sim.items.use(shooter, 0, 'forward');
    step(sim, 0.8, () => placeBeside(target, shooter, 250, 0));
    expect(target.inGlue).toBe(true);
    const mods = (target.effects.find((e) => e.kind === 'glued'))!;
    expect(mods.duration).toBe(TUNING.glue.stickyTime);
  });

  it('white powder still beats glue', () => {
    const sim = lone([0]);
    const r = sim.racers[0];
    const p = sim.track.pointAt(sim.track.alongOf(r.progress + 60));
    sim.items.puddles.push({ id: 901, owner: 3, x: p.x, y: p.y, age: 1, boatsStuck: new Set(), dead: false });
    addEffect(r, 'boost', 2);
    place(r, p.x, p.y);
    sim.step(STEP);
    expect(r.inGlue).toBe(false);
    expect(hasEffect(r, 'glued')).toBe(false);
  });
});

describe('the AI uses the new items sensibly', () => {
  const ai = (): AIController => new AIController(new Rng(3), DIFFICULTIES.ocean, 0);
  /** Does the AI want to fire `item` in this situation? */
  function wants(sim: RaceSimulation, r: Racer, item: Parameters<RaceSimulation['items']['give']>[1]): boolean {
    r.slots = [null, null];
    sim.items.give(r, item);
    const c = ai();
    for (let i = 0; i < 12; i++) {
      const f = c.decideFire(r, sim, 0.5, 200);
      if (f) return true;
    }
    return false;
  }

  it('drinks a beer when damaged, not when healthy', () => {
    const sim = lone([0]);
    const r = sim.racers[0];
    r.hull = r.stats.maxHull;
    expect(wants(sim, r, 'beer')).toBe(false);
    r.hull = r.stats.maxHull * 0.4;
    expect(wants(sim, r, 'beer')).toBe(true);
  });

  it('eats a mushroom when more boats are ahead than behind, not when leading', () => {
    const sim = lone([0, 1, 2, 3]);
    for (const r of sim.racers) sim.setController(r.id, idle);
    const [a, b, c, d] = sim.racers;
    a.progress = 1000; b.progress = 800; c.progress = 600; d.progress = 400;
    expect(wants(sim, a, 'mushroom')).toBe(false); // leading: everyone behind would speed up
    expect(wants(sim, d, 'mushroom')).toBe(true); // last: everyone ahead shrinks
  });

  it('sprays a Kärcher at a boat alongside, not at an empty river', () => {
    const sim = lone([0, 1]);
    const [r, o] = sim.racers;
    place(o, r.x + 20000, r.y);
    expect(wants(sim, r, 'karcher')).toBe(false);
    placeBeside(o, r, 10, 90);
    expect(wants(sim, r, 'karcher')).toBe(true);
  });

  it('fires the raclette at a boat ahead in line, drops the toilet when chased', () => {
    const sim = lone([0, 1]);
    const [r, o] = sim.racers;
    place(o, r.x + 20000, r.y);
    expect(wants(sim, r, 'raclette')).toBe(false);
    placeBeside(o, r, 500, 0);
    expect(wants(sim, r, 'raclette')).toBe(true);
    placeBeside(o, r, -200, 0);
    r.progress = o.progress + 200;
    expect(wants(sim, r, 'toilet')).toBe(true);
  });

  it('keeps the electrical failure for when it is behind someone', () => {
    const sim = lone([0, 1]);
    const [r, o] = sim.racers;
    r.progress = 1000;
    o.progress = 300;
    r.position = 0;
    expect(wants(sim, r, 'blackout')).toBe(false); // leading and nobody close: not yet
    r.position = 1;
    o.progress = 1800;
    expect(wants(sim, r, 'blackout')).toBe(true);
  });

  it('steers badly when covered in cheese, and runs a whole race with every item in play', { timeout: 120000 }, () => {
    const sim = new RaceSimulation({ track: loadTrack('industrialEstuary'), playerBoat: null, difficulty: 'ocean', seed: 8 });
    const used = new Set<string>();
    for (let i = 0; i < 500 / STEP && sim.phase !== 'over'; i++) {
      sim.step(STEP);
      for (const e of sim.takeEvents()) if (e.type === 'itemUsed') used.add(e.item);
      if (i % 600 === 599) for (const r of sim.racers) sim.items.give(r, (['karcher', 'raclette', 'toilet', 'blackout', 'mushroom', 'beer'] as const)[(i / 600) % 6 | 0]);
    }
    expect(sim.racers.every((r) => r.finished)).toBe(true);
    expect(used.size).toBeGreaterThanOrEqual(6);
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
