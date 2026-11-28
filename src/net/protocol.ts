import type { CupRace, CupState } from '../cup/championship';
import type { Difficulty } from '../data/difficulty';
import type { TauntId } from '../data/taunts';
import type { Section } from '../data/tracks';
import type { RaceEvent } from '../race/types';
import type { SimState } from './snapshot';

/**
 * Messages between the game and the multiplayer server (JSON over a WebSocket).
 * See docs/multiplayer.md.
 */

/** Boats in an online race at most, people and AI together; also the most people a room takes. */
export const MAX_PLAYERS = 8;
/** The server sends a snapshot every TICK_MS (and simulates 60 steps a second in between). */
export const TICK_MS = 50;
/** A connected player's boat whose controls stop arriving for this many steps (1 s) is driven by the AI until they resume. */
export const IDLE_STEPS = 60;
/** A race with nobody connected is kept this long (ms) for someone to reconnect, then dropped. */
export const EMPTY_RACE_MS = 60_000;
/** Room codes: 4 letters, without I and O (easy to read out loud). */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export const isRoomCode = (s: string): boolean => new RegExp(`^[${CODE_ALPHABET}]{4}$`).test(s);

export function randomRoomCode(random: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return s;
}

/** One step of a player's controls: [step, heading (null = keep), throttle, fire slot (-1 none, 0, 1), fire backwards (0/1)]. */
export type InputTuple = [number, number | null, number, number, number];

export interface RoomSettings {
  trackId: string;
  difficulty: Difficulty;
  /** How many boats race (1 to MAX_PLAYERS, never fewer than the people in the room): the seats people don't take are AI boats. */
  size?: number;
  /** For a track whose stretch can be picked: the stretch (otherwise absent). */
  section?: Section;
  /** A championship: the room races the cup's tracks in turn and keeps the points (the track follows the cup). */
  cup?: boolean;
  /** The championship's races, as the host set them (with `cup`). */
  plan?: CupRace[];
  /** Laps of this race, when the championship sets them. */
  laps?: number;
}

export interface LobbyPlayer {
  id: string;
  name: string;
  boatId: string;
  ready: boolean;
  host: boolean;
  /** Lost the connection during the race: the AI drives their boat until they come back. */
  away?: boolean;
  /** Joined during a race: watching it, racing in the next one. */
  watching?: boolean;
}

/** An AI boat the host has added to the room. */
export interface LobbyBot {
  id: string;
  name: string;
  boatId: string;
}

export interface StartEntry {
  name: string;
  boatId: string;
  human: boolean;
  /** The player driving this boat, or null for an AI boat. */
  playerId: string | null;
}

export interface ResultRowNet {
  name: string;
  boatId: string;
  time: number;
  finished: boolean;
  playerId: string | null;
}

export type ClientMsg =
  /** `key`: from an earlier welcome, to take your seat back after losing the connection. */
  | { t: 'join'; name: string; boatId: string; key?: string }
  | { t: 'boat'; boatId: string }
  | { t: 'ready'; ready: boolean }
  | { t: 'settings'; settings: RoomSettings }
  /** Host: one more seat (an AI boat in it), or take an AI boat out along with its seat. */
  | { t: 'addBot' }
  | { t: 'removeBot'; id: string }
  | { t: 'start' }
  | { t: 'in'; i: InputTuple[] }
  | { t: 'taunt'; id: TauntId }
  | { t: 'ping'; c: number };

export type ServerMsg =
  /** `key` lets this player rejoin (see join). */
  | { t: 'welcome'; you: string; code: string; key: string }
  /** `cup`: the championship's standings while the room is racing one. */
  | { t: 'lobby'; players: LobbyPlayer[]; bots: LobbyBot[]; settings: RoomSettings; racing: boolean; cup?: CupState }
  | { t: 'start'; seed: number; settings: RoomSettings; roster: StartEntry[] }
  | { t: 'snap'; s: number; ack: number; state: SimState; ev: RaceEvent[] }
  /** `cup`: in a championship, the standings with this race counted. */
  | { t: 'results'; rows: ResultRowNet[]; cup?: CupState }
  /** Someone taunted (`from`: their player id). */
  | { t: 'taunt'; from: string; id: TauntId }
  | { t: 'error'; reason: 'full' | 'racing' | 'bad' }
  | { t: 'pong'; c: number };
