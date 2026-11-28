import type { Difficulty } from './data/difficulty';
import type { Section } from './data/tracks';
import type { CupRace } from './cup/championship';
import type { GameMode } from './race/battle';

export interface Selection {
  boatId: string;
  trackId: string;
  difficulty: Difficulty;
  /** The stretch picked for each track that has one (the Reims canal). */
  sections?: Record<string, Section>;
  /** The single-player championship's races, as last set up. */
  cupPlan?: CupRace[];
  /** The last battle set up in single player. */
  battle?: { mode: Exclude<GameMode, 'race'>; arena: string; boats: number; team: number };
}

const KEY = 'barge-racer-selection';

const defaults: Selection = { boatId: 'cabourg', trackId: 'lockAndLoad', difficulty: 'river' };

/** The player's last menu choices, remembered between races (and reloads, where possible). */
export const session: Selection = { ...defaults };

try {
  const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
  if (saved && typeof saved === 'object') Object.assign(session, { ...defaults, ...saved });
} catch {
  /* storage unavailable: keep defaults */
}

export function saveSession(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    /* ignore */
  }
}
