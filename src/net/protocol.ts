import type { Difficulty } from '../data/difficulty';
import type { RaceEvent } from '../race/types';
import type { SimState } from './snapshot';

/**
 * Messages between the game and the multiplayer server (JSON over a WebSocket).
 * See docs/multiplayer.md.
 */

export const MAX_PLAYERS = 4;
/** The server sends a snapshot every TICK_MS (and simulates 60 steps a second in between). */
export const TICK_MS = 50;
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
}

export interface LobbyPlayer {
  id: string;
  name: string;
  boatId: string;
  ready: boolean;
  host: boolean;
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
  | { t: 'join'; name: string; boatId: string }
  | { t: 'boat'; boatId: string }
  | { t: 'ready'; ready: boolean }
  | { t: 'settings'; settings: RoomSettings }
  | { t: 'start' }
  | { t: 'in'; i: InputTuple[] }
  | { t: 'ping'; c: number };

export type ServerMsg =
  | { t: 'welcome'; you: string; code: string }
  | { t: 'lobby'; players: LobbyPlayer[]; settings: RoomSettings; racing: boolean }
  | { t: 'start'; seed: number; settings: RoomSettings; roster: StartEntry[] }
  | { t: 'snap'; s: number; ack: number; state: SimState; ev: RaceEvent[] }
  | { t: 'results'; rows: ResultRowNet[] }
  | { t: 'error'; reason: 'full' | 'racing' | 'bad' }
  | { t: 'pong'; c: number };
