import { describe, expect, it } from 'vitest';
import { TUNING } from '../src/data/items';
import { loadTrack } from '../src/data/tracks';
import { hasEffect } from '../src/effects/effects';
import { speedOf } from '../src/physics/BoatPhysics';
import { RaceSimulation, STEP } from '../src/race/RaceSimulation';
import type { Racer } from '../src/race/types';
import { applyState, encodeState } from '../src/net/snapshot';

/** Four AI boats past the countdown, nothing in hand, no crates or barges, hazards off unless asked. */
function lone(seed = 1, hazards = false): RaceSimulation {
  const sim = new RaceSimulation({ track: loadTrack('lockAndLoad'), playerBoat: null, difficulty: 'river', seed });
  sim.hazards.enabled = hazards;
  for (let i = 0; i < 4 * 60; i++) sim.step(STEP);
  for (const r of sim.racers) r.slots = [null, null];
  for (const c of sim.items.crates) c.respawn = 1e9;
  sim.traffic.barges.length = 0;
  sim.trafficPoses = [];
  return sim;
}
function put(sim: RaceSimulation, r: Racer, along: number, lat = 0, speed = 0): void {
  const p = sim.track.pointAt(along, lat);
  r.x = p.x;
  r.y = p.y;
  r.heading = p.heading;
  r.vx = Math.cos(p.heading) * speed;
  r.vy = Math.sin(p.heading) * speed;
  const n = sim.track.nearest(r.x, r.y, -1);
  r.nearestIndex = n.index;
  r.progress = sim.track.advance(r.progress, n.along);
}
const run = (sim: RaceSimulation, seconds: number, each?: () => void): void => {
  for (let i = 0; i < seconds / STEP; i++) {
    each?.();
    sim.step(STEP);
  }
};
const disarm = (sim: RaceSimulation): void => {
  for (const r of sim.racers) r.slots = [null, null];
};
const events = (sim: RaceSimulation, seconds: number, each?: () => void): string[] => {
  const out: string[] = [];
  run(sim, seconds, () => {
    each?.();
    for (const e of sim.takeEvents()) out.push(e.type === 'cops' ? `cops:${e.phase}` : e.type);
  });
  return out;
};

describe('beer dispenser', () => {
  it('repairs the hull in full and its foam takes the next hit (not a bump on the bank); the one after lands', () => {
    const sim = lone();
    const r = sim.racers[0];
    r.hull = 10;
    sim.items.give(r, 'beerDispenser');
    sim.items.use(r, 0, 'forward');
    expect(r.hull).toBe(r.stats.maxHull);
    expect(hasEffect(r, 'shielded')).toBe(true);
    expect(sim.hit(r, 30, null, 'bank', false)).toBe(true); // the bank doesn't burst it
    expect(hasEffect(r, 'shielded')).toBe(true);
    r.effects = r.effects.filter((e) => e.kind !== 'invulnerable');
    const before = r.hull;
    expect(sim.hit(r, 40, 1, 'drill')).toBe(false);
    expect(r.hull).toBe(before);
    expect(hasEffect(r, 'shielded')).toBe(false);
    r.effects = r.effects.filter((e) => e.kind !== 'invulnerable');
    expect(sim.hit(r, 40, 1, 'drill')).toBe(true);
    expect(r.hull).toBe(before - 40);
  });
});

describe('vacuum cleaner', () => {
  it('pulls the boats ahead back towards the user, from far away; boats behind are left alone', () => {
    // The same scene twice, with and without the vacuum: how far do the others get in 2 s?
    const scene = (vacuum: boolean): { ahead: number; behind: number } => {
      const sim = lone();
      const [me, ahead, behind, d] = sim.racers;
      const a = sim.track.alongOf(me.progress) + 200;
      put(sim, me, a);
      put(sim, ahead, a + 700, 0, 300);
      put(sim, behind, a - 1500, 0, 300);
      put(sim, d, a + 3000);
      if (vacuum) {
        sim.items.give(me, 'vacuum');
        sim.items.use(me, 0, 'forward');
      }
      const p0 = ahead.progress, q0 = behind.progress;
      run(sim, 2, () => {
        disarm(sim);
        put(sim, me, a); // the user holds still
      });
      return { ahead: ahead.progress - p0, behind: behind.progress - q0 };
    };
    const off = scene(false), on = scene(true);
    expect(on.ahead).toBeLessThan(off.ahead * 0.6);
    expect(Math.abs(on.behind - off.behind)).toBeLessThan(15);
  });
});

