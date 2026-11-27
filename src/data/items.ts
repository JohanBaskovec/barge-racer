export type ItemId =
  | 'volunteer' | 'volunteerSquad'
  | 'jigsaw'
  | 'whitePowder' | 'bigBag'
  | 'drill'
  | 'glue' | 'siliconeGun'
  | 'fakeCrate'
  | 'beer'
  | 'mushroom'
  | 'blackout'
  | 'raclette'
  | 'toilet'
  | 'karcher';

export interface ItemInfo {
  id: ItemId;
  uses: number;
  /** Texture key of the HUD icon (drawn in view/itemIcons.ts). */
  icon: string;
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
  beer: { id: 'beer', uses: 1, icon: 'icon_beer' },
  mushroom: { id: 'mushroom', uses: 1, icon: 'icon_mushroom' },
  blackout: { id: 'blackout', uses: 1, icon: 'icon_blackout' },
  raclette: { id: 'raclette', uses: 1, icon: 'icon_raclette' },
  toilet: { id: 'toilet', uses: 1, icon: 'icon_toilet' },
  karcher: { id: 'karcher', uses: 1, icon: 'icon_karcher' },
};

/** Number of items a racer can hold at once. */
export const SLOT_COUNT = 2;

/**
 * Draw weights per position (index 0 = 1st place). Leaders get defensive and weak items,
 * the back of the field gets the items that catch up. See docs/items.md.
 * Rules: the mushroom is rarer than every other item; only the back gets squads, big bags and the
 * two "ultimate" items (electrical failure, raclette); the leader gets the traps.
 */
export const ITEM_ODDS: Record<ItemId, [number, number, number, number]> = {
  volunteer: [4, 18, 22, 18],
  volunteerSquad: [0, 0, 3, 9],
  jigsaw: [9, 14, 14, 10],
  whitePowder: [4, 10, 15, 16],
  bigBag: [0, 0, 4, 12],
  drill: [16, 18, 14, 9],
  glue: [22, 9, 5, 3],
  siliconeGun: [5, 10, 12, 10],
  fakeCrate: [22, 10, 5, 3],
  beer: [14, 12, 9, 7],
  mushroom: [2, 2, 2, 2],
  blackout: [0, 0, 3, 7],
  raclette: [0, 0, 3, 8],
  toilet: [14, 8, 5, 3],
  karcher: [3, 9, 11, 9],
};

/** How much an item helps whoever holds it (0-10). Used to check the odds really favour the back. */
export const ITEM_POWER: Record<ItemId, number> = {
  volunteer: 7, volunteerSquad: 10, jigsaw: 6, whitePowder: 6, bigBag: 9, drill: 6,
  glue: 6, siliconeGun: 8, fakeCrate: 4, beer: 5, mushroom: 6,
  blackout: 10, raclette: 10, toilet: 4, karcher: 6,
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

  volunteer: { speedMult: 1.4, life: 6, damage: 35, lockRange: 250, turnRate: 4.5, straightTime: 0.35 },
  jigsaw: { duration: 4, damage: 30, halfAngle: (25 * Math.PI) / 180, reachMult: 1.2, speedMult: 1.05 },
  powder: { duration: 2.5, topSpeedMult: 1.5, accelMult: 2, massMult: 2 },
  drill: { speedMult: 1.6, range: 1400, damage: 42, stuckTime: 1 },
  /**
   * Glue is meant to cost more than a hit does: a hit is 1.2 s spun out (and the boat loses most
   * of its speed), so a puddle nearly stops a boat, makes it crawl for a while after, and wears
   * off slowly. tests/items.test.ts checks that crossing one costs more time than being hit.
   */
  glue: {
    radius: 60, life: 15, maxBoats: 3, ownerImmunity: 1,
    speedMult: 0.25, turnMult: 0.4, accelMult: 0.6, drag: 2.5,
    stickyMult: 0.6, stickyAccelMult: 0.7, stickyTime: 2,
  },
  silicone: { speedMult: 1.3, range: 900, ownerImmunity: 0.4 },
  fakeCrate: { damage: 30, life: 40, ownerImmunity: 1, radius: 26 },
  beer: { healFraction: 0.5 },
  /**
   * Magic mushrooms. For `duration` seconds: whoever was ahead of the user when it was eaten is
   * shrunk (smaller, lighter and a little slower), whoever was behind is hasty (faster), and
   * crates within `magnetRadius` fly towards the user at `magnetSpeed`. Crates the magnet lets go
   * of float home at `homeSpeed`. The user's screen goes psychedelic too.
   */
  mushroom: {
    duration: 10, shrink: 0.55, shrunkSpeed: 0.85, hastySpeed: 1.3, hastyAccel: 1.6,
    magnetRadius: 900, magnetSpeed: 650, homeSpeed: 260,
  },
  /** Electrical failure: every opponent's controls are stuck (no steering, throttle frozen, no items). */
  blackout: { duration: 3.2 },
  /**
   * Ultimate raclette: a potato and two slices of ham fly ahead in a fan, melted cheese is left
   * behind. Whoever is hit by a shot, or drives through the cheese, gets a screen full of cheese.
   */
  raclette: {
    potato: { speedMult: 1.25, damage: 45, radius: 12 },
    ham: { speedMult: 1.45, damage: 26, radius: 10 },
    spread: 0.17, range: 1300,
    cheeseRadius: 75, cheeseLife: 12, cheeseOwnerImmunity: 1,
    cheeseTime: 4.5, splashTime: 3.5,
  },
  /** Clogged toilet: a cloud of toxic smoke left behind. Damage per second to every boat inside, the owner too. */
  toilet: { radius: 95, life: 12, dps: 38, ownerImmunity: 1, feedbackEvery: 0.8 },
  /**
   * Kärcher: for `duration` seconds, jets of water on both sides push every boat alongside away,
   * sideways. A boat that is still wet (`soakTime`) when it reaches the bank crashes into it.
   */
  karcher: { duration: 3.5, reach: 300, push: 5200, maxSideSpeed: 420, crashDamage: 24, soakTime: 1.4, soakedTurnMult: 0.6 },

  /**
   * Traffic: working barges going both ways, each keeping to its own side. They are immovable
   * (`mass` only matters for their wake). Barges also help the boats behind: now and then one
   * tosses a crate ahead of a nearby boat that isn't leading (never for the leader, who can't
   * pick those crates up either).
   */
  traffic: {
    length: 230, width: 32, speed: [100, 85] as [number, number], every: 4000, mass: 7, lane: 0.72,
    bumpDamage: 8, fadeEnds: 400,
    dropRange: 520, dropCooldown: 9, dropEvery: 7, dropLife: 20, dropAhead: 280, leaderClear: 700, tossTime: 0.6,
  },
  /**
   * Wakes: a moving boat leaves a V behind it; a boat on one of its arms is pushed outward,
   * harder the heavier and faster the maker and the lighter the receiver. Straight behind (in the
   * V's middle) there is no push: that is where the slipstream is. Hovercraft float above it.
   */
  wake: { length: 440, angle: 0.34, band: 34, push: 170, maxRatio: 3, minSpeed: 60, maxSide: 260, rock: 60 },
  /** Slipstream: close behind a boat, in line and both going fast, a boat speeds up after `charge` seconds. */
  draft: { reach: 280, width: 30, charge: 0.5, hold: 0.6, topSpeed: 1.1, accel: 1.35, minSpeed: 0.45 },
};

/** Fastest possible boat top speed; projectile speeds are relative to this. */
export const FASTEST_TOP_SPEED = 440;
