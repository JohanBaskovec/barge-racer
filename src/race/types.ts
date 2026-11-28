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
/** A held item and its uses left; `triple`: the better version, with three uses. */
/** What hurt a boat: an item, the bank, or a hazard (the police, an angler's line). */
export type HitSource = ItemId | 'bank' | 'police' | 'angler';

export type Slot = { id: ItemId; uses: number; triple?: boolean } | null;

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
  /** Seconds spent in a slipstream so far; the boost starts after TUNING.draft.charge (server and offline only). */
  draftT: number;
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
  /** The item spinning in the roulette comes as its triple version. */
  rouletteTriple: boolean;
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
  /** Top speed multiplier for boats far behind the leader (TUNING.catchUp), set by the simulation each step. */
  catchUp: number;
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

/** The electric drill's bit: `mounted` > 0, s left on its owner's bow (or stern, `back`); then it flies. */
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
  mounted: number;
  back: boolean;
  /** Boats already hurt while it was on the bow. */
  hit: number[];
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

/**
 * Something fired straight that hits the first boat: kind 0 the raclette's potato, 1 a slice of its
 * ham, 2 a nail. `wait` > 0: not fired yet (the nail gun's second and third nails), it leaves the
 * owner's bow when that runs out.
 */
export interface Shot {
  id: number;
  owner: number;
  kind: 0 | 1 | 2;
  wait: number;
  x: number;
  y: number;
  heading: number;
  travelled: number;
  age: number;
  near: number;
  dead: boolean;
}

/**
 * Dicke Titten: a giant pair dropped in front of a boat. `heading` is the canal's direction there;
 * the pair lies across it, or along it (`turned`) where the canal is too narrow to leave room.
 */
export interface Boobs {
  id: number;
  owner: number;
  /** The boat it was dropped in front of. */
  target: number;
  x: number;
  y: number;
  heading: number;
  turned: boolean;
  age: number;
  /** Boats already hurt by it (it stays solid for the others). */
  hit: number[];
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

/**
 * A crate put on the water ahead of a boat that is behind: tossed by a barge (kind 0, it flies
 * for a moment) or pushed in from the towpath by someone (kind 1, it slides in). Then it floats
 * until taken.
 */
export interface Drop {
  id: number;
  kind: 0 | 1;
  /** Where it lands, and where it was thrown from. */
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  age: number;
  /** The boat it was thrown to (anyone but the leader may take it). */
  target: number;
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
  | { type: 'hit'; racer: number; by: number | null; source: HitSource; damage: number }
  | { type: 'shieldPop'; racer: number }
  /** The police after a leader: warned for speeding, chased, pulled over (ticket), gone. */
  | { type: 'cops'; racer: number; phase: 'warn' | 'chase' | 'ticket' | 'leave' }
  | { type: 'hooked'; racer: number }
  /** A police rocket exploded there (on a boat, the bank or a barge). */
  | { type: 'boom'; x: number; y: number }
  /** Ran into birds (kind 0), a rowing boat (1) or swimmers (2). */
  | { type: 'splat'; racer: number; kind: 0 | 1 | 2; x: number; y: number }
  | { type: 'sunk'; racer: number }
  | { type: 'respawn'; racer: number }
  | { type: 'lap'; racer: number; lap: number; time: number }
  | { type: 'finish'; racer: number; position: number; time: number }
  | { type: 'bump'; a: number; b: number; strength: number }
  | { type: 'bank'; racer: number; strength: number }
  | { type: 'crate'; id: number; taken: boolean }
  /** A barge tossed a crate ahead of `racer`. */
  | { type: 'drop'; racer: number; id: number }
  | { type: 'raceOver' };

export interface Controller {
  update(r: Racer, sim: import('./RaceSimulation').RaceSimulation, dt: number): ControlIntent;
}
