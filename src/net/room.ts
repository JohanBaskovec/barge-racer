import { type CupState, cupGrid, cupOver, cupTrack, newCup, scoreRace } from '../cup/championship';
import { BOATS } from '../data/boats';
import { DIFFICULTIES, type Difficulty } from '../data/difficulty';
import { TAUNT_COOLDOWN, isTaunt } from '../data/taunts';
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
  /** When they last taunted (ms), to keep taunts from flooding everyone. */
  lastTaunt: number;
}

const AI_NAMES = ['Captain Bob', 'Molly Moor', 'Dredge', 'Admiral Fizz', 'Bilge', 'Skipper Sue', 'Barnacle Ben', 'Lady Lock', 'Rusty Rudder', 'Marge'];
/** Boats in a new room: its host and three AI boats, like a single-player race. */
const DEFAULT_SIZE = 4;

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
 * (the authoritative copy). The host (first to join) picks the track and the room size, and starts.
 * The room size is how many boats race (at most MAX_PLAYERS): the seats people don't take are AI
 * boats. Someone joining takes the first AI boat's seat (the room is full once every seat is a
 * person); someone leaving the lobby gives theirs back to a new AI boat. Making the room smaller
 * removes AI boats from the end of the list, never people. Pure TypeScript: the Cloudflare Durable Object only feeds it connections,
 * messages and a timer (see server/worker.ts).
 *
 * Someone who loses the connection during a race keeps their seat (the AI drives meanwhile) and
 * gets it back by joining again with their key. Someone who joins during a race watches it.
 */
export class RoomCore {
  private players = new Map<string, Player>();
  private order: string[] = [];
  private byConn = new Map<string, string>();
  settings: RoomSettings = { trackId: TRACK_DEFS[0].id, difficulty: 'river', size: DEFAULT_SIZE };
  /** The AI boats in the seats nobody has taken. */
  bots: LobbyBot[] = [];
  private botCount = 0;
  /** The championship's standings, while the room races one (settings.cup). */
  cup: CupState | null = null;
  /** Who is in each seat of the current race: a player id, or an AI boat's id. */
  private seatKeys: string[] = [];
  sim: RaceSimulation | null = null;
  private startMsg: Extract<ServerMsg, { t: 'start' }> | null = null;
  private stepsDone = 0;
  private startedAt = 0;
  private emptySince = 0;
  private events: RaceEvent[] = [];
  private rng: Rng;

  constructor(readonly code: string, private now: () => number = () => Date.now(), seed = Date.now()) {
    this.rng = new Rng(seed);
    this.fillSeats();
  }

  /** How many boats race: people, and AI boats in the other seats. */
  get size(): number {
    return this.settings.size ?? DEFAULT_SIZE;
  }

  /** Change the room size; never below the number of people in the room. False if refused. */
  private resize(size: number): boolean {
    const n = Math.min(MAX_PLAYERS, Math.round(size));
    if (!Number.isFinite(n) || n < Math.max(1, this.order.length)) return false;
    this.settings.size = n;
    this.fillSeats();
    return true;
  }

  /** AI boats in every seat nobody has taken: added at the end, removed from the end. */
  private fillSeats(): void {
    while (this.order.length + this.bots.length < this.size) this.addBot();
    while (this.order.length + this.bots.length > this.size && this.bots.length) this.bots.pop();
  }

