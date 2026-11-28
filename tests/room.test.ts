import { describe, expect, it } from 'vitest';
import { AIController } from '../src/control/AIController';
import { DIFFICULTIES } from '../src/data/difficulty';
import { loadTrack } from '../src/data/tracks';
import { Rng } from '../src/physics/math';
import { RaceSimulation, STEP } from '../src/race/RaceSimulation';
import type { InputTuple, ServerMsg } from '../src/net/protocol';
import { TICK_MS, isRoomCode, randomRoomCode } from '../src/net/protocol';
import { RoomCore, cleanName } from '../src/net/room';
import { applyState } from '../src/net/snapshot';
import { CUP_TRACKS } from '../src/cup/championship';

/** A fake screen that records what the room sends it. */
function client(id: string) {
  const got: ServerMsg[] = [];
  return { conn: { id, send: (d: string) => got.push(JSON.parse(d)) }, got, last: <T extends ServerMsg['t']>(t: T) => [...got].reverse().find((m) => m.t === t) as Extract<ServerMsg, { t: T }> | undefined };
}

function room() {
  let now = 0;
  const r = new RoomCore('ABCD', () => now, 42);
  return { r, advance: (ms: number) => (now += ms), now: () => now };
}

describe('room codes and names', () => {
  it('makes readable codes', () => {
    for (let i = 0; i < 50; i++) expect(isRoomCode(randomRoomCode())).toBe(true);
    expect(isRoomCode('ABIO')).toBe(false);
  });
  it('cleans names', () => {
    expect(cleanName('  Johan  ')).toBe('Johan');
    expect(cleanName('a\u0000b')).toBe('ab');
    expect(cleanName('x'.repeat(40))).toHaveLength(16);
    expect(cleanName(42)).toBe('Captain');
  });
});

