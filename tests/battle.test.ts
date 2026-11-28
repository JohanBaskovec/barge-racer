import { describe, expect, it } from 'vitest';
import { ARENA_DEFS, TRACK_DEFS, loadTrack } from '../src/data/tracks';
import { removeEffect } from '../src/effects/effects';
import { BATTLE, type GameMode, TEAM_COLORS, winLimit } from '../src/race/battle';
import { bargeCapsule } from '../src/race/traffic';
import { BATTLE_ODDS } from '../src/data/items';
import { drawItem } from '../src/items/itemOdds';
import { Rng } from '../src/physics/math';
import { touchesCapsule } from '../src/physics/collisions';
import { addEffect, hasEffect } from '../src/effects/effects';
import { RaceSimulation, STEP } from '../src/race/RaceSimulation';
import { NO_INTENT, type Racer } from '../src/race/types';
import type { ServerMsg } from '../src/net/protocol';
import { TICK_MS } from '../src/net/protocol';
import { RoomCore } from '../src/net/room';
import { applyState, encodeState } from '../src/net/snapshot';

/** Boats that sit still (so the tests decide what happens). */
const idle = { update: () => NO_INTENT };

function battle(mode: Exclude<GameMode, 'race'>, n = 4, arena = 'arenaBasin', ai = false) {
  const sim = new RaceSimulation({
    track: loadTrack(arena),
    difficulty: 'river',
    seed: 7,
    roster: Array.from({ length: n }, (_, i) => ({ name: `B${i}`, boatId: 'tugboat', human: !ai, controller: ai ? undefined : idle })),
    mode,
  });
  while (sim.phase !== 'racing') sim.step(STEP);
  return { sim, b: sim.battle! };
}

/** Sink `r`, last hit by `by` (null: nobody). */
function sinkBy(sim: RaceSimulation, r: Racer, by: number | null): void {
  removeEffect(r, 'invulnerable');
  sim.hit(r, r.hull + 1, by, 'nailGun');
}

/** Let a sinking boat come back. */
function waitRespawn(sim: RaceSimulation, r: Racer): void {
  for (let i = 0; i < 600 && r.sinkTimer > 0; i++) sim.step(STEP);
  expect(r.sinkTimer).toBe(0);
}

describe('battle setup', () => {
  it('splits the boats into two teams, coloured, each starting at its own base', () => {
    const { sim, b } = battle('teamDeathmatch', 6);
    expect(b.teams).toEqual([0, 1, 0, 1, 0, 1]);
    for (const r of sim.racers) {
      expect(r.color).toBe(TEAM_COLORS[b.teams[r.id]]);
      const own = b.basePoint(b.teams[r.id]), other = b.basePoint(1 - b.teams[r.id]);
      expect(Math.hypot(r.x - own.x, r.y - own.y)).toBeLessThan(Math.hypot(r.x - other.x, r.y - other.y));
    }
  });

  it('free for all has no teams', () => {
    const { b } = battle('deathmatch', 5);
    expect(b.teams).toEqual([-1, -1, -1, -1, -1]);
    expect(b.flags).toEqual([]);
  });

  it('the arenas are listed apart from the race tracks, have no moving barges and two bases', () => {
    expect(ARENA_DEFS.map((d) => d.id)).toEqual(['arenaBasin', 'arenaLakes']);
    for (const d of ARENA_DEFS) {
      expect(d.arena).toBe(true);
      expect(d.traffic).toBe(0);
      expect(d.bases).toHaveLength(2);
      expect(TRACK_DEFS.some((t) => t.id === d.id)).toBe(false);
    }
    // Only moored barges (cover), which never move.
    const { sim } = battle('deathmatch', 4, 'arenaLakes');
    expect(sim.traffic.barges.length).toBe(4);
    expect(sim.traffic.barges.every((b) => b.moored && b.speed === 0)).toBe(true);
    expect(sim.traffic.poses(100)).toEqual(sim.traffic.poses(0));
    expect(sim.traffic.poses(0).every((p) => p.solid && p.moored)).toBe(true);
  });

  it('the points that win go with the number of boats', () => {
    expect(winLimit('deathmatch', 6)).toBe(8);
    expect(winLimit('deathmatch', 4)).toBe(6);
    expect(winLimit('teamDeathmatch', 6)).toBe(18);
    expect(winLimit('teamDeathmatch', 4)).toBe(12);
    expect(winLimit('ctf', 8)).toBe(BATTLE.captureLimit);
    expect(battle('deathmatch', 5).b.limit).toBe(7);
  });
});

