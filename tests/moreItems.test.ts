import { describe, expect, it } from 'vitest';
import { ITEM_ODDS, ITEM_POWER, TUNING, type ItemId } from '../src/data/items';
import { loadTrack } from '../src/data/tracks';
import { hasEffect } from '../src/effects/effects';
import { RaceSimulation, STEP } from '../src/race/RaceSimulation';
import type { RaceEvent, Racer } from '../src/race/types';
import { applyState, encodeState } from '../src/net/snapshot';

/** Four AI boats past the countdown, nothing in hand, no crates or barges, no hazards of their own. */
function lone(seed = 1): RaceSimulation {
  const sim = new RaceSimulation({ track: loadTrack('lockAndLoad'), playerBoat: null, difficulty: 'river', seed });
  sim.hazards.enabled = false;
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
const run = (sim: RaceSimulation, seconds: number, each?: () => void): RaceEvent[] => {
  const out: RaceEvent[] = [];
  for (let i = 0; i < seconds / STEP; i++) {
    each?.();
    sim.step(STEP);
    out.push(...sim.takeEvents());
  }
  return out;
};
const use = (sim: RaceSimulation, r: Racer, id: ItemId): void => {
  sim.items.give(r, id);
  sim.items.use(r, r.slots.findIndex((s) => s?.id === id), 'forward');
};

describe('sauna', () => {
  it('steam for every opponent (they cannot see), the clear spot round the owner, for a few seconds', () => {
    const sim = lone();
    const [me, ...rest] = sim.racers;
    use(sim, me, 'sauna');
    expect(hasEffect(me, 'sauna')).toBe(true);
    expect(hasEffect(me, 'steamed')).toBe(false);
    for (const o of rest) expect(hasEffect(o, 'steamed')).toBe(true);
    run(sim, TUNING.sauna.duration + 0.1);
    for (const o of sim.racers) expect(hasEffect(o, 'steamed') || hasEffect(o, 'sauna')).toBe(false);
  });
});

describe('noise complaint', () => {
  it('a police boat after every opponent; a rocket that hits stops it with a fine for noise; then they leave', () => {
    const sim = lone();
    const [me, ...rest] = sim.racers;
    use(sim, me, 'noise');
    expect(sim.hazards.noisePolice.map((p) => p.target).sort()).toEqual(rest.map((o) => o.id).sort());
    expect(sim.hazards.police).toBeNull(); // the speeding police are another matter
    const ev = run(sim, TUNING.noise.warn + 0.2);
    expect(sim.hazards.noisePolice.every((p) => p.phase === 'chase')).toBe(true);
    expect(ev.some((e) => e.type === 'cops' && e.phase === 'chase' && e.noise)).toBe(true);
    // A rocket on its target: stopped and fined, and only that police boat parks.
    const victim = rest[0];
    sim.hazards.bullets.push({ id: 999, x: victim.x, y: victim.y, heading: 0, travelled: 0, target: victim.id, near: victim.nearestIndex, dead: false });
    const after = run(sim, STEP * 2);
    expect(hasEffect(victim, 'ticketed')).toBe(true);
    expect(after.some((e) => e.type === 'cops' && e.racer === victim.id && e.phase === 'ticket' && e.noise)).toBe(true);
    expect(sim.hazards.noisePolice.find((p) => p.target === victim.id)!.phase).toBe('ticket');
    // A second complaint doesn't send a second boat after anyone.
    use(sim, me, 'noise');
    expect(sim.hazards.noisePolice).toHaveLength(rest.length);
    run(sim, TUNING.noise.chase + 3);
    expect(sim.hazards.noisePolice).toHaveLength(0);
  });

  it('copied to online clients', () => {
    const sim = lone();
    use(sim, sim.racers[0], 'noise');
    run(sim, 2);
    const copy = lone(2);
    applyState(copy, JSON.parse(JSON.stringify(encodeState(sim))));
    expect(encodeState(copy).npol).toEqual(encodeState(sim).npol);
    expect(copy.hazards.noisePolice.map((p) => p.noise)).toEqual(sim.hazards.noisePolice.map(() => true));
  });
});

describe('lazy volunteers', () => {
  it('couches behind the owner, staggered with a way through; running into one slows a boat (not the owner at first)', () => {
    const sim = lone();
    const [me, other] = sim.racers;
    put(sim, me, 3000, 0, 0);
    use(sim, me, 'lazyVolunteers');
    const couches = sim.hazards.critters.filter((c) => c.kind === 3);
    expect(couches).toHaveLength(TUNING.lazyVolunteers.couches);
    const mine = sim.track.alongOf(me.progress);
    for (const c of couches) {
      expect(c.owner).toBe(me.id);
      expect(c.along).toBeLessThan(mine); // behind
    }
    expect(new Set(couches.map((c) => Math.sign(Math.round(c.lat)))).size).toBe(3); // left, middle, right
    // The owner sits right in front of them, unharmed; another boat drives into one.
    const c = couches[0];
    put(sim, other, c.along - 60, c.lat, 250);
    const ev = run(sim, 0.6);
    expect(ev.some((e) => e.type === 'splat' && e.racer === other.id && e.kind === 3)).toBe(true);
    expect(hasEffect(other, 'splattered')).toBe(true);
    expect(sim.hazards.critters.filter((k) => k.kind === 3)).toHaveLength(couches.length - 1);
    // copied to online clients, owner and all
    const copy = lone(2);
    applyState(copy, JSON.parse(JSON.stringify(encodeState(sim))));
    expect(encodeState(copy).cri).toEqual(encodeState(sim).cri);
    expect(copy.hazards.critters.map((k) => k.owner)).toEqual(sim.hazards.critters.map((k) => k.owner));
  });
});

describe('painting workshop', () => {
  it('a trail of wet paint behind; whoever drives through gets paint on the screen, no damage', () => {
    const sim = lone();
    const [me, other] = sim.racers;
    put(sim, me, 3000, 0, 200);
    use(sim, me, 'paint');
    run(sim, TUNING.paint.trailTime + 0.3);
    const paint = sim.items.clouds.filter((c) => c.kind === 2);
    expect(paint.length).toBeGreaterThan(TUNING.paint.trailTime / TUNING.paint.every - 3);
    expect(hasEffect(me, 'painting')).toBe(false);
    const hull = other.hull;
    const at = sim.track.nearest(paint[3].x, paint[3].y, -1);
    put(sim, other, at.along, at.lateral, 0);
    const ev = run(sim, STEP * 2);
    expect(hasEffect(other, 'painted')).toBe(true);
    expect(ev.filter((e) => e.type === 'painted' && e.racer === other.id)).toHaveLength(1);
    expect(other.hull).toBe(hull);
  });
});

describe('fair odds for the new items', () => {
  it('the strong ones go to the back, the weak ones to the front', () => {
    for (const id of ['sauna', 'noise'] as ItemId[]) {
      expect(ITEM_ODDS[id][0]).toBe(0); // never for the leader
      expect(ITEM_ODDS[id][3]).toBeGreaterThan(ITEM_ODDS[id][1]);
      expect(ITEM_POWER[id]).toBeGreaterThanOrEqual(8);
    }
    for (const id of ['lazyVolunteers', 'paint'] as ItemId[]) {
      expect(ITEM_ODDS[id][0]).toBeGreaterThan(ITEM_ODDS[id][3]);
      expect(ITEM_POWER[id]).toBeLessThanOrEqual(5);
    }
  });
});

describe('useless items for the leader', () => {
  it('Lost in Translation: every opponent is "translated" for 20 s, nothing else', () => {
    const sim = lone();
    const [me, ...rest] = sim.racers;
    const before = rest.map((o) => [o.hull, Math.hypot(o.vx, o.vy)]);
    use(sim, me, 'translation');
    expect(hasEffect(me, 'translated')).toBe(false);
    rest.forEach((o, i) => {
      expect(o.effects.find((e) => e.kind === 'translated')?.remaining).toBe(TUNING.translation.duration);
      expect(o.hull).toBe(before[i][0]);
    });
  });

  it('Premature Celebration: a little drunker than a beer, and nothing repaired', () => {
    const sim = lone();
    const r = sim.racers[0];
    r.hull = 20;
    use(sim, r, 'champagne');
    expect(r.hull).toBe(20);
    expect(hasEffect(r, 'drunk') && hasEffect(r, 'bubbly')).toBe(true);
    expect(TUNING.champagne.drunkTime).toBeGreaterThan(TUNING.beer.drunkTime);
    expect(TUNING.champagne.sway).toBeGreaterThan(1);
  });

  it('only the leader gets them, and they are worth nothing', () => {
    for (const id of ['translation', 'champagne'] as ItemId[]) {
      expect(ITEM_ODDS[id][0]).toBeGreaterThan(0);
      expect(ITEM_ODDS[id].slice(1)).toEqual([0, 0, 0]);
      expect(ITEM_POWER[id]).toBe(0);
    }
  });
});

describe('paint is splashed once', () => {
  it('more paint while the screen is still covered changes nothing (the splash used to start again at every spot)', () => {
    const sim = lone();
    const [me, other] = sim.racers;
    put(sim, me, 3000, 0, 200);
    use(sim, me, 'paint');
    run(sim, TUNING.paint.trailTime + 0.3);
    const paint = sim.items.clouds.filter((c) => c.kind === 2);
    let events = 0;
    let remaining = Infinity;
    for (const c of paint.slice(2, 8)) {
      const at = sim.track.nearest(c.x, c.y, -1);
      put(sim, other, at.along, at.lateral, 0);
      events += run(sim, STEP * 3).filter((e) => e.type === 'painted' && e.racer === other.id).length;
      const now = other.effects.find((e) => e.kind === 'painted')!.remaining;
      expect(now).toBeLessThan(remaining);
      remaining = now;
    }
    expect(events).toBe(1);
  });
});

describe('Enlarge your péniche', () => {
  it('twice the size for a while, no heavier, then back to normal', () => {
    const sim = lone();
    const r = sim.racers[0];
    const { capRadius, halfLen, mass } = r.stats;
    use(sim, r, 'enlarge');
    run(sim, 1.5);
    expect(r.size).toBe(2);
    expect(r.stats.capRadius).toBeCloseTo(capRadius * 2, 5);
    expect(r.stats.halfLen).toBeCloseTo(halfLen * 2, 5);
    expect(r.stats.mass).toBe(mass);
    run(sim, TUNING.enlarge.duration);
    expect(r.size).toBe(1);
  });
});

describe('circular saw', () => {
  it('a blade runs round the hull and hurts whoever it touches, each boat again only after a moment', () => {
    const sim = lone();
    const [me, other] = sim.racers;
    put(sim, me, 3000, 0, 0);
    use(sim, me, 'circularSaw');
    const p = sim.items.sawPosition(me)!;
    expect(Math.hypot(p.x - me.x, p.y - me.y)).toBeGreaterThan(me.boat.size.length / 2);
    const hull = other.hull;
    let hits = 0;
    for (let i = 0; i < 1.5 / STEP; i++) {
      // the other boat keeps sitting where the blade is
      const q = sim.items.sawPosition(me)!;
      other.x = q.x;
      other.y = q.y;
      other.effects = other.effects.filter((e) => e.kind !== 'invulnerable');
      sim.step(STEP);
      hits += sim.takeEvents().filter((e) => e.type === 'hit' && e.racer === other.id && e.source === 'circularSaw').length;
    }
    expect(hits).toBe(2); // at 0 s and after 0.9 s
    expect(other.hull).toBeLessThan(hull);
    run(sim, TUNING.circularSaw.duration);
    expect(sim.items.sawPosition(me)).toBeNull();
  });
});

describe('motorized stairs', () => {
  it('the screen hidden, then stairs out of a bank in front of every opponent; solid, and they hurt once', () => {
    const sim = lone();
    const [me, other, ...rest] = sim.racers;
    use(sim, me, 'stairs');
    for (const o of [other, ...rest]) expect(hasEffect(o, 'stairsDown')).toBe(true);
    expect(sim.items.stairs.map((s) => s.target).sort()).toEqual([other, ...rest].map((o) => o.id).sort());
    expect(sim.items.stairs.every((s) => s.along < 0)).toBe(true); // not out yet
    run(sim, TUNING.stairs.warn + TUNING.stairs.unfold + 0.1);
    const s = sim.items.stairs.find((k) => k.target === other.id)!;
    expect(s.along).toBeGreaterThanOrEqual(0);
    const g = sim.items.stairsGeometry(s)!;
    expect(g.open).toBe(1);
    // A boat driving straight into the stairs' middle: stopped, and hurt once.
    const midAlong = s.along - 140;
    const n = sim.track.nearest((g.base.x + g.tip.x) / 2, (g.base.y + g.tip.y) / 2, -1);
    put(sim, me, midAlong, n.lateral, 300);
    for (const o of sim.racers) o.effects = o.effects.filter((e) => e.kind !== 'invulnerable');
    const hull = me.hull;
    const ev = run(sim, 1.2);
    expect(ev.filter((e) => e.type === 'hit' && e.racer === me.id && e.source === 'stairs')).toHaveLength(1);
    expect(me.hull).toBeLessThan(hull);
    expect(sim.track.alongOf(me.progress)).toBeLessThan(s.along); // didn't go through
    // copied to online clients
    const copy = lone(2);
    applyState(copy, JSON.parse(JSON.stringify(encodeState(sim))));
    expect(encodeState(copy).stairs).toEqual(encodeState(sim).stairs);
    run(sim, TUNING.stairs.life + TUNING.stairs.unfold + 0.5);
    expect(sim.items.stairs).toHaveLength(0);
  });
});
