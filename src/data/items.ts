export type ItemId = 'volunteer' | 'volunteerSquad' | 'jigsaw' | 'whitePowder' | 'bigBag' | 'drill' | 'glue';

export interface ItemInfo {
  id: ItemId;
  name: string;
  uses: number;
  icon: string; // emoji shown in the HUD
}

export const ITEM_INFO: Record<ItemId, ItemInfo> = {
  volunteer: { id: 'volunteer', name: 'Volunteers', uses: 1, icon: '🙋' },
  volunteerSquad: { id: 'volunteerSquad', name: 'Volunteer Squad', uses: 3, icon: '🙋' },
  jigsaw: { id: 'jigsaw', name: 'Jigsaw', uses: 1, icon: '🪚' },
  whitePowder: { id: 'whitePowder', name: 'White Powder', uses: 1, icon: '🧂' },
  bigBag: { id: 'bigBag', name: 'Big Bag', uses: 3, icon: '🧂' },
  drill: { id: 'drill', name: 'Electric Drill', uses: 1, icon: '🔩' },
  glue: { id: 'glue', name: 'Glue', uses: 1, icon: '🧴' },
};

/** Draw weights per position (index 0 = 1st place). See docs/items.md. */
export const ITEM_ODDS: Record<ItemId, [number, number, number, number]> = {
  volunteer: [10, 30, 30, 20],
  volunteerSquad: [0, 0, 0, 10],
  jigsaw: [15, 20, 15, 10],
  whitePowder: [5, 15, 20, 20],
  bigBag: [0, 0, 5, 15],
  drill: [30, 25, 20, 15],
  glue: [40, 10, 10, 10],
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
};

/** Fastest possible boat top speed; projectile speeds are relative to this. */
export const FASTEST_TOP_SPEED = 440;
