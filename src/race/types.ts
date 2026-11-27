import type { BoatDef, BoatStats } from '../data/boats';
import type { ItemId } from '../data/items';
import type { Effect } from '../effects/effects';

export interface ControlIntent {
  /** Radians; null keeps the current heading. */
  desiredHeading: number | null;
  /** 0..1 forwards, negative for reverse. */
  throttle: number;
  fire: 'none' | 'forward' | 'backward';
}

export const NO_INTENT: ControlIntent = { desiredHeading: null, throttle: 0, fire: 'none' };

export interface Racer {
  id: number;
  name: string;
  isPlayer: boolean;
  boat: BoatDef;
  stats: BoatStats;
  /** Tint colour used by the view to tell racers apart. */
  color: number;

  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
  /** Visual spin angle while spinning out (view only). */
  spin: number;

  hull: number;
  effects: Effect[];
  inGlue: boolean;
  /** Seconds since the last hit; hull repairs after a delay. */
  sinceHit: number;
  sinkTimer: number;

  item: ItemId | null;
  itemUses: number;
  rouletteT: number;
  rouletteItem: ItemId | null;
  recentItems: ItemId[];
  jigsawHit: Set<number>;

  // Race progress
  progress: number;
  nearestIndex: number;
  lapsDone: number;
  nextCheckpoint: number;
  position: number;
  finished: boolean;
  finishTime: number;
  lapTimes: number[];
  lapStart: number;
  /** Pace multiplier set by the AI (difficulty + rubber-banding). */
  pace: number;
  /** After finishing, an autopilot drives the boat. */
  autopilot: boolean;
  firstFullThrottleT: number | null;
  bankHitCooldown: number;
  stuckTimer: number;
}

export interface Volunteer {
  id: number;
  owner: number;
  targetId: number | null;
  x: number;
  y: number;
  heading: number;
  age: number;
  locked: boolean;
  /** Last nearest centre-line sample, so searches stay local and cheap. */
  near: number;
  /** Set when a hit or timeout ended it, for the view to play an animation. */
  dead: boolean;
}

export interface Drill {
  id: number;
  owner: number;
  x: number;
  y: number;
  heading: number;
  travelled: number;
  stuckT: number;
  near: number;
  age: number;
  dead: boolean;
}

export interface GluePuddle {
  id: number;
  owner: number;
  x: number;
  y: number;
  age: number;
  boatsStuck: Set<number>;
  dead: boolean;
}

export interface Crate {
  id: number;
  x: number;
  y: number;
  respawn: number;
}

export type RaceEvent =
  | { type: 'countdown'; value: 3 | 2 | 1 | 0 }
  | { type: 'itemPickup'; racer: number; item: ItemId }
  | { type: 'itemUsed'; racer: number; item: ItemId }
  | { type: 'hit'; racer: number; by: number | null; source: ItemId | 'bank'; damage: number }
  | { type: 'sunk'; racer: number }
  | { type: 'respawn'; racer: number }
  | { type: 'lap'; racer: number; lap: number; time: number }
  | { type: 'finish'; racer: number; position: number; time: number }
  | { type: 'bump'; a: number; b: number; strength: number }
  | { type: 'bank'; racer: number; strength: number }
  | { type: 'crate'; id: number; taken: boolean }
  | { type: 'raceOver' };

export interface Controller {
  update(r: Racer, sim: import('./RaceSimulation').RaceSimulation, dt: number): ControlIntent;
}
