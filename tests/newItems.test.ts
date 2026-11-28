import { describe, expect, it } from 'vitest';
import { GLOBAL_ITEMS, ITEM_ODDS, ITEM_POWER, TRIPLE_ODDS, TUNING, type ItemId } from '../src/data/items';
import { BOATS, deriveStats } from '../src/data/boats';
import { loadTrack } from '../src/data/tracks';
import { hasEffect } from '../src/effects/effects';
import { speedOf, stepBoat } from '../src/physics/BoatPhysics';
import { RaceSimulation, STEP } from '../src/race/RaceSimulation';
import type { Racer } from '../src/race/types';
import { applyState, encodeState } from '../src/net/snapshot';

/** Four AI boats past the countdown, nothing in hand, no crates or barges in the way. */
function lone(seed = 1): RaceSimulation {
  const sim = new RaceSimulation({ track: loadTrack('lockAndLoad'), playerBoat: null, difficulty: 'river', seed });
  for (let i = 0; i < 4 * 60; i++) sim.step(STEP);
  for (const r of sim.racers) r.slots = [null, null];
  for (const c of sim.items.crates) c.respawn = 1e9;
  sim.traffic.barges.length = 0;
  sim.trafficPoses = [];
  return sim;
}
/** Put a boat on the track, `along` px along the centre line, `lat` px to the side, heading along it. */
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
/** Keep the AI from firing anything of its own. */
const disarm = (sim: RaceSimulation, keep: Racer | null = null): void => {
  for (const r of sim.racers) if (r !== keep) r.slots = [null, null];
};

describe('jigsaw: a saw out of each side and one on the bow', () => {
  it('cuts boats alongside, on either side, and straight ahead; not behind', () => {
    for (const where of ['sides', 'ahead/behind'] as const) {
      const sim = lone();
      const [me, b, c, d] = sim.racers;
      const a = sim.track.alongOf(me.progress) + 400;
      put(sim, me, a);
      const gap = (o: Racer): number => me.boat.size.length / 2 + o.boat.size.length / 2 + 15;
      if (where === 'sides') {
        put(sim, b, a, -(me.stats.capRadius + b.stats.capRadius + 25));
        put(sim, c, a, me.stats.capRadius + c.stats.capRadius + 25);
        put(sim, d, a - 2000);
      } else {
        put(sim, b, a + gap(b));
        put(sim, c, a - gap(c) - 10);
        put(sim, d, a - 2000, 60);
      }
      sim.items.give(me, 'jigsaw');
      sim.items.use(me, 0, 'forward');
      const hull = sim.racers.map((r) => r.hull);
      sim.step(STEP);
      if (where === 'sides') {
        expect(b.hull).toBeLessThan(hull[1]);
        expect(c.hull).toBeLessThan(hull[2]);
      } else {
        expect(b.hull).toBeLessThan(hull[1]); // ahead
        expect(c.hull).toBe(hull[2]); // behind
      }
    }
  });
});

describe('giant dildo', () => {
  it('sits on the bow and hurts the boat it rams, a little (less than the jigsaw)', () => {
    const sim = lone();
    const [me, victim] = sim.racers;
    const a = sim.track.alongOf(me.progress) + 200;
    put(sim, me, a);
    put(sim, victim, a + me.boat.size.length / 2 + victim.stats.radius + 20);
    sim.items.give(me, 'dildo');
    sim.items.use(me, 0, 'forward');
    expect(hasEffect(me, 'dildo')).toBe(true);
    const before = victim.hull;
    sim.step(STEP);
    expect(before - victim.hull).toBe(TUNING.dildo.damage);
    expect(TUNING.dildo.damage).toBeLessThan(TUNING.jigsaw.damage);
    expect(ITEM_POWER.dildo).toBeLessThan(ITEM_POWER.jigsaw);
  });
});

