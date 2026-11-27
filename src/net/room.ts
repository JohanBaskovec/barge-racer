import { BOATS } from '../data/boats';
import { DIFFICULTIES, type Difficulty } from '../data/difficulty';
import { TRACK_DEFS, loadTrack } from '../data/tracks';
import { Rng } from '../physics/math';
import { RaceSimulation, STEP } from '../race/RaceSimulation';
import type { RaceEvent } from '../race/types';
import {
  type ClientMsg, type LobbyPlayer, MAX_PLAYERS, type ResultRowNet, type RoomSettings, type ServerMsg, type StartEntry,
} from './protocol';
import { RemoteController } from './remote';
import { encodeState } from './snapshot';

/** A connected screen, as the hosting environment sees it (a WebSocket on Cloudflare, a fake in tests). */
export interface Conn {
  id: string;
  send(data: string): void;
}

interface Player {
  conn: Conn;
  name: string;
  boatId: string;
  ready: boolean;
  racer: number;
  input: RemoteController;
}

const AI_NAMES = ['Captain Bob', 'Molly Moor', 'Dredge', 'Admiral Fizz', 'Bilge', 'Skipper Sue'];

/** Clean up a player name: printable, trimmed, at most 16 characters. */
export function cleanName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 16) : '';
  return s || 'Captain';
}

/**
 * One multiplayer room: a lobby where up to four people pick boats, then a race simulated here
 * (the authoritative copy), with AI boats in the empty seats. The host (first to join) picks the
 * track and starts. Pure TypeScript: the Cloudflare Durable Object only feeds it connections,
 * messages and a timer (see server/worker.ts).
 */
export class RoomCore {
  private players = new Map<string, Player>();
  private order: string[] = [];
  settings: RoomSettings = { trackId: TRACK_DEFS[0].id, difficulty: 'river' };
  sim: RaceSimulation | null = null;
  private stepsDone = 0;
  private startedAt = 0;
  private events: RaceEvent[] = [];
  private rng: Rng;

  constructor(readonly code: string, private now: () => number = () => Date.now(), seed = Date.now()) {
    this.rng = new Rng(seed);
  }

  get racing(): boolean {
    return this.sim !== null;
  }

  get playerCount(): number {
    return this.order.length;
  }

  private get hostId(): string | undefined {
    return this.order[0];
  }

  private send(p: Player | Conn, msg: ServerMsg): void {
    const conn = 'conn' in p ? p.conn : p;
    try {
      conn.send(JSON.stringify(msg));
    } catch {
      /* the socket is closing; disconnect() will clean up */
    }
  }

  private broadcast(msg: ServerMsg): void {
    const data = JSON.stringify(msg);
    for (const id of this.order) {
      try {
        this.players.get(id)!.conn.send(data);
      } catch {
        /* ignore */
      }
    }
  }

  private lobbyState(): ServerMsg {
    const players: LobbyPlayer[] = this.order.map((id) => {
      const p = this.players.get(id)!;
      return { id, name: p.name, boatId: p.boatId, ready: p.ready, host: id === this.hostId };
    });
    return { t: 'lobby', players, settings: this.settings, racing: this.racing };
  }

  /** A message from a screen. Anything malformed is ignored. */
  message(conn: Conn, raw: string): void {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    const p = this.players.get(conn.id);

    if (msg.t === 'ping') {
      this.send(conn, { t: 'pong', c: msg.c });
      return;
    }
    if (msg.t === 'join') {
      if (p) return;
      if (this.racing) return this.send(conn, { t: 'error', reason: 'racing' });
      if (this.order.length >= MAX_PLAYERS) return this.send(conn, { t: 'error', reason: 'full' });
      const player: Player = {
        conn, name: cleanName(msg.name), boatId: BOATS.some((b) => b.id === msg.boatId) ? msg.boatId : BOATS[0].id,
        ready: false, racer: -1, input: new RemoteController(),
      };
      this.players.set(conn.id, player);
      this.order.push(conn.id);
      this.send(conn, { t: 'welcome', you: conn.id, code: this.code });
      this.broadcast(this.lobbyState());
      return;
    }
    if (!p) return;

    switch (msg.t) {
      case 'boat':
        if (!this.racing && BOATS.some((b) => b.id === msg.boatId)) {
          p.boatId = msg.boatId;
          this.broadcast(this.lobbyState());
        }
        break;
      case 'ready':
        if (!this.racing) {
          p.ready = !!msg.ready;
          this.broadcast(this.lobbyState());
        }
        break;
      case 'settings':
        if (!this.racing && conn.id === this.hostId && msg.settings && TRACK_DEFS.some((t) => t.id === msg.settings.trackId) && msg.settings.difficulty in DIFFICULTIES) {
          this.settings = { trackId: msg.settings.trackId, difficulty: msg.settings.difficulty as Difficulty };
          this.broadcast(this.lobbyState());
        }
        break;
      case 'start':
        // The host starts once everyone else is ready (alone, the host races the AI).
        if (!this.racing && conn.id === this.hostId && this.order.every((id) => id === this.hostId || this.players.get(id)!.ready)) this.startRace();
        break;
      case 'in':
        if (this.racing && Array.isArray(msg.i)) p.input.push(msg.i.slice(0, 30));
        break;
    }
  }