describe('lobby', () => {
  it('lets eight people in a room of eight, makes the first one host, and refuses a ninth', () => {
    const { r } = room();
    const cs = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map(client);
    r.message(cs[0].conn, JSON.stringify({ t: 'join', name: 'a', boatId: 'tugboat' }));
    r.message(cs[0].conn, JSON.stringify({ t: 'settings', settings: { ...r.settings, size: 8 } }));
    expect(cs[0].last('lobby')!.bots).toHaveLength(7); // the empty seats are AI boats
    for (const c of cs.slice(1)) r.message(c.conn, JSON.stringify({ t: 'join', name: c.conn.id, boatId: 'tugboat' }));
    expect(cs[0].last('welcome')).toMatchObject({ t: 'welcome', you: 'a', code: 'ABCD' });
    expect(cs[0].last('welcome')!.key).toMatch(/^[0-9a-f]{32}$/);
    expect(cs[0].last('welcome')!.key).not.toBe(cs[1].last('welcome')!.key);
    const lobby = cs[0].last('lobby')!;
    expect(lobby.players.map((p) => p.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    expect(lobby.players[0].host).toBe(true);
    expect(lobby.bots).toEqual([]); // every AI boat made way for a person
    expect(cs[8].last('error')).toEqual({ t: 'error', reason: 'full' });
  });

  it('the room size is how many boats race: AI boats fill the seats people leave free', () => {
    const { r } = room();
    const [a, b, c, d] = ['a', 'b', 'c', 'd'].map(client);
    const size = (n: number, who = a) => r.message(who.conn, JSON.stringify({ t: 'settings', settings: { ...r.settings, size: n } }));
    const ids = () => a.last('lobby')!.bots.map((x) => x.id);
    r.message(a.conn, JSON.stringify({ t: 'join', name: 'A', boatId: 'cabourg' }));
    expect(r.settings.size).toBe(4); // a new room: its host and three AI boats
    const first = ids();
    expect(first).toHaveLength(3);
    // someone joining takes the first AI boat's seat
    r.message(b.conn, JSON.stringify({ t: 'join', name: 'B', boatId: 'tugboat' }));
    expect(ids()).toEqual(first.slice(1));
    // only the host resizes; bigger adds AI boats at the end, smaller removes them from the end
    size(6, b);
    expect(r.settings.size).toBe(4);
    size(6);
    expect(ids()).toHaveLength(4);
    expect(ids().slice(0, 2)).toEqual(first.slice(1));
    expect(new Set(a.last('lobby')!.bots.map((x) => x.name)).size).toBe(4);
    const six = ids();
    size(5);
    expect(ids()).toEqual(six.slice(0, 3));
    size(99);
    expect(r.settings.size).toBe(8);
    expect(ids()).toHaveLength(6);
    // never smaller than the people in the room
    size(2);
    expect(r.settings.size).toBe(2);
    expect(ids()).toEqual([]);
    size(1);
    expect(r.settings.size).toBe(2);
    r.message(c.conn, JSON.stringify({ t: 'join', name: 'C', boatId: 'tugboat' }));
    expect(c.last('error')).toEqual({ t: 'error', reason: 'full' });
    // addBot is one more seat; removing an AI boat takes its seat away too
    r.message(b.conn, JSON.stringify({ t: 'addBot' }));
    expect(r.settings.size).toBe(2);
    for (let i = 0; i < 10; i++) r.message(a.conn, JSON.stringify({ t: 'addBot' }));
    expect(r.settings.size).toBe(8);
    const bots = a.last('lobby')!.bots;
    r.message(b.conn, JSON.stringify({ t: 'removeBot', id: bots[0].id }));
    expect(ids()).toHaveLength(6);
    r.message(a.conn, JSON.stringify({ t: 'removeBot', id: bots[0].id }));
    r.message(a.conn, JSON.stringify({ t: 'removeBot', id: bots[1].id }));
    expect(ids()).toEqual(bots.slice(2).map((x) => x.id));
    expect(r.settings.size).toBe(6);
    // someone leaving the lobby gives their seat to an AI boat
    r.message(d.conn, JSON.stringify({ t: 'join', name: 'D', boatId: 'tugboat' }));
    expect(ids()).toEqual(bots.slice(3).map((x) => x.id));
    r.disconnect(d.conn);
    expect(ids()).toHaveLength(4);
    expect(ids().slice(0, 3)).toEqual(bots.slice(3).map((x) => x.id));
    // the race has exactly those boats: the people, then the AI boats
    r.message(b.conn, JSON.stringify({ t: 'ready', ready: true }));
    r.message(a.conn, JSON.stringify({ t: 'start' }));
    const start = a.last('start')!;
    expect(start.roster.map((e) => e.name)).toEqual(['A', 'B', ...a.last('lobby')!.bots.map((x) => x.name)]);
    expect(start.roster).toHaveLength(6);
  });

  it('a room of one: the host races alone', { timeout: 60000 }, () => {
    const { r, advance } = room();
    const a = client('a');
    r.message(a.conn, JSON.stringify({ t: 'join', name: 'A', boatId: 'tugboat' }));
    r.message(a.conn, JSON.stringify({ t: 'settings', settings: { ...r.settings, size: 1 } }));
    expect(a.last('lobby')!.bots).toEqual([]);
    r.message(a.conn, JSON.stringify({ t: 'start' }));
    expect(a.last('start')!.roster).toHaveLength(1);
    const brain = new AIController(new Rng(1), DIFFICULTIES.ocean, 0);
    let step = 0;
    for (let ticks = 0; r.racing && ticks < 20000; ticks++) {
      const inputs: InputTuple[] = [];
      for (let i = 0; i < 3; i++) {
        const intent = brain.update(r.sim!.racers[0], r.sim!, STEP);
        inputs.push([++step, intent.desiredHeading, intent.throttle, -1, 0]);
      }
      r.message(a.conn, JSON.stringify({ t: 'in', i: inputs }));
      advance(TICK_MS);
      r.tick();
    }
    expect(a.last('results')!.rows).toMatchObject([{ playerId: 'a', finished: true }]);
  });

  it('only the host changes the track and starts, once everyone is ready', () => {
    const { r } = room();
    const [a, b] = ['a', 'b'].map(client);
    r.message(a.conn, JSON.stringify({ t: 'join', name: 'A', boatId: 'cabourg' }));
    r.message(b.conn, JSON.stringify({ t: 'join', name: 'B', boatId: 'tugboat' }));
    r.message(b.conn, JSON.stringify({ t: 'settings', settings: { trackId: 'bayouBends', difficulty: 'ocean' } }));
    expect(r.settings.trackId).not.toBe('bayouBends');
    r.message(a.conn, JSON.stringify({ t: 'settings', settings: { trackId: 'bayouBends', difficulty: 'ocean' } }));
    expect(r.settings).toEqual({ trackId: 'bayouBends', difficulty: 'ocean', size: 4 });
    r.message(a.conn, JSON.stringify({ t: 'start' }));
    expect(r.racing).toBe(false); // B isn't ready
    r.message(b.conn, JSON.stringify({ t: 'ready', ready: true }));
    r.message(b.conn, JSON.stringify({ t: 'start' }));
    expect(r.racing).toBe(false); // B isn't the host
    r.message(a.conn, JSON.stringify({ t: 'start' }));
    expect(r.racing).toBe(true);
    const start = b.last('start')!;
    expect(start.roster).toHaveLength(4); // two people and the two AI boats left in a room of four
    expect(start.roster.slice(0, 2).map((e) => e.playerId)).toEqual(['a', 'b']);
    expect(start.roster.slice(2).every((e) => !e.human && e.playerId === null)).toBe(true);
  });

  it('ignores garbage; someone joining during a race watches it, then races in the next one', () => {
    const { r } = room();
    const a = client('a');
    r.message(a.conn, 'not json');
    r.message(a.conn, JSON.stringify({ t: 'start' }));
    r.message(a.conn, JSON.stringify({ t: 'join', name: 'A', boatId: 'no-such-boat' }));
    expect(a.last('lobby')!.players[0].boatId).toBe('cabourg');
    r.message(a.conn, JSON.stringify({ t: 'start' }));
    const late = client('late');
    r.message(late.conn, JSON.stringify({ t: 'join', name: 'L', boatId: 'tugboat' }));
    expect(late.last('error')).toBeUndefined();
    expect(late.last('start')!.roster.some((e) => e.playerId === 'late')).toBe(false); // watching: how the race started
    expect(late.last('lobby')!.players[1]).toMatchObject({ id: 'late', watching: true });
    r.tick();
    expect(late.last('snap')!.ack).toBe(-1);
    r.message(late.conn, JSON.stringify({ t: 'in', i: [[1, 0, 1, 0, 0]] })); // a watcher has no boat to drive
    expect(r.sim!.racers.filter((x) => x.human)).toHaveLength(1);
  });
});

describe('race', () => {
  /** Two people racing: each "screen" drives with an AI brain and sends its controls like the real game. */
  function race(opts: { dropB?: number } = {}) {
    const { r, advance } = room();
    const [a, b] = ['a', 'b'].map(client);
    r.message(a.conn, JSON.stringify({ t: 'join', name: 'A', boatId: 'cigaretteSpeedboat' }));
    r.message(b.conn, JSON.stringify({ t: 'join', name: 'B', boatId: 'narrowboat' }));
    r.message(b.conn, JSON.stringify({ t: 'ready', ready: true }));
    r.message(a.conn, JSON.stringify({ t: 'start' }));
    const brains = [new AIController(new Rng(1), DIFFICULTIES.ocean, 0), new AIController(new Rng(2), DIFFICULTIES.ocean, 0.2)];
    const step = [0, 0];
    let ticks = 0;
    let bConnected = true;
    while (r.racing && ticks < 20000) {
      const sim = r.sim!;
      for (const [k, c] of [a, b].entries()) {
        if (k === 1 && !bConnected) continue;
        const inputs: InputTuple[] = [];
        for (let i = 0; i < 3; i++) {
          const intent = brains[k].update(sim.racers[k], sim, STEP);
          inputs.push([++step[k], intent.desiredHeading, intent.throttle, intent.fire?.slot ?? -1, intent.fire?.dir === 'backward' ? 1 : 0]);
        }
        r.message(c.conn, JSON.stringify({ t: 'in', i: inputs }));
      }
      advance(TICK_MS);
      r.tick();
      ticks++;
      if (opts.dropB && ticks === opts.dropB) {
        r.disconnect(b.conn);
        bConnected = false;
      }
    }
    return { r, a, b, ticks };
  }

  it('runs a whole race: snapshots 20 times a second, acks rising, then results for everyone', { timeout: 30000 }, () => {
    const { a, b, ticks } = race();
    const snaps = a.got.filter((m) => m.t === 'snap') as Extract<ServerMsg, { t: 'snap' }>[];
    expect(snaps.length).toBe(ticks);
    expect(snaps[100].s).toBe(101 * 3); // 3 simulation steps per 50 ms tick
    expect(snaps[200].ack).toBeGreaterThan(snaps[100].ack);
    expect(snaps.some((s) => s.ev.some((e) => e.type === 'countdown' && e.value === 0))).toBe(true);
    const results = b.last('results')!;
    expect(results.rows).toHaveLength(4);
    expect(results.rows.filter((row) => row.playerId).map((row) => row.playerId).sort()).toEqual(['a', 'b']);
    expect(results.rows.filter((row) => row.playerId).every((row) => row.finished)).toBe(true);
    expect(b.last('lobby')!.racing).toBe(false); // back to the lobby
  });

  it('when a player leaves mid-race the AI takes over their boat and the race goes on', { timeout: 30000 }, () => {
    const { a } = race({ dropB: 300 });
    const results = a.last('results')!;
    expect(results.rows).toHaveLength(4);
    expect(results.rows.find((row) => row.name === 'B')?.playerId).toBeNull();
    expect(results.rows.find((row) => row.playerId === 'a')?.finished).toBe(true);
    // back in the lobby, an AI boat has B's seat: still four boats
    const lobby = a.last('lobby')!;
    expect(lobby.players.map((p) => p.id)).toEqual(['a']);
    expect(lobby.bots).toHaveLength(3);
  });

  it('a snapshot recreates the race on another screen', () => {
    const { r, advance } = room();
    const a = client('a');
    r.message(a.conn, JSON.stringify({ t: 'join', name: 'A', boatId: 'tugboat' }));
    r.message(a.conn, JSON.stringify({ t: 'start' }));
    for (let i = 0; i < 120; i++) {
      r.message(a.conn, JSON.stringify({ t: 'in', i: [[i * 3 + 1, 0, 1, -1, 0], [i * 3 + 2, 0, 1, -1, 0], [i * 3 + 3, 0, 1, -1, 0]] }));
      advance(TICK_MS);
      r.tick();
    }
    const start = a.last('start')!;
    const snap = a.last('snap')!;
    const mirror = new RaceSimulation({
      track: loadTrack(start.settings.trackId), difficulty: start.settings.difficulty, seed: start.seed,
      roster: start.roster.map((e) => ({ name: e.name, boatId: e.boatId, human: e.human })), localRacer: 0,
    });
    applyState(mirror, snap.state);
    for (const [i, real] of r.sim!.racers.entries()) {
      expect(Math.abs(mirror.racers[i].x - real.x)).toBeLessThan(0.1);
      expect(Math.abs(mirror.racers[i].y - real.y)).toBeLessThan(0.1);
      expect(mirror.racers[i].position).toBe(real.position);
    }
    expect(mirror.phase).toBe('racing');
    expect(mirror.player!.name).toBe('A');
  });
});

describe('connection trouble', () => {
  /** A started race with A (host) and B, both sending controls each tick through `drive`. */
  function twoPlayerRace() {
    const t = room();
    const a = client('a');
    const b = client('b');
    t.r.message(a.conn, JSON.stringify({ t: 'join', name: 'A', boatId: 'cigaretteSpeedboat' }));
    t.r.message(b.conn, JSON.stringify({ t: 'join', name: 'B', boatId: 'narrowboat' }));
    t.r.message(b.conn, JSON.stringify({ t: 'ready', ready: true }));
    t.r.message(a.conn, JSON.stringify({ t: 'start' }));
    const step: Record<string, number> = {};
    const drive = (ticks: number, who: { conn: { id: string; send(d: string): void } }[]) => {
      for (let k = 0; k < ticks; k++) {
        for (const c of who) {
          const inputs: InputTuple[] = [];
          for (let i = 0; i < 3; i++) inputs.push([(step[c.conn.id] = (step[c.conn.id] ?? 0) + 1), 0, 1, -1, 0]);
          t.r.message(c.conn, JSON.stringify({ t: 'in', i: inputs }));
        }
        t.advance(TICK_MS);
        t.r.tick();
      }
    };
    return { ...t, a, b, drive };
  }

  it('keeps the seat of someone who lost the connection, and gives it back when they rejoin with their key', () => {
    const { r, a, b, drive } = twoPlayerRace();
    const key = b.last('welcome')!.key;
    drive(100, [a, b]);
    r.disconnect(b.conn);
    expect(r.sim!.racers[1].human).toBe(false); // the AI drives B's boat
    expect(a.last('lobby')!.players[1]).toMatchObject({ id: 'b', away: true });
    expect(r.playerCount).toBe(2);
    drive(40, [a]);

    const b2 = client('b2');
    r.message(b2.conn, JSON.stringify({ t: 'join', name: 'B', boatId: 'narrowboat', key }));
    expect(b2.last('welcome')).toMatchObject({ you: 'b', key }); // same player as before
    expect(b2.last('start')!.roster[1].playerId).toBe('b'); // how the race started, to rebuild it
    expect(r.sim!.racers[1].human).toBe(true);
    drive(10, [a, b2]);
    expect(b2.last('snap')!.ack).toBeGreaterThan(0); // B's new controls are being used
    expect(a.last('lobby')!.players[1].away).toBeUndefined();
  });

  it('a reconnection that arrives before the old connection is noticed as dead replaces it', () => {
    const { r, a, b, drive } = twoPlayerRace();
    let closed = false;
    const old = { ...b.conn, close: () => (closed = true) };
    // Re-register B's connection with a close() (the fake in client() has none).
    r.disconnect(b.conn);
    r.message(old, JSON.stringify({ t: 'join', name: 'B', boatId: 'narrowboat', key: b.last('welcome')!.key }));
    const b2 = client('b2');
    r.message(b2.conn, JSON.stringify({ t: 'join', name: 'B', boatId: 'narrowboat', key: b.last('welcome')!.key }));
    expect(closed).toBe(true);
    r.disconnect(old); // the old socket finally closes: nothing happens
    expect(r.sim!.racers[1].human).toBe(true);
    drive(5, [a, b2]);
    expect(b2.last('snap')).toBeDefined();
  });

  it('an unknown key is just a new player', () => {
    const { r } = room();
    const a = client('a');
    r.message(a.conn, JSON.stringify({ t: 'join', name: 'A', boatId: 'tugboat', key: 'nope' }));
    expect(a.last('welcome')!.you).toBe('a');
  });

  it('when controls stop arriving the AI drives until they come back', () => {
    const { r, a, b, drive } = twoPlayerRace();
    drive(150, [a, b]);
    drive(30, [a]); // B silent for 1.5 s (a frozen phone, a stalled connection)
    const bBoat = r.sim!.racers[1];
    const progress = bBoat.progress;
    drive(60, [a]);
    expect(bBoat.progress).toBeGreaterThan(progress + 100); // still moving along the course
    expect(bBoat.human).toBe(true); // still B's boat: the race waits for B at the finish
    const ack = b.last('snap')!.ack;
    drive(5, [a, b]);
    expect(b.last('snap')!.ack).toBeGreaterThan(ack); // B's controls are used again
  });

  it('a race everyone has dropped out of waits a minute for someone to come back, then is dropped', () => {
    const { r, a, b, advance } = twoPlayerRace();
    r.disconnect(a.conn);
    r.disconnect(b.conn);
    expect(r.racing).toBe(true);
    expect(r.empty).toBe(false);
    advance(30_000);
    r.tick();
    expect(r.racing).toBe(true);
    advance(31_000);
    r.tick();
    expect(r.racing).toBe(false);
    expect(r.empty).toBe(true);
  });
});


describe('championship and taunts online', () => {
  it('a championship: the cup picks the tracks, the room keeps the points, the leader starts at the back', { timeout: 240000 }, () => {
    const { r, advance } = room();
    const a = client('a');
    r.message(a.conn, JSON.stringify({ t: 'join', name: 'A', boatId: 'tugboat' }));
    r.message(a.conn, JSON.stringify({ t: 'settings', settings: { trackId: 'reimsCanal', difficulty: 'river', size: 3, cup: true } }));
    expect(r.settings).toMatchObject({ trackId: CUP_TRACKS[0], cup: true });
    expect(r.settings.section).toBeUndefined();
    expect(a.last('lobby')!.cup).toMatchObject({ done: 0, total: CUP_TRACKS.length, standings: [] });
    // While it lasts, the host can't pick another track.
    r.message(a.conn, JSON.stringify({ t: 'settings', settings: { trackId: 'bayouBends', difficulty: 'ocean', cup: true } }));
    expect(r.settings).toMatchObject({ trackId: CUP_TRACKS[0], difficulty: 'ocean' });
    for (let race = 0; race < CUP_TRACKS.length; race++) {
      r.message(a.conn, JSON.stringify({ t: 'start' }));
      const start = a.last('start')!;
      expect(start.settings.trackId).toBe(CUP_TRACKS[race]);
      if (race > 0) {
        // The grid: fewest points in front, the leader last.
        const standings = a.last('results')!.cup!.standings;
        const pts = start.roster.map((e) => standings.find((s) => s.name === e.name)!.points);
        expect([...pts].sort((x, y) => x - y)).toEqual(pts);
      }
      // Nobody steers: the AI drives the idle player's boat too.
      for (let i = 0; i < 40000 && r.racing; i++) {
        advance(TICK_MS);
        r.tick();
      }
      const res = a.last('results')!;
      expect(res.cup!.done).toBe(race + 1);
      expect(res.cup!.standings.reduce((n, e) => n + e.points, 0)).toBe((race + 1) * (10 + 8 + 6));
    }
    // After the last race: the final standings went out, and the room starts a new championship.
    expect(a.last('results')!.cup!.done).toBe(CUP_TRACKS.length);
    expect(a.last('lobby')!.cup!.done).toBe(0);
    expect(r.settings.trackId).toBe(CUP_TRACKS[0]);
    // Turning it off forgets the points.
    r.message(a.conn, JSON.stringify({ t: 'settings', settings: { trackId: 'bayouBends', difficulty: 'river' } }));
    expect(r.cup).toBeNull();
    expect(a.last('lobby')!.cup).toBeUndefined();
    expect(r.settings.trackId).toBe('bayouBends');
  });

  it('taunts go to everyone, not too often, and only known ones', () => {
    const { r, advance } = room();
    const [a, b] = ['a', 'b'].map(client);
    r.message(a.conn, JSON.stringify({ t: 'join', name: 'A', boatId: 'tugboat' }));
    r.message(b.conn, JSON.stringify({ t: 'join', name: 'B', boatId: 'tugboat' }));
    r.message(a.conn, JSON.stringify({ t: 'taunt', id: 'slow' }));
    expect(b.last('taunt')).toEqual({ t: 'taunt', from: 'a', id: 'slow' });
    expect(a.last('taunt')).toEqual({ t: 'taunt', from: 'a', id: 'slow' });
    r.message(a.conn, JSON.stringify({ t: 'taunt', id: 'bye' }));
    expect(b.last('taunt')!.id).toBe('slow'); // too soon
    advance(1500);
    r.message(a.conn, JSON.stringify({ t: 'taunt', id: 'whatever' }));
    expect(b.last('taunt')!.id).toBe('slow');
    r.message(a.conn, JSON.stringify({ t: 'taunt', id: 'bye' }));
    expect(b.last('taunt')!.id).toBe('bye');
  });
});

describe('a championship set up by the host', () => {
  it('the host picks the races, their order, laps and the Reims stretch; the server checks them and races them', { timeout: 120000 }, () => {
    const { r, advance } = room();
    const a = client('a');
    r.message(a.conn, JSON.stringify({ t: 'join', name: 'A', boatId: 'tugboat' }));
    const plan = [
      { trackId: 'bayouBends', laps: 1 },
      { trackId: 'reimsCanal', section: { start: 30000, finish: 45000 } },
      { trackId: 'nowhere', laps: 2 }, // not a track: dropped
      { trackId: 'lockAndLoad', laps: 99 }, // too many laps: 9
    ];
    r.message(a.conn, JSON.stringify({ t: 'settings', settings: { trackId: 'lockAndLoad', difficulty: 'river', size: 2, cup: true, plan } }));
    expect(r.cup!.plan).toEqual([
      { trackId: 'bayouBends', laps: 1 },
      { trackId: 'reimsCanal', section: { start: 30000, finish: 45000 } },
      { trackId: 'lockAndLoad', laps: 9 },
    ]);
    expect(r.settings).toMatchObject({ trackId: 'bayouBends', laps: 1, cup: true });
    // The first race: one lap of Bayou Bends.
    r.message(a.conn, JSON.stringify({ t: 'start' }));
    expect(r.sim!.track.def.laps).toBe(1);
    expect(a.last('start')!.settings).toMatchObject({ trackId: 'bayouBends', laps: 1 });
    for (let i = 0; i < 40000 && r.racing; i++) {
      advance(TICK_MS);
      r.tick();
    }
    // The next one is the stretch of the Reims canal; the races can't be changed any more.
    expect(r.settings).toMatchObject({ trackId: 'reimsCanal', section: { start: 30000, finish: 45000 } });
    r.message(a.conn, JSON.stringify({ t: 'settings', settings: { ...r.settings, plan: [{ trackId: 'lockAndLoad', laps: 2 }] } }));
    expect(r.cup!.plan).toHaveLength(3);
    expect(r.cup!.done).toBe(1);
    r.message(a.conn, JSON.stringify({ t: 'start' }));
    expect(r.sim!.track.startDist).toBe(30000);
  });
});
