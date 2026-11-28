import { ITEM_ODDS, TUNING, type ItemId } from '../data/items';
import type { Rng } from '../physics/math';

/**
 * The column of the position tables (1st, 2nd, 3rd, last: four columns) for a place in a race of
 * `count` boats: with more than four, the places are spread over the four columns.
 */
export function oddsColumn(position: number, count = 4): number {
  if (count <= 4) return Math.max(0, Math.min(3, position));
  return Math.max(0, Math.min(3, Math.round((position * 3) / (count - 1))));
}

export interface DrawContext {
  /** 0 = 1st place. */
  position: number;
  /** Boats in the race (4 when absent). */
  count?: number;
  /** True if more than a lap behind the leader: uses the last-place column. */
  farBehind?: boolean;
  volunteersInFlight: number;
  recentItems: ItemId[];
  /** Items that can't come out (the tugboat in a battle: it only makes sense racing one way). */
  excluded?: readonly ItemId[];
  /** One set of weights for everyone instead of the position tables (battles). */
  table?: Readonly<Record<ItemId, number>>;
}

const ITEMS = Object.keys(ITEM_ODDS) as ItemId[];

/** Weighted draw of an item using the position table plus the rules from docs/items.md. */
export function drawItem(rng: Rng, ctx: DrawContext): ItemId {
  const col = ctx.farBehind ? 3 : oddsColumn(ctx.position, ctx.count);
  const weight = (id: ItemId): number => (ctx.excluded?.includes(id) ? 0 : ctx.table ? ctx.table[id] : ITEM_ODDS[id][col]);
  for (let attempt = 0; attempt < 20; attempt++) {
    let total = 0;
    for (const id of ITEMS) total += weight(id);
    let roll = rng.next() * total;
    let pick: ItemId = ITEMS[0];
    for (const id of ITEMS) {
      roll -= weight(id);
      if (roll < 0) {
        pick = id;
        break;
      }
    }
    if (pick === 'volunteer' && ctx.volunteersInFlight >= TUNING.maxVolunteersInFlight) continue;
    const n = ctx.recentItems.length;
    if (n >= 2 && ctx.recentItems[n - 1] === pick && ctx.recentItems[n - 2] === pick) continue;
    return pick;
  }
  return 'whitePowder';
}