  /** An AI boat, with a name and a boat nobody has taken yet (when there is one). */
  private addBot(): void {
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
    const msg: ServerMsg = { t: 'lobby', players, bots: this.bots.map((b) => ({ ...b })), settings: this.settings, racing: this.racing };
    if (this.cup) msg.cup = this.cup;
    return msg;
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
          this.settings = { trackId: def.id, difficulty: msg.settings.difficulty as Difficulty, size: this.size };
          if (hasSections(def)) this.settings.section = clampSection(def, msg.settings.section);
          // A size that would leave people without a seat is refused (the rest still applies).
          if (msg.settings.size !== undefined) this.resize(Number(msg.settings.size));
          // A championship picks the tracks itself; turning it off forgets the points.
          if (msg.settings.cup) {
            this.cup ??= newCup();
            this.followCup();
          } else this.cup = null;
          this.broadcast(this.lobbyState());
        }
        break;
      case 'addBot':
        // One more seat, for an AI boat.
        if (!this.racing && p.id === this.hostId && this.resize(this.size + 1)) this.broadcast(this.lobbyState());
        break;
      case 'removeBot':
        // That AI boat and its seat go.
        if (!this.racing && p.id === this.hostId && this.bots.some((b) => b.id === msg.id)) {
          this.bots = this.bots.filter((b) => b.id !== msg.id);
          this.settings.size = this.order.length + this.bots.length;
          this.broadcast(this.lobbyState());
        }
        break;
      case 'start':
        // The host starts once everyone else is ready (alone, the host races the AI).
        if (!this.racing && p.id === this.hostId && this.order.every((id) => id === this.hostId || this.players.get(id)!.ready)) this.startRace();
        break;
      case 'taunt': {
        const now = this.now();
        if (isTaunt(msg.id) && now - p.lastTaunt >= TAUNT_COOLDOWN * 1000) {
          p.lastTaunt = now;
          this.broadcast({ t: 'taunt', from: p.id, id: msg.id });
        }
        break;
      }
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
    // The newcomer takes the first AI boat's seat; with no AI boat left, every seat is a person's.
    if (!this.bots.length) return this.send(conn, { t: 'error', reason: 'full' });
    this.bots.shift();
    const player: Player = {
      id: conn.id, conn, key: randomKey(), name: cleanName(msg.name),
      boatId: BOATS.some((b) => b.id === msg.boatId) ? msg.boatId : BOATS[0].id,
      ready: false, racer: -1, input: new RemoteController(), watching: this.racing, idle: false, lastTaunt: -1e9,
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
      if (!this.sim) this.fillSeats(); // an AI boat takes the seat
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
    this.settings = { trackId: TRACK_DEFS[0].id, difficulty: 'river', size: DEFAULT_SIZE };
    this.cup = null;
    this.bots = [];
    this.fillSeats();
  }

  /** In a championship, the room races the cup's next track. */
  private followCup(): void {
    if (!this.cup) return;
    this.settings = { trackId: cupTrack(this.cup), difficulty: this.settings.difficulty, size: this.size, cup: true };
  }

  private startRace(): void {
    let roster: (StartEntry & { input?: RemoteController; key: string })[] = this.order.map((id) => {
      const h = this.players.get(id)!;
      h.input = new RemoteController();
      h.idle = false;
      return { name: h.name, boatId: h.boatId, human: true, playerId: h.id, input: h.input, key: h.id };
    });
    // AI boats in the other seats.
    for (const b of this.bots.slice(0, MAX_PLAYERS - roster.length)) roster.push({ name: b.name, boatId: b.boatId, human: false, playerId: null, key: b.id });
    // A championship race: the fewest points at the front of the grid, the leader at the back.
    if (this.cup) roster = cupGrid(this.cup, roster, (e) => e.key);
    roster.forEach((e, i) => {
      if (e.playerId) this.players.get(e.playerId)!.racer = i;
    });
    this.seatKeys = roster.map((e) => e.key);
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
    this.startMsg = { t: 'start', seed, settings: this.settings, roster: roster.map(({ input: _, key: __, ...e }) => e) };
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
    // A championship: count the race, then on to the next track (or a new championship after the last).
    let cup: CupState | undefined;
    if (this.cup) {
      cup = this.cup = scoreRace(this.cup, sim.results().map((r) => ({ key: this.seatKeys[r.racer.id], name: r.racer.name, boatId: r.racer.boat.id, human: r.racer.human })));
      if (cupOver(this.cup)) this.cup = newCup();
      this.followCup();
    }
    this.sim = null;
    this.startMsg = null;
    this.fillSeats(); // AI boats take the seats of those who left
    for (const id of this.order) {
      const p = this.players.get(id)!;
      p.ready = false;
      p.racer = -1;
      p.watching = false;
      p.idle = false;
    }
    this.broadcast(cup ? { t: 'results', rows, cup } : { t: 'results', rows });
    this.broadcast(this.lobbyState());
  }
}