describe('deathmatch', () => {
  it('sinking a boat scores for whoever hit it last; a sinking with no recent hit scores nothing', () => {
    const { sim, b } = battle('deathmatch');
    sinkBy(sim, sim.racers[1], 0);
    expect(b.stats[0].kills).toBe(1);
    expect(b.stats[1].deaths).toBe(1);
    expect(sim.takeEvents()).toContainEqual({ type: 'kill', racer: 1, by: 0 });
    sinkBy(sim, sim.racers[2], null);
    expect(b.stats[2].deaths).toBe(1);
    expect(b.scores).toEqual([1, 0, 0, 0]);
    // The leader is first in the standings.
    sim.updateRanking();
    expect(sim.racers[0].position).toBe(0);
  });

  it('a hit too long ago gets no credit', () => {
    const { sim, b } = battle('deathmatch');
    const r = sim.racers[1];
    sim.hit(r, 1, 0, 'nailGun');
    for (let i = 0; i < (BATTLE.killCredit + 1) / STEP; i++) sim.step(STEP);
    sinkBy(sim, r, null);
    expect(b.stats[0].kills).toBe(0);
  });

  it('comes back where no opponent is near, and the match ends at the points limit', () => {
    const { sim, b } = battle('deathmatch');
    const r = sim.racers[3];
    for (let k = 0; k < b.limit; k++) {
      sinkBy(sim, r, 0);
      waitRespawn(sim, r);
      expect(r.hull).toBe(r.stats.maxHull);
      // Farther from the others than an average spot on the arena.
      const near = Math.min(...sim.racers.filter((o) => o !== r).map((o) => Math.hypot(o.x - r.x, o.y - r.y)));
      expect(near).toBeGreaterThan(300);
    }
    expect(b.over).toBe(true);
    for (let i = 0; i < (BATTLE.endPause + 0.5) / STEP && sim.phase !== 'over'; i++) sim.step(STEP);
    expect(sim.phase).toBe('over');
    expect(sim.results()[0].racer.id).toBe(0);
  });

  it('ends when time runs out with a leader', () => {
    const { sim, b } = battle('deathmatch');
    sinkBy(sim, sim.racers[1], 2);
    b.timeLeft = 0.5;
    for (let i = 0; i < 300 && sim.phase !== 'over'; i++) sim.step(STEP);
    expect(sim.phase).toBe('over');
    expect(sim.results()[0].racer.id).toBe(2);
  });

  it('level when time runs out: sudden death, the next point wins', () => {
    const { sim, b } = battle('deathmatch');
    sinkBy(sim, sim.racers[1], 0);
    sinkBy(sim, sim.racers[0], 3); // 0 and 3 share the lead
    b.timeLeft = 0.2;
    for (let i = 0; i < 30; i++) sim.step(STEP);
    expect(b.suddenDeath).toBe(true);
    expect(b.over).toBe(false);
    expect(sim.takeEvents()).toContainEqual({ type: 'suddenDeath' });
    // A point for somebody else doesn't break the tie at the top...
    sinkBy(sim, sim.racers[2], 1);
    sinkBy(sim, sim.racers[3], 1); // ...but now 1 leads alone with 2
    expect(b.over).toBe(true);
    expect(b.order()[0].id).toBe(1);
  });

  it('still level at the end of sudden death: a draw', () => {
    const { sim, b } = battle('teamDeathmatch');
    b.timeLeft = 0.1;
    for (let i = 0; i < (BATTLE.overtime + 1) / STEP && !b.over; i++) sim.step(STEP);
    expect(b.over).toBe(true);
    expect(b.winnerTeam).toBe(-1);
  });
});

