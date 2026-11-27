import type { Difficulty } from './data/difficulty';
import type { ItemId } from './data/items';

export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');

/** URL debug flags, see docs/architecture.md#debug-flags. */
export const DEBUG = {
  enabled: q.get('debug') === '1',
  track: q.get('track'),
  boat: q.get('boat'),
  item: q.get('item') as ItemId | null,
  seed: q.get('seed') ? Number(q.get('seed')) : null,
  laps: q.get('laps') ? Number(q.get('laps')) : null,
  noAI: q.get('ai') === '0',
  difficulty: (q.get('difficulty') as Difficulty | null) ?? null,
};

export const FONT = '"Trebuchet MS", "Arial Rounded MT Bold", Verdana, sans-serif';