describe('nail gun', () => {
  it('fires three nails one after the other, and all three hurt the boat ahead', () => {
    const sim = lone();
    const [me, victim, c, d] = sim.racers;
    const a = sim.track.alongOf(me.progress) + 200;
    put(sim, me, a);
    put(sim, c, a - 900, 60);
    put(sim, d, a - 900, -60);
    sim.items.give(me, 'nailGun');
    sim.items.use(me, 0, 'forward');
    expect(sim.items.shots.filter((s) => s.kind === 2).length).toBe(3);
    expect(sim.items.shots.filter((s) => s.kind === 2 && s.wait > 0).length).toBe(2);
    const before = victim.hull;
    run(sim, 1.2, () => {
      put(sim, me, a);
      put(sim, victim, a + 320);
      disarm(sim);
    });
    expect(before - victim.hull).toBeCloseTo(3 * TUNING.nail.damage, 5);
    expect(hasEffect(victim, 'spinOut')).toBe(false); // nails jolt, they don't spin
  });
});

describe('Dicke Titten', () => {
  it('drops a pair in front of every opponent, none for the user', () => {
    const sim = lone();
    const [me, ...others] = sim.racers;
    const a = sim.track.alongOf(me.progress) + 200;
    put(sim, me, a);
    others.forEach((o, i) => put(sim, o, a + 500 + i * 150, (i - 1) * 50, 200));
    sim.items.give(me, 'titten');
    sim.items.use(me, 0, 'forward');
    expect(sim.items.boobs.length).toBe(3);
    for (const b of sim.items.boobs) {
      const o = sim.racers[b.target];
      expect(b.target).not.toBe(me.id);
      // ahead of it, on its line
      const n = sim.track.nearest(b.x, b.y, o.nearestIndex);
      expect(n.along - sim.track.alongOf(o.progress)).toBeGreaterThan(TUNING.titten.ahead * 0.8);
    }
  });

  it('is solid and hurts a boat that drives into it (once), and does nothing to its owner', () => {
    const sim = lone();
    const [me, victim, c, d] = sim.racers;
    const a = sim.track.alongOf(me.progress) + 200;
    put(sim, victim, a, 0, 0);
    put(sim, me, a - 1500);
    put(sim, c, a - 1500, 60);
    put(sim, d, a - 1500, -60);
    sim.items.give(me, 'titten');
    sim.items.use(me, 0, 'forward');
    disarm(sim);
    const pair = sim.items.boobs.find((b) => b.target === victim.id)!;
    run(sim, TUNING.titten.warn + 0.05);
    const before = victim.hull;
    // drive straight into it
    put(sim, victim, sim.track.nearest(pair.x, pair.y, -1).along - 120, 0, 380);
    run(sim, 1, () => disarm(sim));
    expect(before - victim.hull).toBe(TUNING.titten.damage);
    expect(sim.track.nearest(victim.x, victim.y, -1).along).toBeLessThan(sim.track.nearest(pair.x, pair.y, -1).along); // it didn't get through
    // the owner passes straight through
    const ownerHull = me.hull;
    put(sim, me, sim.track.nearest(pair.x, pair.y, -1).along - 100, 0, 380);
    run(sim, 0.6, () => disarm(sim));
    expect(me.hull).toBe(ownerHull);
  });

  it('is copied to online clients in snapshots, with nails waiting to be fired', () => {
    const sim = lone();
    const [me] = sim.racers;
    sim.items.give(me, 'titten');
    sim.items.use(me, 0, 'forward');
    sim.items.give(me, 'nailGun');
    sim.items.use(me, 0, 'forward');
    const copy = lone(2);
    applyState(copy, JSON.parse(JSON.stringify(encodeState(sim))));
    expect(copy.items.boobs.map((b) => b.target)).toEqual(sim.items.boobs.map((b) => b.target));
    expect(copy.items.shots.map((s) => [s.kind, s.wait > 0])).toEqual(sim.items.shots.map((s) => [s.kind, s.wait > 0]));
  });
});