describe('team deathmatch', () => {
  it('sinking a team-mate scores nothing; the team adds up its points and comes back at its base', () => {
    const { sim, b } = battle('teamDeathmatch', 4);
    sinkBy(sim, sim.racers[2], 0); // same team (0)
    expect(b.teamScores).toEqual([0, 0]);
    sinkBy(sim, sim.racers[1], 0);
    sinkBy(sim, sim.racers[3], 2);
    expect(b.teamScores).toEqual([2, 0]);
    const r = sim.racers[1];
    waitRespawn(sim, r);
    const own = b.basePoint(1);
    expect(Math.hypot(r.x - own.x, r.y - own.y)).toBeLessThan(BATTLE.baseAlong + 400);
  });

  it('the team with more points wins', () => {
    const { sim, b } = battle('teamDeathmatch', 4);
    sinkBy(sim, sim.racers[0], 1);
    b.timeLeft = 0.1;
    for (let i = 0; i < 20; i++) sim.step(STEP);
    expect(b.winnerTeam).toBe(1);
    expect(sim.takeEvents()).toContainEqual({ type: 'battleOver', team: 1 });
  });
});

describe('capture the flag', () => {
  let sim: RaceSimulation;
  /** Move a boat (and where it is along the loop, or the race would think it left the water). */
  const put = (r: Racer, x: number, y: number) => {
    r.x = x;
    r.y = y;
    r.vx = r.vy = 0;
    r.nearestIndex = sim.track.nearest(x, y, -1).index;
  };

  it('take the flag, bring it home while yours is there: a capture', () => {
    const g = battle('ctf', 4);
    sim = g.sim;
    const b = g.b;
    const thief = sim.racers[0]; // Corsica
    const [own, enemy] = b.flags;
    put(thief, enemy.homeX, enemy.homeY);
    sim.step(STEP);
    expect(enemy.carrier).toBe(0);
    put(thief, own.homeX, own.homeY);
    sim.step(STEP);
    expect(b.teamScores).toEqual([1, 0]);
    expect(b.stats[0].captures).toBe(1);
    expect(enemy.carrier).toBe(-1);
    expect([enemy.x, enemy.y]).toEqual([enemy.homeX, enemy.homeY]);
    expect(sim.takeEvents().filter((e) => e.type === 'flag').map((e) => e.type === 'flag' && e.action)).toEqual(['taken', 'captured']);
  });

  it('no capture while your own flag is away', () => {
    const g = battle('ctf', 4);
    sim = g.sim;
    const b = g.b;
    const [own, enemy] = b.flags;
    put(sim.racers[0], enemy.homeX, enemy.homeY);
    put(sim.racers[1], own.homeX + 2000, own.homeY); // keep Brittany's boats off the Corsican base
    put(sim.racers[3], own.homeX + 2000, own.homeY + 200);
    sim.step(STEP);
    own.carrier = 1; // Brittany has the Corsican flag
    put(sim.racers[0], own.homeX, own.homeY);
    sim.step(STEP);
    expect(b.teamScores).toEqual([0, 0]);
  });

  it('a carrier that sinks drops the flag; its team brings it home, the other team takes it again', () => {
    const g = battle('ctf', 4);
    sim = g.sim;
    const b = g.b;
    const enemy = b.flags[1];
    const thief = sim.racers[0];
    put(thief, enemy.homeX, enemy.homeY);
    sim.step(STEP);
    put(thief, enemy.homeX + 600, enemy.homeY);
    sim.step(STEP);
    sinkBy(sim, thief, 1);
    expect(enemy.dropped).toBe(true);
    expect(enemy.carrier).toBe(-1);
    // Another Corsican boat picks it up where it lies.
    put(sim.racers[2], enemy.x, enemy.y);
    sim.step(STEP);
    expect(enemy.carrier).toBe(2);
    sinkBy(sim, sim.racers[2], 1);
    // A Breton boat touches it: back home.
    put(sim.racers[1], enemy.x, enemy.y);
    sim.step(STEP);
    expect(enemy.dropped).toBe(false);
    expect([enemy.x, enemy.y]).toEqual([enemy.homeX, enemy.homeY]);
  });

  it('a dropped flag left alone goes home', () => {
    const g = battle('ctf', 4);
    sim = g.sim;
    const b = g.b;
    const f = b.flags[0];
    Object.assign(f, { dropped: true, x: f.homeX + 900, y: f.homeY });
    for (const r of sim.racers) put(r, f.homeX - 3000, f.homeY); // nobody near it
    for (let i = 0; i < (BATTLE.flagReturn + 1) / STEP; i++) sim.step(STEP);
    expect(f.dropped).toBe(false);
    expect([f.x, f.y]).toEqual([f.homeX, f.homeY]);
  });

  it('AI boats play it out to the end on both arenas', { timeout: 60000 }, () => {
    for (const arena of ['arenaBasin', 'arenaLakes']) {
      const { sim, b } = battle('ctf', 6, arena, true);
      for (let i = 0; i < 400 / STEP && sim.phase !== 'over'; i++) sim.step(STEP);
      expect(sim.phase).toBe('over');
      expect(b.stats.reduce((n, s) => n + s.deaths, 0) + b.teamScores[0] + b.teamScores[1]).toBeGreaterThan(0);
    }
  });
});