describe('police', () => {
  /** The leader far ahead of the others, all driving. */
  const runaway = (seed = 1): { sim: RaceSimulation; lead: Racer } => {
    const sim = lone(seed, true);
    sim.hazards.critters = [];
    (sim.hazards as unknown as { anglerAt: number }).anglerAt = 1e9; // no anglers in the way
    run(sim, TUNING.cops.startAfter, () => disarm(sim));
    const lead = sim.racers.find((r) => r.position === 0)!;
    return { sim, lead };
  };
  const keepAhead = (sim: RaceSimulation, lead: Racer): void => {
    disarm(sim);
    sim.hazards.critters = [];
    for (const r of sim.racers) if (r !== lead && lead.progress - r.progress < TUNING.cops.gap + 200) put(sim, r, sim.track.alongOf(lead.progress) - TUNING.cops.gap - 400, 0, 0);
  };

  it('warns a leader far ahead for speeding, then chases and shoots at it', () => {
    const { sim, lead } = runaway();
    const ev = events(sim, TUNING.cops.after + TUNING.cops.warn + 3, () => keepAhead(sim, lead));
    expect(ev).toContain('cops:warn');
    expect(ev).toContain('cops:chase');
    expect(ev.indexOf('cops:warn')).toBeLessThan(ev.indexOf('cops:chase'));
    expect(sim.hazards.police?.target).toBe(lead.id);
  });

  it('a bullet that hits pulls the leader over: stopped, with the police boat alongside, then the police leave', () => {
    const { sim, lead } = runaway();
    run(sim, TUNING.cops.after + TUNING.cops.warn + 0.5, () => keepAhead(sim, lead));
    const p = sim.hazards.police!;
    expect(p.phase).toBe('chase');
    // A bullet right on the leader.
    sim.hazards.bullets.push({ id: 999, x: lead.x - Math.cos(lead.heading) * 60, y: lead.y - Math.sin(lead.heading) * 60, heading: lead.heading, travelled: 0, target: lead.id, near: lead.nearestIndex, dead: false });
    run(sim, 0.2, () => keepAhead(sim, lead));
    expect(p.phase).toBe('ticket');
    expect(hasEffect(lead, 'ticketed')).toBe(true);
    run(sim, 1.5, () => keepAhead(sim, lead));
    expect(speedOf(lead)).toBeLessThan(30);
    expect(Math.hypot(p.x - lead.x, p.y - lead.y)).toBeLessThan(lead.stats.capRadius + TUNING.cops.width + 20);
    run(sim, TUNING.cops.ticket + 2, () => keepAhead(sim, lead));
    expect(sim.hazards.police).toBeNull();
  });

  it('a rocket that hits another boat hurts it but pulls nobody over; a head of foam takes a rocket whole', () => {
    const { sim, lead } = runaway();
    run(sim, TUNING.cops.after + TUNING.cops.warn + 0.5, () => keepAhead(sim, lead));
    const other = sim.racers.find((r) => r !== lead)!;
    const otherHull = other.hull;
    sim.hazards.bullets.push({ id: 998, x: other.x, y: other.y, heading: 0, travelled: 0, target: lead.id, near: lead.nearestIndex, dead: false });
    sim.items.give(lead, 'beerDispenser');
    sim.items.use(lead, 0, 'forward');
    sim.hazards.bullets.push({ id: 999, x: lead.x, y: lead.y, heading: lead.heading, travelled: 0, target: lead.id, near: lead.nearestIndex, dead: false });
    run(sim, 0.1, () => keepAhead(sim, lead));
    expect(hasEffect(other, 'ticketed')).toBe(false);
    expect(other.hull).toBe(otherHull - TUNING.cops.rocketDamage);
    expect(hasEffect(lead, 'ticketed')).toBe(false);
    expect(hasEffect(lead, 'shielded')).toBe(false);
    expect(sim.hazards.police?.phase).toBe('chase');
  });

  it('rockets explode on the bank; a chase with no hit ends without a ticket', () => {
    const { sim, lead } = runaway();
    run(sim, TUNING.cops.after + TUNING.cops.warn + 0.2, () => keepAhead(sim, lead));
    // a rocket fired straight across the canal, away from every boat
    const n = sim.track.nearest(lead.x, lead.y, lead.nearestIndex);
    const s0 = sim.track.samples[n.index];
    sim.hazards.bullets = [{ id: 900, x: s0.x + s0.tx * 400, y: s0.y + s0.ty * 400, heading: Math.atan2(s0.tx, -s0.ty), travelled: 0, target: lead.id, near: n.index, dead: false }];
    const ev = events(sim, 1, () => {
      keepAhead(sim, lead);
      sim.hazards.bullets = sim.hazards.bullets.filter((b) => b.id === 900); // only that one
      if (sim.hazards.police) sim.hazards.police.fireT = 9;
    });
    expect(ev).toContain('boom');
    expect(sim.hazards.bullets).toHaveLength(0);
    // nothing hits it for the rest of the chase: no ticket
    let ticketed = false;
    run(sim, TUNING.cops.chase + 2, () => {
      keepAhead(sim, lead);
      sim.hazards.bullets = [];
      ticketed ||= hasEffect(lead, 'ticketed');
    });
    expect(ticketed).toBe(false);
    expect(sim.hazards.police).toBeNull();
  });
});