describe('gas siphoning', () => {
  it('stops every opponent for 3 seconds, not the user', () => {
    const sim = lone();
    const [me, ...others] = sim.racers;
    run(sim, 3, () => disarm(sim)); // everyone up to speed
    sim.items.give(me, 'siphon');
    sim.items.use(me, 0, 'forward');
    for (const o of others) expect(hasEffect(o, 'siphoned')).toBe(true);
    expect(hasEffect(me, 'siphoned')).toBe(false);
    run(sim, 1.5, () => disarm(sim));
    for (const o of others) expect(speedOf(o)).toBeLessThan(40);
    expect(speedOf(me)).toBeGreaterThan(200);
    run(sim, 2, () => disarm(sim));
    for (const o of others) expect(hasEffect(o, 'siphoned')).toBe(false);
  });
});

describe('tugboat', () => {
  it('tows its owner along the canal faster than it can go alone, and the owner can still fire', () => {
    const sim = lone();
    const [me, other] = sim.racers;
    run(sim, 2, () => disarm(sim));
    // Same boat, side by side: one towed, one not.
    other.boat = me.boat;
    other.stats = other.baseStats = me.stats;
    const a = sim.track.alongOf(me.progress) + 100;
    put(sim, me, a, -40, 300);
    put(sim, other, a, 40, 300);
    sim.items.give(me, 'tugboat');
    sim.items.use(me, 0, 'forward');
    sim.items.give(me, 'whitePowder');
    const p0 = me.progress, q0 = other.progress;
    run(sim, TUNING.tugboat.duration * 0.9, () => {
      other.slots = [null, null];
      for (const r of sim.racers) if (r !== me) r.slots = [null, null];
    });
    expect(hasEffect(me, 'towed')).toBe(true);
    expect(me.progress - p0).toBeGreaterThan((other.progress - q0) * 1.15);
    // it kept to the water
    const n = sim.track.nearest(me.x, me.y, me.nearestIndex);
    expect(Math.abs(n.lateral)).toBeLessThan(sim.track.halfWidth(n.index));
  });
});

describe('mushroom', () => {
  it('makes the boats ahead much slower as well as smaller', () => {
    expect(TUNING.mushroom.shrunkSpeed).toBeLessThanOrEqual(0.7);
    expect(TUNING.mushroom.shrink).toBeLessThan(1);
  });
});

describe('triple items (the better version)', () => {
  it('comes with three uses and keeps its slot until they are used', () => {
    const sim = lone();
    const r = sim.racers[0];
    sim.items.give(r, 'drill', true);
    expect(r.slots[0]).toEqual({ id: 'drill', uses: 3, triple: true });
    sim.items.use(r, 0, 'forward');
    sim.items.use(r, 0, 'forward');
    expect(r.slots[0]?.uses).toBe(1);
    expect(sim.items.drills.length).toBe(2);
  });

  it('never goes to the leader, is likelier further back, and the strongest items come as triples only last', () => {
    expect(TRIPLE_ODDS.normal[0]).toBe(0);
    for (let k = 1; k < 4; k++) expect(TRIPLE_ODDS.normal[k]).toBeGreaterThan(TRIPLE_ODDS.normal[k - 1]);
    expect(TRIPLE_ODDS.global.slice(0, 3)).toEqual([0, 0, 0]);
    for (const id of GLOBAL_ITEMS) expect(ITEM_ODDS[id][0]).toBe(0);
  });

  it('rolls out of crates for the boats behind', () => {
    let triples = 0, leaderTriples = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const sim = lone(seed);
      const back = sim.racers.find((r) => r.position === 3)!;
      const lead = sim.racers.find((r) => r.position === 0)!;
      for (const [r, add] of [[back, 1], [lead, 0]] as const) {
        const crate = sim.items.crates[0];
        crate.respawn = 0;
        r.x = crate.x;
        r.y = crate.y;
        (sim.items as unknown as { openCrate(r: Racer): void }).openCrate(r);
        if (r.rouletteTriple) {
          if (add) triples++;
          else leaderTriples++;
        }
        r.rouletteItem = null;
      }
    }
    expect(leaderTriples).toBe(0);
    expect(triples).toBeGreaterThan(40);
  });
});