describe('battle online', () => {
  it('a snapshot carries the scores, the flags and the clock', () => {
    const { sim, b } = battle('ctf', 4);
    sinkBy(sim, sim.racers[1], 0);
    Object.assign(b.flags[1], { carrier: 0 });
    b.teamScores = [2, 1];
    const copy = battle('ctf', 4).sim;
    applyState(copy, JSON.parse(JSON.stringify(encodeState(sim))));
    expect(encodeState(copy).bt).toEqual(encodeState(sim).bt);
    expect(copy.battle!.stats[0].kills).toBe(1);
    expect(copy.battle!.flags[1].carrier).toBe(0);
  });

  function client(id: string) {
    const got: ServerMsg[] = [];
    return { conn: { id, send: (d: string) => got.push(JSON.parse(d)) }, got, last: <T extends ServerMsg['t']>(t: T) => [...got].reverse().find((m) => m.t === t) as Extract<ServerMsg, { t: T }> | undefined };
  }

  it('the host picks a battle on an arena; people pick sides, AI boats even the teams; the results carry the tally', { timeout: 60000 }, () => {
    let now = 0;
    const r = new RoomCore('ABCD', () => now, 3);
    const [a, b] = ['a', 'b'].map(client);
    r.message(a.conn, JSON.stringify({ t: 'join', name: 'A', boatId: 'tugboat' }));
    r.message(b.conn, JSON.stringify({ t: 'join', name: 'B', boatId: 'tugboat' }));
    // A battle on a race track is refused, and so is a race on an arena.
    r.message(a.conn, JSON.stringify({ t: 'settings', settings: { trackId: TRACK_DEFS[0].id, difficulty: 'river', mode: 'ctf' } }));
    expect(r.settings.mode).toBeUndefined();
    r.message(a.conn, JSON.stringify({ t: 'settings', settings: { trackId: 'arenaBasin', difficulty: 'river' } }));
    expect(r.settings.trackId).toBe(TRACK_DEFS[0].id);
    r.message(a.conn, JSON.stringify({ t: 'settings', settings: { trackId: 'arenaLakes', difficulty: 'river', mode: 'teamDeathmatch', size: 6, cup: true } }));
    expect(r.settings).toMatchObject({ trackId: 'arenaLakes', mode: 'teamDeathmatch', size: 6 });
    expect(r.cup).toBeNull();
    let lobby = a.last('lobby')!;
    expect(lobby.players.map((p) => p.team)).toEqual([0, 1]);
    // B joins Corsica too: the AI boats fill Brittany.
    r.message(b.conn, JSON.stringify({ t: 'team', team: 0 }));
    lobby = a.last('lobby')!;
    expect(lobby.players.map((p) => p.team)).toEqual([0, 0]);
    expect(lobby.bots.map((x) => x.team)).toEqual([1, 1, 0, 1]);
    r.message(b.conn, JSON.stringify({ t: 'ready', ready: true }));
    r.message(a.conn, JSON.stringify({ t: 'start' }));
    const start = a.last('start')!;
    expect(start.settings.mode).toBe('teamDeathmatch');
    expect(start.roster.map((e) => e.team)).toEqual([0, 0, 1, 1, 0, 1]);
    expect(r.sim!.battle!.teams).toEqual([0, 0, 1, 1, 0, 1]);
    // Play it out (people idle: the server's AI stands in for them).
    r.sim!.battle!.timeLeft = 20;
    for (let ticks = 0; r.racing && ticks < 4000; ticks++) {
      now += TICK_MS;
      r.tick();
    }
    const snap = a.last('snap')!;
    expect(snap.state.bt).toBeDefined();
    const res = a.last('results')!;
    expect(res.battle).toMatchObject({ mode: 'teamDeathmatch' });
    expect(res.rows).toHaveLength(6);
    for (const row of res.rows) expect(row).toHaveProperty('kills');
    // Back in the lobby, still a battle.
    expect(a.last('lobby')!.settings.mode).toBe('teamDeathmatch');
  });
});