describe('anglers', () => {
  it('catch the leader on their line, drag it into the bank: a crash; other boats pass through the line', () => {
    const sim = lone(1, true);
    sim.hazards.critters = [];
    const [lead, other] = sim.racers;
    const a = sim.track.alongOf(lead.progress) + 300;
    sim.hazards.anglers = [{ id: 1, target: lead.id, side: 1, along: a + 200, age: 1, hooked: false, dead: false }];
    (sim.hazards as unknown as { anglerAt: number }).anglerAt = 1e9;
    // the other boat goes through the line first
    put(sim, other, a + 120, sim.track.halfWidth(lead.nearestIndex) * 0.6, 300);
    run(sim, 0.4, () => disarm(sim));
    expect(hasEffect(other, 'hooked')).toBe(false);
    put(sim, other, a - 1500, 0, 0);
    // then the boat it was cast for
    const hull = lead.hull;
    put(sim, lead, a + 120, sim.track.halfWidth(lead.nearestIndex) * 0.6, 300);
    let hooked = false;
    run(sim, 2, () => {
      disarm(sim);
      hooked ||= hasEffect(lead, 'hooked');
    });
    expect(hooked).toBe(true);
    expect(lead.hull).toBe(hull - TUNING.anglers.damage);
  });
});

describe('birds, rowers and swimmers', () => {
  it('running into them makes a mess and slows the boat, without damage', () => {
    const sim = lone(1, true);
    const r = sim.racers[0];
    const a = sim.track.alongOf(r.progress) + 200;
    put(sim, r, a, 0, 300);
    sim.hazards.critters = [{ id: 1, kind: 2, along: a + 80, lat: 0, dir: 1, age: 1, dead: false }];
    const hull = r.hull;
    const ev = events(sim, 0.5, () => disarm(sim));
    expect(ev).toContain('splat');
    expect(hasEffect(r, 'splattered')).toBe(true);
    expect(r.hull).toBe(hull);
    expect(sim.hazards.critters.some((c) => c.id === 1)).toBe(false);
  });

  it('turn up more often in front of the boats that are better placed', () => {
    const counts = [0, 0, 0, 0];
    for (let seed = 1; seed <= 12; seed++) {
      const sim = lone(seed, true);
      (sim.hazards as unknown as { anglerAt: number }).anglerAt = 1e9;
      let seen = new Set<number>();
      run(sim, 40, () => {
        disarm(sim);
        for (const c of sim.hazards.critters) {
          if (seen.has(c.id)) continue;
          seen.add(c.id);
          // who it was put in front of: the boat it is just ahead of
          const along = c.along;
          let best: Racer | null = null, bestD = Infinity;
          for (const r of sim.racers) {
            const d = along - sim.track.alongOf(r.progress);
            if (d > 0 && d < bestD) (best = r), (bestD = d);
          }
          if (best) counts[best.position]++;
        }
        if (seen.size > 200) seen = new Set();
      });
    }
    expect(counts[0]).toBeGreaterThan(counts[3]);
  });

  it('the hazards are copied to online clients in snapshots', () => {
    const sim = lone(1, true);
    const r = sim.racers[0];
    sim.hazards.critters = [{ id: 7, kind: 1, along: 500, lat: 20, dir: -1, age: 3, dead: false }];
    sim.hazards.anglers = [{ id: 8, target: r.id, side: -1, along: 900, age: 2, hooked: true, dead: false }];
    sim.hazards.police = { phase: 'ticket', target: r.id, t: 1, x: 10, y: 20, heading: 0.5, side: -1, fireT: 0.3 };
    sim.hazards.bullets = [{ id: 9, x: 1, y: 2, heading: 3, travelled: 4, target: r.id, near: 5, dead: false }];
    const copy = lone(2, true);
    applyState(copy, JSON.parse(JSON.stringify(encodeState(sim))));
    expect(copy.hazards.critters).toEqual(sim.hazards.critters);
    expect(copy.hazards.anglers).toEqual(sim.hazards.anglers);
    expect(copy.hazards.police).toEqual(sim.hazards.police);
    expect(copy.hazards.bullets).toEqual(sim.hazards.bullets);
  });
});

describe('beer makes you drunk', () => {
  it('a beer (and a beer dispenser) makes the boat weave for a few seconds, holding the same course', () => {
    const sim = lone();
    const r = sim.racers[0];
    sim.items.give(r, 'beer');
    sim.items.use(r, 0, 'forward');
    expect(hasEffect(r, 'drunk')).toBe(true);
    // the same steady controls for both: the drunk one turns from side to side
    const headings: number[] = [];
    const course = r.heading;
    sim.setController(r.id, { update: () => ({ desiredHeading: course, throttle: 1, fire: null }) });
    run(sim, 2.5, () => {
      for (const o of sim.racers) if (o !== r) o.slots = [null, null];
      headings.push(r.heading);
    });
    const spread = Math.max(...headings) - Math.min(...headings);
    expect(spread).toBeGreaterThan(0.25);
    run(sim, TUNING.beer.drunkTime);
    expect(hasEffect(r, 'drunk')).toBe(false);
    sim.items.give(r, 'beerDispenser');
    sim.items.use(r, 0, 'forward');
    expect(r.effects.find((e) => e.kind === 'drunk')?.remaining).toBe(TUNING.beerDispenser.drunkTime);
  });
});
