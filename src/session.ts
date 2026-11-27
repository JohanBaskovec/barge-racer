import type { Difficulty } from './data/difficulty';
import type { Section } from './data/tracks';

export interface Selection {
  boatId: string;
  trackId: string;
  difficulty: Difficulty;
  /** The stretch picked for each track that has one (the Reims canal). */
  sections?: Record<string, Section>;
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
