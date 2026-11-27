export type ItemId =
  | 'volunteer' | 'volunteerSquad'
  | 'jigsaw'
  | 'whitePowder' | 'bigBag'
  | 'drill'
  | 'glue' | 'siliconeGun'
  | 'fakeCrate'
  | 'beer'
  | 'mushroom';

export interface ItemInfo {
  id: ItemId;
  uses: number;
  /** Texture key of the HUD icon (drawn in view/itemIcons.ts). */
  icon: string;
  /** Applied the moment the crate is opened: never stored in a slot. */
  instant?: boolean;
}

export const ITEM_INFO: Record<ItemId, ItemInfo> = {
  volunteer: { id: 'volunteer', uses: 1, icon: 'icon_volunteer' },
  volunteerSquad: { id: 'volunteerSquad', uses: 3, icon: 'icon_volunteer' },
  jigsaw: { id: 'jigsaw', uses: 1, icon: 'icon_jigsaw' },
  whitePowder: { id: 'whitePowder', uses: 1, icon: 'icon_powder' },
  bigBag: { id: 'bigBag', uses: 3, icon: 'icon_powder' },
  drill: { id: 'drill', uses: 1, icon: 'icon_drill' },
  glue: { id: 'glue', uses: 1, icon: 'icon_glue' },
  siliconeGun: { id: 'siliconeGun', uses: 2, icon: 'icon_silicone' },
  fakeCrate: { id: 'fakeCrate', uses: 1, icon: 'icon_fakeCrate' },
  beer: { id: 'beer', uses: 1, icon: 'icon_beer', instant: true },
  mushroom: { id: 'mushroom', uses: 1, icon: 'icon_mushroom' },
};

/** Number of items a racer can hold at once. */
export const SLOT_COUNT = 2;

/**
 * Draw weights per position (index 0 = 1st place). Leaders get defensive and weak items,
 * the back of the field gets the items that catch up. See docs/items.md.
 * Rules: the mushroom is rarer than every other item; only the back gets squads and big bags.
 */
export const ITEM_ODDS: Record<ItemId, [number, number, number, number]> = {
  volunteer: [4, 20, 24, 20],
  volunteerSquad: [0, 0, 3, 10],
  jigsaw: [10, 16, 16, 12],
  whitePowder: [4, 12, 18, 20],
  bigBag: [0, 0, 5, 14],
  drill: [18, 20, 16, 10],
  glue: [24, 10, 6, 4],
  siliconeGun: [6, 12, 14, 12],
  fakeCrate: [26, 12, 6, 4],
  beer: [14, 12, 10, 8],
  mushroom: [2, 2, 2, 2],
};

/** How much an item helps whoever holds it (0-10). Used to check the odds really favour the back. */
export const ITEM_POWER: Record<ItemId, number> = {
  volunteer: 7, volunteerSquad: 10, jigsaw: 6, whitePowder: 6, bigBag: 9, drill: 6,
  glue: 5, siliconeGun: 7, fakeCrate: 4, beer: 4, mushroom: 0,
};

export const TUNING = {
  crateRespawn: 4,
  crateRadius: 26,
  rouletteTime: 1,
  maxVolunteersInFlight: 2,

  hitInvulnerable: 1.5,
  respawnInvulnerable: 3,
  repairDelay: 3,
  repairRate: 2,
  sinkTime: 2,
  bankHitDamage: 5,
  spinOutBase: 1.2,

  volunteer: { speedMult: 1.4, life: 6, damage: 30, lockRange: 250, turnRate: 4.5, straightTime: 0.35 },
  jigsaw: { duration: 4, damage: 25, halfAngle: (25 * Math.PI) / 180, reachMult: 1.2, speedMult: 1.05 },
  powder: { duration: 2.5, topSpeedMult: 1.5, accelMult: 2, massMult: 2 },
  drill: { speedMult: 1.6, range: 1400, damage: 35, stuckTime: 1 },
  glue: { radius: 60, life: 15, maxBoats: 3, ownerImmunity: 1, speedMult: 0.4, turnMult: 0.6, stickyMult: 0.7, stickyTime: 1 },
  silicone: { speedMult: 1.3, range: 900, ownerImmunity: 0.4 },
  fakeCrate: { damage: 25, life: 40, ownerImmunity: 1, radius: 26 },
  beer: { healFraction: 0.5 },
  mushroom: { duration: 14 },
};

/** Fastest possible boat top speed; projectile speeds are relative to this. */
export const FASTEST_TOP_SPEED = 440;
