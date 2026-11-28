import { ITEM_ODDS, TUNING, type ItemId } from '../data/items';
import type { Rng } from '../physics/math';

export interface DrawContext {
  /** 0 = 1st place. */
  position: number;
  /** True if more than a lap behind the leader: uses the last-place column. */
  farBehind?: boolean;
  volunteersInFlight: number;
  recentItems: ItemId[];
}

const ITEMS = Object.keys(ITEM_ODDS) as ItemId[];

/** Weighted draw of an item using the position table plus the rules from docs/items.md. */
export function drawItem(rng: Rng, ctx: DrawContext): ItemId {
  const col = ctx.farBehind ? 3 : Math.max(0, Math.min(3, ctx.position));
  for (let attempt = 0; attempt < 20; attempt++) {
    let total = 0;
    for (const id of ITEMS) total += ITEM_ODDS[id][col];
    let roll = rng.next() * total;
    let pick: ItemId = ITEMS[0];
    for (const id of ITEMS) {
      roll -= ITEM_ODDS[id][col];
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
