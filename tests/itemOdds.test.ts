import { describe, expect, it } from 'vitest';
import { ITEM_INFO, ITEM_ODDS, ITEM_POWER, type ItemId } from '../src/data/items';
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

  it('beer is an ordinary item now (held, drunk when you like): drawn whatever the hull', () => {
    for (let pos = 0; pos < 4; pos++) expect(draws(pos, 5000).beer).toBeGreaterThan(0);
  });

  it('the electrical failure and the raclette only go to the back two positions', () => {
    for (const item of ['blackout', 'raclette'] as const) {
      expect(draws(0, 5000)[item]).toBeUndefined();
      expect(draws(1, 5000)[item]).toBeUndefined();
      expect(draws(2, 5000)[item]).toBeGreaterThan(0);
      expect(draws(3, 5000)[item]).toBeGreaterThan(draws(2, 5000)[item]);
    }
  });
});

describe('balance: the leader gets worse items than the boats behind', () => {
  const items = Object.keys(ITEM_ODDS) as ItemId[];
  const power = (col: number): number => {
    const total = items.reduce((s, id) => s + ITEM_ODDS[id][col], 0);
    return items.reduce((s, id) => s + (ITEM_ODDS[id][col] * ITEM_POWER[id]), 0) / total;
  };

  it('expected item power rises from 1st place to 4th', () => {
    const p = [0, 1, 2, 3].map(power);
    for (let i = 1; i < 4; i++) expect(p[i]).toBeGreaterThan(p[i - 1]);
    expect(p[3] / p[0]).toBeGreaterThan(1.25); // a clear gap, not a rounding error
  });

  it('1st place gets mostly defensive items and never the strongest boosts', () => {
    const total = items.reduce((s, id) => s + ITEM_ODDS[id][0], 0);
    const defensive = ITEM_ODDS.glue[0] + ITEM_ODDS.fakeCrate[0] + ITEM_ODDS.beer[0] + ITEM_ODDS.toilet[0];
    expect(defensive / total).toBeGreaterThan(0.45);
    expect(ITEM_ODDS.bigBag[0] + ITEM_ODDS.volunteerSquad[0] + ITEM_ODDS.blackout[0] + ITEM_ODDS.raclette[0]).toBe(0);
    expect(ITEM_ODDS.whitePowder[0]).toBeLessThan(ITEM_ODDS.whitePowder[3]);
    expect(ITEM_ODDS.volunteer[0]).toBeLessThan(ITEM_ODDS.volunteer[2]);
  });

  it('the mushroom is rarer than every other item, in every position', () => {
    for (let col = 0; col < 4; col++) {
      for (const id of items) {
        if (id === 'mushroom' || ITEM_ODDS[id][col] === 0) continue;
        expect(ITEM_ODDS.mushroom[col], `${id} in column ${col}`).toBeLessThan(ITEM_ODDS[id][col]);
      }
    }
  });

  it('every item has info, odds and a power rating, and the ultimate ones are the most powerful', () => {
    expect(Object.keys(ITEM_INFO).sort()).toEqual([...items].sort());
    expect(Object.keys(ITEM_POWER).sort()).toEqual([...items].sort());
    for (const id of items) {
      expect(ITEM_INFO[id].icon).toMatch(/^icon_/);
      expect(ITEM_POWER[id]).toBeGreaterThanOrEqual(0);
    }
    expect(Math.max(...items.map((id) => ITEM_POWER[id]))).toBe(10);
    expect(ITEM_POWER.blackout).toBe(10);
    expect(ITEM_POWER.raclette).toBe(10);
  });
});