describe('the boats behind get better items', () => {
  it('the average power of what each position draws goes up from first to last, with the new items in', () => {
    const items = Object.keys(ITEM_ODDS) as ItemId[];
    const avg = [0, 1, 2, 3].map((pos) => {
      const total = items.reduce((s, id) => s + ITEM_ODDS[id][pos], 0);
      return items.reduce((s, id) => s + ITEM_ODDS[id][pos] * ITEM_POWER[id], 0) / total;
    });
    for (let k = 1; k < 4; k++) expect(avg[k]).toBeGreaterThan(avg[k - 1] + 0.3);
    // the catch-up items never go to the leader
    for (const id of ['titten', 'siphon', 'tugboat'] as const) expect(ITEM_ODDS[id][0]).toBe(0);
  });
});

describe('balance: boats', () => {
  it('top speeds are close together, so a fast boat cannot win on speed alone', () => {
    const speeds = BOATS.map((b) => deriveStats(b).topSpeed);
    expect(Math.max(...speeds) / Math.min(...speeds)).toBeLessThan(1.1);
  });

  it('a damaged boat is slower, in proportion to its damage', () => {
    const sim = lone();
    const top = (hullFrac: number): number => {
      const r = { ...sim.racers[0], effects: [], vx: 0, vy: 0, heading: 0, hull: sim.racers[0].stats.maxHull * hullFrac };
      for (let i = 0; i < 20 / STEP; i++) stepBoat(r, { desiredHeading: 0, throttle: 1, fire: null }, STEP, true);
      return speedOf(r);
    };
    const healthy = top(1), quarter = top(0.25), wrecked = top(0.001);
    expect(quarter / healthy).toBeCloseTo(1 - TUNING.damageSlow * 0.75, 2);
    expect(wrecked / healthy).toBeCloseTo(1 - TUNING.damageSlow, 2);
  });

  it('a boat far behind gets a catch-up boost, the leader none', () => {
    const sim = lone();
    const [a, b, c, d] = sim.racers;
    const along = sim.track.alongOf(a.progress) + 100;
    put(sim, a, along + 2500);
    put(sim, b, along + 2400, 50);
    put(sim, c, along + 1000);
    put(sim, d, along);
    sim.step(STEP);
    expect(a.catchUp).toBe(1);
    expect(b.catchUp).toBe(1);
    expect(c.catchUp).toBeGreaterThan(1);
    expect(d.catchUp).toBeCloseTo(1 + TUNING.catchUp.max, 5);
  });
});

describe('clogged toilet: a trail of smoke', () => {
  it('leaves clouds behind for a few seconds, and a boat in several is hurt once per step', () => {
    const sim = lone();
    const [me, victim] = sim.racers;
    const a = sim.track.alongOf(me.progress) + 200;
    put(sim, me, a, 0, 300);
    sim.items.give(me, 'toilet');
    sim.items.use(me, 0, 'forward');
    run(sim, TUNING.toilet.trailTime + 0.5, () => disarm(sim));
    const clouds = sim.items.clouds.filter((c) => c.kind === 1);
    expect(clouds.length).toBeGreaterThan(8);
    // spread out along the way it went
    const xs = clouds.map((c) => c.x), ys = clouds.map((c) => c.y);
    expect(Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))).toBeGreaterThan(500);
    // in the middle of two overlapping clouds: hurt once
    const [c1, c2] = clouds;
    victim.x = (c1.x + c2.x) / 2;
    victim.y = (c1.y + c2.y) / 2;
    victim.vx = victim.vy = 0;
    const hull = victim.hull;
    sim.step(STEP);
    expect(hull - victim.hull).toBeCloseTo(TUNING.toilet.dps * STEP, 5);
  });
});