describe('battle items', () => {
  it('no friendly fire: a team-mate\'s hit does nothing, an opponent\'s hurts more than in a race', () => {
    const { sim } = battle('teamDeathmatch', 4);
    const r = sim.racers[0];
    const full = r.hull;
    expect(sim.hit(r, 10, 2, 'nailGun')).toBe(false); // 2 is on team 0 too
    expect(r.hull).toBe(full);
    expect(sim.hit(r, 10, 1, 'nailGun')).toBe(true);
    expect(r.hull).toBeCloseTo(full - 10 * BATTLE.damageMult);
  });

  it('items that hit everyone spare team-mates; free for all, they hit everyone else', () => {
    const { sim } = battle('teamDeathmatch', 4);
    sim.items.give(sim.racers[0], 'siphon');
    sim.items.use(sim.racers[0], 0, 'forward');
    expect(sim.racers.map((o) => hasEffect(o, 'siphoned'))).toEqual([false, true, false, true]);
    const ffa = battle('deathmatch', 4).sim;
    ffa.items.give(ffa.racers[0], 'siphon');
    ffa.items.use(ffa.racers[0], 0, 'forward');
    expect(ffa.racers.map((o) => hasEffect(o, 'siphoned'))).toEqual([false, true, true, true]);
  });

  it('volunteers home in on the nearest opponent in front, never a team-mate', () => {
    const { sim } = battle('teamDeathmatch', 4);
    const [me, foe, mate] = [sim.racers[0], sim.racers[1], sim.racers[2]];
    const ahead = (r: Racer, d: number, side = 0) => {
      r.x = me.x + Math.cos(me.heading) * d - Math.sin(me.heading) * side;
      r.y = me.y + Math.sin(me.heading) * d + Math.cos(me.heading) * side;
    };
    ahead(mate, 200);
    ahead(foe, 500, 60);
    sim.racers[3].x = me.x - 3000;
    expect(sim.items.nearestFoe(me, 'forward', 0.9, 1400)?.id).toBe(1);
    sim.items.give(me, 'volunteer');
    sim.items.use(me, 0, 'forward');
    expect(sim.items.volunteers[0].targetId).toBe(1);
  });

  it('aim assist: a shot fired close to an opponent goes at it (in a battle only)', () => {
    for (const mode of ['deathmatch', 'race'] as const) {
      const sim = mode === 'race'
        ? new RaceSimulation({ track: loadTrack('arenaBasin'), difficulty: 'river', seed: 7, roster: Array.from({ length: 2 }, (_, i) => ({ name: `B${i}`, boatId: 'tugboat', human: true, controller: idle })) })
        : battle('deathmatch', 2).sim;
      const [me, foe] = sim.racers;
      // 12 degrees off the bow, 500 px away
      const a = me.heading + 0.21;
      foe.x = me.x + Math.cos(a) * 500;
      foe.y = me.y + Math.sin(a) * 500;
      foe.vx = foe.vy = 0;
      sim.items.give(me, 'siliconeGun');
      sim.items.use(me, 0, 'forward');
      const blob = sim.items.blobs[0];
      expect(Math.abs(blob.heading - a) < 0.02).toBe(mode === 'deathmatch');
    }
  });

  it('a hit makes a flag carrier drop the flag; carrying it slows you', () => {
    const { sim, b } = battle('ctf', 4);
    const thief = sim.racers[0];
    b.flags[1].carrier = 0;
    sim.step(STEP);
    expect(thief.catchUp).toBe(BATTLE.carrierSpeed);
    removeEffect(thief, 'invulnerable');
    sim.hit(thief, 5, 1, 'nailGun');
    expect(b.flags[1].carrier).toBe(-1);
    expect(b.flags[1].dropped).toBe(true);
    sim.step(STEP);
    expect(thief.catchUp).toBe(1);
  });

  it('item odds are the same for everyone whatever the score, and lean to offensive items', () => {
    const OFFENSIVE = ['volunteer', 'nailGun', 'drill', 'jigsaw', 'siliconeGun', 'circularSaw', 'karcher', 'dildo', 'vacuum', 'raclette', 'titten', 'siphon', 'sauna', 'noise', 'stairs', 'blackout', 'mushroom'];
    const draw = (position: number, table?: Record<string, number>) => {
      const rng = new Rng(9);
      const got: Record<string, number> = {};
      for (let i = 0; i < 6000; i++) {
        const id = drawItem(rng, { position, count: 6, volunteersInFlight: 0, recentItems: [], table: table as never });
        got[id] = (got[id] ?? 0) + 1;
      }
      return got;
    };
    // Leader or last: the very same draws.
    expect(draw(0, BATTLE_ODDS)).toEqual(draw(5, BATTLE_ODDS));
    const battleDraws = draw(2, BATTLE_ODDS);
    for (const id of ['tugboat', 'translation', 'champagne']) expect(battleDraws[id]).toBeUndefined();
    const share = (got: Record<string, number>) => OFFENSIVE.reduce((n, id) => n + (got[id] ?? 0), 0) / 6000;
    // More offensive items than anywhere in a race, fewer defensive ones.
    for (const p of [0, 2, 5]) expect(share(battleDraws)).toBeGreaterThan(share(draw(p)) + 0.08);
    expect(share(battleDraws)).toBeGreaterThan(0.8);
    expect((battleDraws.beer ?? 0) + (battleDraws.beerDispenser ?? 0)).toBeLessThan(draw(0).beer + (draw(0).beerDispenser ?? 0));
  });

  it('in a battle, the crate a boat opens doesn\'t depend on its score', () => {
    const items = (lead: boolean) => {
      const { sim } = battle('deathmatch', 4);
      if (lead) for (const v of [1, 2, 3]) sinkBy(sim, sim.racers[v], 0);
      const me = sim.racers[0];
      const got: string[] = [];
      for (let k = 0; k < 40; k++) {
        me.slots = [null, null];
        me.rouletteItem = null;
        (sim.items as unknown as { openCrate(r: Racer): void }).openCrate(me);
        got.push(me.rouletteItem!);
      }
      return got;
    };
    expect(items(true)).toEqual(items(false));
  });

  it('golden crates: in the middle of the water, late to turn up, and full of the best (x3)', () => {
    const { sim } = battle('deathmatch', 2);
    const golden = sim.items.crates.filter((c) => c.power);
    expect(golden).toHaveLength(2);
    expect(golden[0].respawn).toBeGreaterThan(10);
    golden[0].respawn = 0;
    const me = sim.racers[0];
    me.x = golden[0].x;
    me.y = golden[0].y;
    me.nearestIndex = sim.track.nearest(me.x, me.y, -1).index;
    sim.step(STEP);
    expect(golden[0].respawn).toBeCloseTo(BATTLE.powerRespawn, 0);
    expect(me.rouletteItem).not.toBeNull();
    // (an item with three uses already can't be tripled)
    expect(me.rouletteTriple || me.rouletteItem === 'nailGun' || me.rouletteItem === 'volunteer').toBe(true);
  });

  it('never comes back inside a moored barge', () => {
    for (const arena of ['arenaBasin', 'arenaLakes']) {
      const { sim, b } = battle('deathmatch', 6, arena);
      const caps = sim.trafficPoses.map(bargeCapsule);
      for (let k = 0; k < 60; k++) {
        const r = sim.racers[k % 6];
        const p = b.respawnPoint(r);
        expect(caps.some((c) => touchesCapsule(p.x, p.y, r.stats.radius, c))).toBe(false);
      }
    }
  });

  it('things that land in front of a boat follow the way it is going round the arena', () => {
    const { sim } = battle('deathmatch', 2);
    const r = sim.racers[0];
    const s = sim.track.samples[r.nearestIndex];
    r.vx = s.tx * 200;
    r.vy = s.ty * 200;
    expect(sim.facing(r)).toBe(1);
    r.vx = -r.vx;
    r.vy = -r.vy;
    expect(sim.facing(r)).toBe(-1);
    addEffect(r, 'boost', 1); // (nothing to do with it: facing reads the course only)
    expect(sim.facing(r)).toBe(-1);
  });
});
