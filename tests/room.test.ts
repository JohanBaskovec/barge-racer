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
  it('lets four people in, makes the first one host, and refuses a fifth', () => {
    const { r } = room();
    const cs = ['a', 'b', 'c', 'd', 'e'].map(client);
    for (const c of cs) r.message(c.conn, JSON.stringify({ t: 'join', name: c.conn.id, boatId: 'tugboat' }));
    expect(cs[0].last('welcome')).toEqual({ t: 'welcome', you: 'a', code: 'ABCD' });
    const lobby = cs[0].last('lobby')!;
    expect(lobby.players.map((p) => p.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(lobby.players[0].host).toBe(true);
    expect(cs[4].last('error')).toEqual({ t: 'error', reason: 'full' });
  });

  it('only the host changes the track and starts, once everyone is ready', () => {
    const { r } = room();
    const [a, b] = ['a', 'b'].map(client);
    r.message(a.conn, JSON.stringify({ t: 'join', name: 'A', boatId: 'cabourg' }));
    r.message(b.conn, JSON.stringify({ t: 'join', name: 'B', boatId: 'tugboat' }));
    r.message(b.conn, JSON.stringify({ t: 'settings', settings: { trackId: 'bayouBends', difficulty: 'ocean' } }));
    expect(r.settings.trackId).not.toBe('bayouBends');
    r.message(a.conn, JSON.stringify({ t: 'settings', settings: { trackId: 'bayouBends', difficulty: 'ocean' } }));
    expect(r.settings).toEqual({ trackId: 'bayouBends', difficulty: 'ocean' });
    r.message(a.conn, JSON.stringify({ t: 'start' }));
    expect(r.racing).toBe(false); // B isn't ready
    r.message(b.conn, JSON.stringify({ t: 'ready', ready: true }));
    r.message(b.conn, JSON.stringify({ t: 'start' }));
    expect(r.racing).toBe(false); // B isn't the host
    r.message(a.conn, JSON.stringify({ t: 'start' }));
    expect(r.racing).toBe(true);
    const start = b.last('start')!;
    expect(start.roster).toHaveLength(4);
    expect(start.roster.slice(0, 2).map((e) => e.playerId)).toEqual(['a', 'b']);
    expect(start.roster.slice(2).every((e) => !e.human && e.playerId === null)).toBe(true);
  });

  it('ignores garbage and refuses to join a race in progress', () => {
    const { r } = room();
    const a = client('a');
    r.message(a.conn, 'not json');
    r.message(a.conn, JSON.stringify({ t: 'start' }));
    r.message(a.conn, JSON.stringify({ t: 'join', name: 'A', boatId: 'no-such-boat' }));
    expect(a.last('lobby')!.players[0].boatId).toBe('cabourg');
    r.message(a.conn, JSON.stringify({ t: 'start' }));
    const late = client('late');
    r.message(late.conn, JSON.stringify({ t: 'join', name: 'L', boatId: 'tugboat' }));
    expect(late.last('error')).toEqual({ t: 'error', reason: 'racing' });
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