describe('drill: the bit on the bow, then fired', () => {
  it('sits on the bow for 3 s hurting what it rams, then flies straight ahead', () => {
    const sim = lone();
    const [me, rammed, target, d] = sim.racers;
    const a = sim.track.alongOf(me.progress) + 300;
    put(sim, me, a);
    put(sim, d, a - 2000, 60);
    sim.items.give(me, 'drill');
    sim.items.use(me, 0, 'forward');
    const drill = sim.items.drills[0];
    expect(drill.mounted).toBeGreaterThan(0);
    // a boat right on the bit
    put(sim, rammed, a + me.boat.size.length / 2 + TUNING.drill.length * 0.8, 0);
    put(sim, target, a - 1800, -60);
    const hull = rammed.hull;
    run(sim, 0.3, () => {
      disarm(sim);
      put(sim, me, a);
    });
    expect(hull - rammed.hull).toBe(TUNING.drill.mountDamage);
    expect(drill.travelled).toBe(0); // still on the bow
    // after its time it leaves, straight ahead
    put(sim, rammed, a - 1500, 60);
    run(sim, TUNING.drill.mountTime, () => {
      disarm(sim);
      put(sim, me, a);
    });
    expect(drill.mounted).toBe(0);
    expect(drill.travelled).toBeGreaterThan(50);
    // and hurts the first boat it meets
    const along = sim.track.nearest(drill.x, drill.y, -1).along;
    put(sim, target, along + 200, sim.track.nearest(drill.x, drill.y, -1).lateral);
    const th = target.hull;
    run(sim, 0.6, () => disarm(sim));
    expect(th - target.hull).toBe(TUNING.drill.damage);
  });
});

describe('Dicke Titten leave a way through', () => {
  it('never two pairs side by side, always a clear gap, and turned along a narrow canal', () => {
    for (const trackId of ['lockAndLoad', 'bayouBends', 'industrialEstuary', 'reimsCanal']) {
      for (let seed = 1; seed <= 6; seed++) {
        const sim = new RaceSimulation({ track: loadTrack(trackId), playerBoat: null, difficulty: 'river', seed });
        sim.hazards.enabled = false;
        for (let i = 0; i < 4 * 60; i++) sim.step(STEP);
        const [me, ...others] = sim.racers;
        const a = sim.track.alongOf(me.progress) + 800 + seed * 700;
        put(sim, me, a - 600);
        // the three others bunched up, abreast
        others.forEach((o, i) => put(sim, o, a + i * 20, (i - 1) * 55, 300));
        sim.items.give(me, 'titten');
        sim.items.use(me, 0, 'forward');
        const T = TUNING.titten, track = sim.track;
        const pairs = sim.items.boobs.map((b) => {
          const n = track.nearest(b.x, b.y, -1);
          return { along: n.along, lat: n.lateral, hw: track.halfWidth(n.index), half: b.turned ? T.radius : 2 * T.radius, b };
        });
        for (const p of pairs) {
          // room to pass on one side at least
          expect(Math.max(p.lat - p.half + p.hw, p.hw - p.lat - p.half), `${trackId} ${seed}`).toBeGreaterThan(T.clear - 8);
          for (const q of pairs) if (q !== p) expect(Math.abs(q.along - p.along), `${trackId} ${seed}`).toBeGreaterThan(T.row - 30);
          if (2 * p.hw - 4 * T.radius < T.clear + 12) expect(p.b.turned).toBe(true);
        }
      }
    }
  });
});

describe('Kärcher: only the fan alongside', () => {
  it('pushes a boat alongside the middle, not one level with the stern or behind', () => {
    const push = (along: number): number => {
      const sim = lone();
      const [me, o, c, d] = sim.racers;
      const a = sim.track.alongOf(me.progress) + 300;
      put(sim, me, a, -50);
      put(sim, o, a + along, 30);
      put(sim, c, a - 2000, 60);
      put(sim, d, a - 2000, -60);
      sim.setController(o.id, { update: () => ({ desiredHeading: null, throttle: 0, fire: null }) }); // sits there
      sim.items.give(me, 'karcher');
      sim.items.use(me, 0, 'forward');
      const lat0 = sim.track.nearest(o.x, o.y, o.nearestIndex).lateral;
      run(sim, 0.4, () => {
        disarm(sim);
        put(sim, me, a, -50);
      });
      return sim.track.nearest(o.x, o.y, o.nearestIndex).lateral - lat0;
    };
    const L = BOATS[0].size.length; // Cabourg
    expect(push(0)).toBeGreaterThan(15);
    expect(push(-L * 0.5 - 60)).toBeLessThan(3);
    expect(push(-L - 120)).toBeLessThan(3);
  });
});

