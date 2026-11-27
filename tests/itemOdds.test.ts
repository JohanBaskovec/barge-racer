import { describe, expect, it } from 'vitest';
import { ITEM_ODDS, type ItemId } from '../src/data/items';
import { drawItem } from '../src/items/itemOdds';
import { Rng } from '../src/physics/math';

const draws = (position: number, n = 20000, extra = {}): Record<string, number> => {
  const rng = new Rng(42);
  const counts: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    const id = drawItem(rng, { position, volunteersInFlight: 0, recentItems: [], ...extra });
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
};

describe('item odds', () => {
  it('matches the table for each position', () => {
    for (let pos = 0; pos < 4; pos++) {
      const counts = draws(pos);
      const total = (Object.values(ITEM_ODDS) as number[][]).reduce((s, w) => s + w[pos], 0);
      for (const id of Object.keys(ITEM_ODDS) as ItemId[]) {
        const expected = ITEM_ODDS[id][pos] / total;
        expect((counts[id] ?? 0) / 20000).toBeCloseTo(expected, 1);
      }
    }
  });

  it('only gives squad and big bag to the back', () => {
    expect(draws(0).volunteerSquad).toBeUndefined();
    expect(draws(0).bigBag).toBeUndefined();
    expect(draws(3).volunteerSquad).toBeGreaterThan(0);
  });

  it('never exceeds 2 volunteers in flight', () => {
    const c = draws(2, 2000, { volunteersInFlight: 2 });
    expect(c.volunteer).toBeUndefined();
    expect(c.volunteerSquad).toBeUndefined();
  });

  it('never gives the same item three times in a row', () => {
    const c = draws(0, 2000, { recentItems: ['glue', 'glue'] });
    expect(c.glue).toBeUndefined();
  });
});
