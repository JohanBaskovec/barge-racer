import { BOATS } from '../data/boats';
import { DIFFICULTIES, type Difficulty } from '../data/difficulty';
import { TRACK_DEFS, clampSection, getTrackDef, hasSections, loadTrack } from '../data/tracks';
import { Rng } from '../physics/math';
import { RaceSimulation, STEP } from '../race/RaceSimulation';
import type { RaceEvent } from '../race/types';
import {
  type ClientMsg, EMPTY_RACE_MS, IDLE_STEPS, type LobbyBot, type LobbyPlayer, MAX_PLAYERS, type ResultRowNet, type RoomSettings, type ServerMsg,
  type StartEntry,
} from './protocol';
import { RemoteController } from './remote';
import { encodeState } from './snapshot';

/** A connected screen, as the hosting environment sees it (a WebSocket on Cloudflare, a fake in tests). */
export interface Conn {
  id: string;
  send(data: string): void;
  /** Close the connection (when the same player has reconnected on a new one). */
  close?(): void;
}

interface Player {
  /** Stays the same when the player reconnects (it is the id of their first connection). */
  id: string;
  /** null: lost the connection during a race; their seat is kept until the race ends. */
  conn: Conn | null;
  /** Secret that lets this player take their seat back from a new connection. */
  key: string;
  name: string;
  boatId: string;
  ready: boolean;
  /** Their boat in the current race, or -1 (in the lobby, or watching). */
  racer: number;
  input: RemoteController;
  /** Joined during a race: watches it, races in the next one. */
  watching: boolean;
  /** Their controls stopped arriving: the AI is standing in for them. */
  idle: boolean;
}

const AI_NAMES = ['Captain Bob', 'Molly Moor', 'Dredge', 'Admiral Fizz', 'Bilge', 'Skipper Sue', 'Barnacle Ben', 'Lady Lock', 'Rusty Rudder', 'Marge'];
/** AI boats in a new room (with its host, the four boats of a single-player race). */
const DEFAULT_BOTS = 3;

/** Clean up a player name: printable, trimmed, at most 16 characters. */
export function cleanName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 16) : '';
  return s || 'Captain';
}

function randomKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * One multiplayer room: a lobby where up to eight people pick boats, then a race simulated here
 * (the authoritative copy). The host (first to join) picks the track, how many people may join
 * (the room size) and which AI boats race too (added and removed one by one; people and AI boats
 * together at most MAX_PLAYERS), and starts. Pure TypeScript: the Cloudflare Durable Object only feeds it connections,
 * messages and a timer (see server/worker.ts).
 *
 * Someone who loses the connection during a race keeps their seat (the AI drives meanwhile) and
 * gets it back by joining again with their key. Someone who joins during a race watches it.
 */
export class RoomCore {
  private players = new Map<string, Player>();
  private order: string[] = [];
  private byConn = new Map<string, string>();
  settings: RoomSettings = { trackId: TRACK_DEFS[0].id, difficulty: 'river', size: MAX_PLAYERS };
  /** The AI boats that race too. */
  bots: LobbyBot[] = [];
  private botCount = 0;
  sim: RaceSimulation | null = null;
  private startMsg: Extract<ServerMsg, { t: 'start' }> | null = null;
  private stepsDone = 0;
  private startedAt = 0;
  private emptySince = 0;
  private events: RaceEvent[] = [];
  private rng: Rng;

  constructor(readonly code: string, private now: () => number = () => Date.now(), seed = Date.now()) {
    this.rng = new Rng(seed);
    for (let i = 0; i < DEFAULT_BOTS; i++) this.addBot();
  }

  /** How many people may be in the room. */
  get size(): number {
    return this.settings.size ?? MAX_PLAYERS;
  }

  /** An AI boat, with a name and a boat nobody has taken yet (when there is one). */
  private addBot(): boolean {
    if (this.order.length + this.bots.length >= MAX_PLAYERS) return false;
    const usedNames = new Set(this.bots.map((b) => b.name));
    const names = AI_NAMES.filter((n) => !usedNames.has(n));
    const taken = new Set([...this.bots.map((b) => b.boatId), ...this.order.map((id) => this.players.get(id)!.boatId)]);
    const free = BOATS.map((b) => b.id).filter((id) => !taken.has(id));
    const boats = free.length ? free : BOATS.map((b) => b.id);
    this.bots.push({
      id: `ai${++this.botCount}`,
      name: names.length ? names[this.rng.int(0, names.length - 1)] : `AI ${this.botCount}`,
      boatId: boats[this.rng.int(0, boats.length - 1)],
    });
    return true;
  }

  get racing(): boolean {
    return this.sim !== null;
  }

  /** People in the room, including those whose seat is kept while they reconnect. */
  get playerCount(): number {
    return this.order.length;
  }

  /** Nobody at all: the room can be forgotten. */
  get empty(): boolean {
    return this.order.length === 0;
  }

  private get connected(): Player[] {
    return this.order.map((id) => this.players.get(id)!).filter((p) => p.conn);
  }