describe('more crates, and people pushing crates in', () => {
  it('every crate row has 8 crates, none overlapping, all on the water', () => {
    for (const id of ['lockAndLoad', 'industrialEstuary', 'bayouBends', 'reimsCanal']) {
      const sim = new RaceSimulation({ track: loadTrack(id), playerBoat: null, difficulty: 'river', seed: 1 });
      const crates = sim.items.crates;
      expect(crates.length % 8, id).toBe(0);
      expect(crates.length, id).toBeGreaterThanOrEqual(8 * sim.track.def.crateRows.length);
      for (const a of crates) {
        const n = sim.track.nearest(a.x, a.y, -1);
        expect(Math.abs(n.lateral), id).toBeLessThan(sim.track.halfWidth(n.index) - 10);
        for (const b of crates) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y), id).toBeGreaterThan(2 * TUNING.crateRadius - 6);
      }
    }
  });

  it('someone on the towpath pushes a crate in ahead of the boats behind, never for the leader', () => {
    const sim = lone();
    sim.hazards.enabled = false;
    let forLeader = 0, forOthers = 0;
    run(sim, 60, () => {
      for (const r of sim.racers) r.slots = [null, null];
      // the others well behind the leader (pushes never land near the leader)
      const lead = sim.racers.find((r) => r.position === 0)!;
      for (const r of sim.racers) if (r !== lead && lead.progress - r.progress < 900) put(sim, r, sim.track.alongOf(lead.progress) - 1600, 0, 300);
      for (const e of sim.takeEvents()) {
        if (e.type !== 'drop') continue;
        const d = sim.items.drops.find((x) => x.id === e.id);
        if (d?.kind !== 1) continue;
        if (sim.racers[e.racer].position === 0) forLeader++;
        else forOthers++;
      }
    });
    expect(forLeader).toBe(0);
    expect(forOthers).toBeGreaterThan(5);
  });
});

describe('eight boats', () => {
  it('the places of a bigger race are spread over the four columns of the item tables', async () => {
    const { oddsColumn } = await import('../src/items/itemOdds');
    expect([0, 1, 2, 3].map((p) => oddsColumn(p, 4))).toEqual([0, 1, 2, 3]);
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((p) => oddsColumn(p, 8))).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    expect([0, 1].map((p) => oddsColumn(p, 2))).toEqual([0, 1]);
  });

  it('eight boats start on separate places of the grid, on the water, and finish the race', { timeout: 60000 }, () => {
    for (const id of ['lockAndLoad', 'bayouBends', 'reimsCanal']) {
      const sim = new RaceSimulation({ track: loadTrack(id, { start: 0, finish: 30000 }), difficulty: 'river', seed: 2, roster: BOATS.map((b, i) => ({ name: `p${i}`, boatId: b.id, human: false })) });
      expect(sim.racers).toHaveLength(8);
      for (const a of sim.racers) {
        const n = sim.track.nearest(a.x, a.y, -1);
        expect(Math.abs(n.lateral), id).toBeLessThan(sim.track.halfWidth(n.index));
        for (const b of sim.racers) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y), id).toBeGreaterThan(60);
      }
      if (id === 'lockAndLoad') {
        for (let t = 0; t < 400 && sim.phase !== 'over'; t += STEP) sim.step(STEP);
        expect(sim.phase).toBe('over');
        expect(sim.racers.filter((r) => r.finished).length).toBeGreaterThanOrEqual(7);
      }
    }
  });
});
