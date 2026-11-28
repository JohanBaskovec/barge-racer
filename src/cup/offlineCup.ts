import { BOATS } from '../data/boats';
import type { Difficulty } from '../data/difficulty';
import { Rng } from '../physics/math';
import { AI_NAMES } from '../race/RaceSimulation';
import { type CupRace, type CupState, defaultPlan, newCup } from './championship';

/** A boat in a single-player championship: the same three AI boats race every round. */
export interface CupBoat {
  key: string;
  name: string;
  boatId: string;
  human: boolean;
}

export interface OfflineCup {
  state: CupState;
  boats: CupBoat[];
  difficulty: Difficulty;
}

/** The single-player championship being raced, if any (kept in memory: a reload ends it). */
export let activeCup: OfflineCup | null = null;

/** Start a championship of these races: the player's boat and three AI boats with different boats and names. */
export function startOfflineCup(playerBoat: string, difficulty: Difficulty, plan: CupRace[] = defaultPlan(), seed = Date.now()): OfflineCup {
  const rng = new Rng(seed & 0x7fffffff || 1);
  const pool = BOATS.map((b) => b.id).filter((id) => id !== playerBoat);
  const names = [...AI_NAMES];
  const boats: CupBoat[] = [{ key: 'you', name: 'You', boatId: playerBoat, human: true }];
  for (let i = 1; i <= 3; i++) {
    const [boatId] = pool.splice(rng.int(0, pool.length - 1), 1);
    const [name] = names.splice(rng.int(0, names.length - 1), 1);
    boats.push({ key: `ai${i}`, name, boatId, human: false });
  }
  // On the grid of the first race (nobody has points yet) the player starts third, as in a single race.
  boats.splice(2, 0, boats.shift()!);
  activeCup = { state: newCup(plan), boats, difficulty };
  return activeCup;
}

export function endOfflineCup(): void {
  activeCup = null;
}