  private get hostId(): string | undefined {
    return this.order[0];
  }

  private send(conn: Conn, msg: ServerMsg): void {
    try {
      conn.send(JSON.stringify(msg));
    } catch {
      /* the socket is closing; disconnect() will clean up */
    }
  }

  private broadcast(msg: ServerMsg): void {
    const data = JSON.stringify(msg);
    for (const p of this.connected) {
      try {
        p.conn!.send(data);
      } catch {
        /* ignore */
      }
    }
  }

  private lobbyState(): ServerMsg {
    const players: LobbyPlayer[] = this.order.map((id) => {
      const p = this.players.get(id)!;
      const row: LobbyPlayer = { id, name: p.name, boatId: p.boatId, ready: p.ready, host: id === this.hostId };
      if (!p.conn) row.away = true;
      if (p.watching) row.watching = true;
      return row;
    });
    return { t: 'lobby', players, bots: this.bots.map((b) => ({ ...b })), settings: this.settings, racing: this.racing };
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

    if (msg.t === 'ping') {
      this.send(conn, { t: 'pong', c: msg.c });
      return;
    }
    const pid = this.byConn.get(conn.id);
    if (msg.t === 'join') {
      if (!pid) this.join(conn, msg);
      return;
    }
    const p = pid ? this.players.get(pid) : undefined;
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
        if (!this.racing && p.id === this.hostId && msg.settings && TRACK_DEFS.some((t) => t.id === msg.settings.trackId) && msg.settings.difficulty in DIFFICULTIES) {
          const def = getTrackDef(msg.settings.trackId);
          const size = Number(msg.settings.size);
          this.settings = {
            trackId: def.id,
            difficulty: msg.settings.difficulty as Difficulty,
            // People already in stay, even if the room is made smaller: nobody new gets in then.
            size: Number.isFinite(size) ? Math.max(2, Math.min(MAX_PLAYERS, Math.round(size))) : this.size,
          };
          if (hasSections(def)) this.settings.section = clampSection(def, msg.settings.section);
          this.broadcast(this.lobbyState());
        }
        break;
      case 'addBot':
        if (!this.racing && p.id === this.hostId && this.addBot()) this.broadcast(this.lobbyState());
        break;
      case 'removeBot':
        if (!this.racing && p.id === this.hostId && this.bots.some((b) => b.id === msg.id)) {
          this.bots = this.bots.filter((b) => b.id !== msg.id);
          this.broadcast(this.lobbyState());
        }
        break;
      case 'start':
        // The host starts once everyone else is ready (alone, the host races the AI).
        if (!this.racing && p.id === this.hostId && this.order.every((id) => id === this.hostId || this.players.get(id)!.ready)) this.startRace();
        break;
      case 'in':
        if (this.sim && p.racer >= 0 && Array.isArray(msg.i)) {
          p.input.push(msg.i.slice(0, 30));
          // Controls are arriving again: the player takes the helm back from the AI.
          if (p.idle && p.input.hasInput) {
            p.idle = false;
            this.sim.setController(p.racer, p.input);
          }
        }
        break;
    }
  }

  private join(conn: Conn, msg: Extract<ClientMsg, { t: 'join' }>): void {
    // Coming back after losing the connection: same player, same seat.
    const back = typeof msg.key === 'string' && msg.key ? [...this.players.values()].find((p) => p.key === msg.key) : undefined;
    if (back) {
      if (back.conn) {
        // The old connection hasn't been noticed as dead yet: this one replaces it.
        this.byConn.delete(back.conn.id);
        try {
          back.conn.close?.();
        } catch {
          /* ignore */
        }
      }
      back.conn = conn;
      this.byConn.set(conn.id, back.id);
      if (this.sim && back.racer >= 0) {
        back.input = new RemoteController();
        back.idle = false;
        this.sim.setController(back.racer, back.input);
      }
      this.welcome(back);
      return;
    }
    if (this.order.length >= this.size) return this.send(conn, { t: 'error', reason: 'full' });
    // People first: an AI boat makes way if the race would have too many boats.
    if (this.order.length + this.bots.length >= MAX_PLAYERS) this.bots.pop();
    const player: Player = {
      id: conn.id, conn, key: randomKey(), name: cleanName(msg.name),
      boatId: BOATS.some((b) => b.id === msg.boatId) ? msg.boatId : BOATS[0].id,
      ready: false, racer: -1, input: new RemoteController(), watching: this.racing, idle: false,
    };
    this.players.set(player.id, player);
    this.order.push(player.id);
    this.byConn.set(conn.id, player.id);
    this.welcome(player);
  }

  /** Tell a (re)joining player who they are and what's going on; during a race, how it started. */
  private welcome(p: Player): void {
    this.send(p.conn!, { t: 'welcome', you: p.id, code: this.code, key: p.key });
    this.broadcast(this.lobbyState());
    if (this.startMsg) this.send(p.conn!, this.startMsg);
  }

  disconnect(conn: Conn): void {
    const pid = this.byConn.get(conn.id);
    if (!pid) return; // unknown, or already replaced by a newer connection
    this.byConn.delete(conn.id);
    const p = this.players.get(pid)!;
    if (this.sim && p.racer >= 0) {
      // Mid-race: the AI drives their boat, and their seat waits for them until the race ends.
      p.conn = null;
      p.idle = false;
      this.sim.setController(p.racer, 'ai');
    } else {
      this.players.delete(pid);
      this.order = this.order.filter((id) => id !== pid);
    }
    if (this.connected.length === 0) {
      this.emptySince = this.now();
      if (!this.sim) this.reset();
      return;
    }
    this.broadcast(this.lobbyState());
  }

  private reset(): void {
    this.sim = null;
    this.startMsg = null;
    this.players.clear();
    this.byConn.clear();
    this.order = [];
    this.settings = { trackId: TRACK_DEFS[0].id, difficulty: 'river', size: MAX_PLAYERS };
    this.bots = [];
    for (let i = 0; i < DEFAULT_BOTS; i++) this.addBot();
  }

  private startRace(): void {
    const humans = this.order.map((id) => this.players.get(id)!);
    const roster: (StartEntry & { input?: RemoteController })[] = humans.map((h, i) => {
      h.racer = i;
      h.input = new RemoteController();
      h.idle = false;
      return { name: h.name, boatId: h.boatId, human: true, playerId: h.id, input: h.input };
    });
    // The AI boats the host chose (people first, at most MAX_PLAYERS boats).
    for (const b of this.bots.slice(0, MAX_PLAYERS - roster.length)) roster.push({ name: b.name, boatId: b.boatId, human: false, playerId: null });
    const seed = this.rng.int(1, 2 ** 30);
    this.sim = new RaceSimulation({
      track: loadTrack(this.settings.trackId, this.settings.section),
      difficulty: this.settings.difficulty,
      seed,
      roster: roster.map((e) => ({ name: e.name, boatId: e.boatId, human: e.human, controller: e.input })),
    });
    this.stepsDone = 0;
    this.startedAt = this.now();
    this.events = [];
    this.startMsg = { t: 'start', seed, settings: this.settings, roster: roster.map(({ input: _, ...e }) => e) };
    this.broadcast(this.startMsg);
  }

  /**
   * Called every TICK_MS by the host environment: catch the simulation up with the clock (60 steps
   * a second), then send everyone a snapshot with the events since the last one.
   */
  tick(): void {
    const sim = this.sim;
    if (!sim) return;
    if (this.connected.length === 0 && this.now() - this.emptySince > EMPTY_RACE_MS) {
      this.reset(); // nobody came back
      return;
    }
    const due = Math.floor((this.now() - this.startedAt) / (STEP * 1000)) - this.stepsDone;
    for (let i = 0; i < Math.min(due, 8); i++) {
      sim.step(STEP);
      this.stepsDone++;
      this.events.push(...sim.takeEvents());
      if (sim.phase === 'over') break;
    }
    if (due > 8) this.stepsDone += due - 8; // a long stall: skip ahead rather than fast-forward

    // A player whose controls stopped arriving (a stalled connection, the game in the background)
    // doesn't drift into the bank: the AI stands in until their controls come back.
    for (const p of this.connected) {
      if (p.racer >= 0 && !p.idle && p.input.starved >= IDLE_STEPS) {
        p.idle = true;
        sim.setController(p.racer, 'ai', true);
      }
    }

    // One snapshot for all; only the "ack" (last input used) differs per player.
    const body = JSON.stringify({ s: this.stepsDone, state: encodeState(sim), ev: this.events }).slice(1);
    this.events = [];
    for (const p of this.connected) {
      try {
        p.conn!.send(`{"t":"snap","ack":${p.racer >= 0 ? p.input.ack : -1},${body}`);
      } catch {
        /* ignore */
      }
    }
    if (sim.phase === 'over') this.finishRace();
  }

  private finishRace(): void {
    const sim = this.sim!;
    // Players who never came back are gone: their boats count as AI boats in the results.
    for (const id of [...this.order]) {
      if (!this.players.get(id)!.conn) {
        this.players.delete(id);
        this.order = this.order.filter((k) => k !== id);
      }
    }
    const byRacer = new Map(this.order.map((id) => [this.players.get(id)!.racer, id]));
    byRacer.delete(-1);
    const rows: ResultRowNet[] = sim.results().map((r) => ({
      name: r.racer.name, boatId: r.racer.boat.id, time: Math.round(r.time * 1000) / 1000, finished: r.finished, playerId: byRacer.get(r.racer.id) ?? null,
    }));
    this.sim = null;
    this.startMsg = null;
    for (const id of this.order) {
      const p = this.players.get(id)!;
      p.ready = false;
      p.racer = -1;
      p.watching = false;
      p.idle = false;
    }
    this.broadcast({ t: 'results', rows });
    this.broadcast(this.lobbyState());
  }
}
