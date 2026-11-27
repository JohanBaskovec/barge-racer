import type { BoatDef, BoatStats } from '../data/boats';
import type { ItemId } from '../data/items';
import type { Effect } from '../effects/effects';

export interface FireCommand {
  /** Which item slot to use (0 = first, 1 = second). */
  slot: 0 | 1;
  dir: 'forward' | 'backward';
}

export interface ControlIntent {
  /** Radians; null keeps the current heading. */
  desiredHeading: number | null;
  /** 0..1 forwards, negative for reverse. */
  throttle: number;
  fire: FireCommand | null;
}

export const NO_INTENT: ControlIntent = { desiredHeading: null, throttle: 0, fire: null };

/** An item in a slot, with its remaining uses. */
export type Slot = { id: ItemId; uses: number } | null;

export interface Racer {
  id: number;
  name: string;
  /** The racer this screen follows ("You"). */
  isPlayer: boolean;
  /** Driven by a person (locally or over the network), not the AI. */
  human: boolean;
  boat: BoatDef;
  /** The boat's current stats: `baseStats` scaled by `size` (smaller hull, lighter). */
  stats: BoatStats;
  baseStats: BoatStats;
  /** 1 normally; smaller while shrunk by a mushroom (eases there and back). */
  size: number;
  /** Who last sprayed this boat with a Kärcher, for the crash that follows (server and offline only). */
  soakedBy: number | null;
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

  /** Two item slots; the first is fired with right click, the second with middle click. */
  slots: [Slot, Slot];
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
  /** Last throttle asked for (0..1, negative = reverse). For the view: engine sound. */
  throttle: number;
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

/** A trap that looks exactly like a real item crate but hurts whoever drives into it. */
export interface FakeCrate {
  id: number;
  owner: number;
  x: number;
  y: number;
  age: number;
  dead: boolean;
}

/** A ball of glue shot by the silicone gun. It makes a puddle where it lands. */
export interface GlueBlob {
  id: number;
  owner: number;
  x: number;
  y: number;
  heading: number;
  travelled: number;
  age: number;
  near: number;
  dead: boolean;
}

/** Food fired by the ultimate raclette: kind 0 is the potato, 1 a slice of ham. Flies straight, hits the first boat. */
export interface Shot {
  id: number;
  owner: number;
  kind: 0 | 1;
  x: number;
  y: number;
  heading: number;
  travelled: number;
  age: number;
  near: number;
  dead: boolean;
}

/** Something that lies on the water for a while: kind 0 is melted cheese, 1 is toxic smoke. */
export interface Cloud {
  id: number;
  owner: number;
  kind: 0 | 1;
  x: number;
  y: number;
  age: number;
  dead: boolean;
}

export interface Crate {
  id: number;
  /** Where it is now: a magic mushroom pulls crates away from home. */
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  respawn: number;
}

export type RaceEvent =
  | { type: 'countdown'; value: 3 | 2 | 1 | 0 }
  | { type: 'itemPickup'; racer: number; item: ItemId }
  | { type: 'itemUsed'; racer: number; item: ItemId }
  | { type: 'heal'; racer: number; amount: number }
  | { type: 'boost'; racer: number }
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