  disconnect(conn: Conn): void {
    const p = this.players.get(conn.id);
    if (!p) return;
    this.players.delete(conn.id);
    this.order = this.order.filter((id) => id !== conn.id);
    // A boat whose driver left is taken over by the AI, so the race goes on.
    if (this.sim && p.racer >= 0) this.sim.setController(p.racer, 'ai');
    if (this.order.length === 0) this.sim = null;
    else this.broadcast(this.lobbyState());
  }

  private startRace(): void {
    const humans = this.order.map((id) => this.players.get(id)!);
    const taken = new Set(humans.map((h) => h.boatId));
    const pool = BOATS.map((b) => b.id).filter((id) => !taken.has(id));
    const names = [...AI_NAMES];
    const roster: (StartEntry & { input?: RemoteController })[] = humans.map((h, i) => {
      h.racer = i;
      h.input = new RemoteController();
      return { name: h.name, boatId: h.boatId, human: true, playerId: h.conn.id, input: h.input };
    });
    while (roster.length < MAX_PLAYERS) {
      const boatId = pool.splice(this.rng.int(0, pool.length - 1), 1)[0] ?? BOATS[1].id;
      const name = names.splice(this.rng.int(0, names.length - 1), 1)[0];
      roster.push({ name, boatId, human: false, playerId: null });
    }
    const seed = this.rng.int(1, 2 ** 30);
    this.sim = new RaceSimulation({
      track: loadTrack(this.settings.trackId),
      difficulty: this.settings.difficulty,
      seed,
      roster: roster.map((e) => ({ name: e.name, boatId: e.boatId, human: e.human, controller: e.input })),
    });
    this.stepsDone = 0;
    this.startedAt = this.now();
    this.events = [];
    this.broadcast({ t: 'start', seed, settings: this.settings, roster: roster.map(({ input: _, ...e }) => e) });
  }

  /**
   * Called every TICK_MS by the host environment: catch the simulation up with the clock (60 steps
   * a second), then send everyone a snapshot with the events since the last one.
   */
  tick(): void {
    const sim = this.sim;
    if (!sim) return;
    const due = Math.floor((this.now() - this.startedAt) / (STEP * 1000)) - this.stepsDone;
    for (let i = 0; i < Math.min(due, 8); i++) {
      sim.step(STEP);
      this.stepsDone++;
      this.events.push(...sim.takeEvents());
      if (sim.phase === 'over') break;
    }
    if (due > 8) this.stepsDone += due - 8; // a long stall: skip ahead rather than fast-forward

    // One snapshot for all; only the "ack" (last input used) differs per player.
    const body = JSON.stringify({ s: this.stepsDone, state: encodeState(sim), ev: this.events }).slice(1);
    this.events = [];
    for (const id of this.order) {
      const p = this.players.get(id)!;
      try {
        p.conn.send(`{"t":"snap","ack":${p.input.ack},${body}`);
      } catch {
        /* ignore */
      }
    }
    if (sim.phase === 'over') this.finishRace();
  }

  private finishRace(): void {
    const sim = this.sim!;
    const byRacer = new Map(this.order.map((id) => [this.players.get(id)!.racer, id]));
    const rows: ResultRowNet[] = sim.results().map((r) => ({
      name: r.racer.name, boatId: r.racer.boat.id, time: Math.round(r.time * 1000) / 1000, finished: r.finished, playerId: byRacer.get(r.racer.id) ?? null,
    }));
    this.sim = null;
    for (const id of this.order) {
      const p = this.players.get(id)!;
      p.ready = false;
      p.racer = -1;
    }
    this.broadcast({ t: 'results', rows });
    this.broadcast(this.lobbyState());
  }
}
