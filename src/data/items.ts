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
  | 'karcher'
  | 'titten'
  | 'dildo'
  | 'nailGun'
  | 'siphon'
  | 'tugboat'
  | 'beerDispenser'
  | 'vacuum';

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
  titten: { id: 'titten', uses: 1, icon: 'icon_titten' },
  dildo: { id: 'dildo', uses: 1, icon: 'icon_dildo' },
  nailGun: { id: 'nailGun', uses: 1, icon: 'icon_nailGun' },
  siphon: { id: 'siphon', uses: 1, icon: 'icon_siphon' },
  tugboat: { id: 'tugboat', uses: 1, icon: 'icon_tugboat' },
  beerDispenser: { id: 'beerDispenser', uses: 1, icon: 'icon_beerDispenser' },
  vacuum: { id: 'vacuum', uses: 1, icon: 'icon_vacuum' },
};

/**
 * Items whose better version is a separate item with three uses already (the squad, the big bag):
 * every other item can come as a triple instead (see TRIPLE_ODDS).
 */
export const HAS_OWN_TRIPLE: ItemId[] = ['volunteer', 'whitePowder', 'volunteerSquad', 'bigBag'];
/** The strongest items, which hit every opponent at once: as a triple only for the last place, and rarely. */
export const GLOBAL_ITEMS: ItemId[] = ['mushroom', 'blackout', 'siphon', 'titten', 'raclette'];
/**
 * Chance per position (1st..4th) that an item comes as its better version, with three uses.
 * `global` is for GLOBAL_ITEMS. Never for the leader.
 */
export const TRIPLE_ODDS = { normal: [0, 0.08, 0.18, 0.3], global: [0, 0, 0, 0.12] };

/** Number of items a racer can hold at once. */
export const SLOT_COUNT = 2;

/**
 * Draw weights per position (index 0 = 1st place). Leaders get defensive and weak items,
 * the back of the field gets the items that catch up. See docs/items.md.
 * Rules: the mushroom is rarer than every other item; only the back gets squads, big bags and the
 * two "ultimate" items (electrical failure, raclette); the leader gets the traps.
 */
export const ITEM_ODDS: Record<ItemId, [number, number, number, number]> = {
  volunteer: [4, 16, 18, 14],
  volunteerSquad: [0, 0, 3, 8],
  jigsaw: [8, 12, 11, 8],
  whitePowder: [4, 10, 13, 13],
  bigBag: [0, 0, 4, 10],
  drill: [14, 15, 12, 8],
  glue: [11, 9, 5, 2],
  siliconeGun: [5, 10, 10, 8],
  fakeCrate: [11, 9, 4, 2],
  beer: [18, 10, 8, 6],
  mushroom: [0, 1, 1, 1],
  blackout: [0, 0, 3, 6],
  raclette: [0, 0, 3, 6],
  toilet: [9, 8, 4, 2],
  karcher: [3, 8, 9, 7],
  titten: [0, 2, 4, 7],
  dildo: [16, 9, 4, 2],
  nailGun: [6, 12, 11, 8],
  siphon: [0, 0, 3, 6],
  tugboat: [0, 2, 6, 9],
  beerDispenser: [3, 6, 7, 7],
  vacuum: [0, 5, 8, 8],
};

/** How much an item helps whoever holds it (0-10). Used to check the odds really favour the back. */
export const ITEM_POWER: Record<ItemId, number> = {
  volunteer: 7, volunteerSquad: 10, jigsaw: 6, whitePowder: 6, bigBag: 9, drill: 6,
  glue: 6, siliconeGun: 8, fakeCrate: 4, beer: 5, mushroom: 9,
  blackout: 10, raclette: 10, toilet: 4, karcher: 6,
  titten: 9, dildo: 3, nailGun: 6, siphon: 10, tugboat: 9,
  beerDispenser: 7, vacuum: 8,
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
  /** Top speed lost with no hull left (in proportion to the damage): fragile boats pay for their hits. */
  damageSlow: 0.2,
  /** Boats behind the leader: up to `max` more top speed, from `from` px behind, all of it at `full` px. */
  catchUp: { from: 200, full: 1800, max: 0.12 },
  sinkTime: 2,
  bankHitDamage: 5,
  spinOutBase: 1.2,

  volunteer: { speedMult: 1.4, life: 6, damage: 35, lockRange: 250, turnRate: 4.5, straightTime: 0.35 },
  /** A saw sticking out of each side: boats alongside, within `reach` px of the hull, are cut. */
  jigsaw: { duration: 4, damage: 30, reach: 62, speedMult: 1.05 },
  /** Giant dildo on the bow: ram boats to hurt them (a little). Also smashes things flying at it. */
  dildo: { duration: 5, damage: 16, halfAngle: (24 * Math.PI) / 180, reachMult: 1.15, speedMult: 1.05 },
  /** Nail gun: three nails in quick succession, straight. Each one hurts (no blinking in between), none spins. */
  nail: { speedMult: 2.1, damage: 13, radius: 6, range: 1100, every: 0.11, slow: 0.8 },
  /**
   * Dicke Titten: a giant pair drops onto the water `ahead` px in front of every opponent (on its
   * current line), `warn` s to see them coming before they are solid. Solid for `life` s; running
   * into them hurts, a lot. Each one is a pair of breasts of `radius`, side by side across the canal.
   */
  titten: { damage: 40, life: 9, radius: 32, ahead: 420, warn: 0.55, ownerImmunity: 99 },
  /** Gas siphoning: every opponent's tank is empty for `duration` s: no thrust, and they stop. */
  siphon: { duration: 3, drag: 4 },
  /** Beer dispenser: the hull is repaired in full, and a head of foam takes the next hit (not bank bumps or smoke), within `shieldTime` s. */
  beerDispenser: { shieldTime: 45 },
  /**
   * Vacuum cleaner: for `duration` s, every boat ahead within `range` px (and within `halfAngle` of
   * straight ahead) is pulled towards the owner, harder when closer and the lighter it is.
   */
  vacuum: { duration: 3, range: 1100, halfAngle: (70 * Math.PI) / 180, pull: 1400, maxPullSpeed: 300 },
  /**
   * Hazards for the leader alone. Police: a leader more than `gap` px ahead of the second boat for
   * `after` s is warned for speeding; `warn` s later a police boat turns up behind it and chases it
   * for `chase` s, shooting every `fireEvery` s from within `range` px (bullets at `bulletSpeed`,
   * with some error). A bullet that hits pulls it over: the police boat parks alongside and the
   * leader is stopped for `ticket` s. Then the police leave, not to come back for `cooldown` s.
   */
  cops: {
    gap: 1400, after: 2, warn: 2.2, chase: 15, fireEvery: 1.3, range: 760, bulletSpeed: 640, bulletRange: 950, spread: 0.15,
    ticket: 3, ticketDrag: 5, cooldown: 30, startAfter: 15, endMargin: 1500, speed: 1.3, length: 96, width: 34, offset: 230,
  },
  /**
   * Anglers: now and then (about every `every` s, never closer than `minGap` s apart) one sits on a
   * bank `ahead` px in front of the leader and casts a line across `reach` of the canal. Only the
   * leader can be caught: it is dragged towards that bank for up to `hookTime` s, and hitting the
   * bank while hooked is a crash (`damage`, a spin-out).
   */
  anglers: { every: 20, minGap: 12, ahead: 720, reach: 0.55, life: 8, hookTime: 1.4, pull: 1700, damage: 20, startAfter: 8 },
  /**
   * Birds, rowers and swimmers on the water, ahead of the boats: one group about every `every` s,
   * ahead of a boat picked by position (`weights`, 1st to 4th: the better placed, the more often).
   * Running into them makes a mess and slows the boat (`slowMult`, extra `drag`, for `slowTime` s),
   * no damage. Sizes: `radius` of each kind (birds, rowers, swimmers); speeds along the canal.
   */
  critters: {
    every: 5, max: 8, weights: [5, 3, 2, 1], ahead: [650, 950], life: 28, startAfter: 4,
    radius: [38, 30, 26], speed: [12, 70, 18], slowMult: 0.7, drag: 0.8, slowTime: 1.3, jolt: 0.8,
  },
  /** Tugboat: tows its owner along the canal for `duration` s: steered for you, faster, and through glue. */
  tugboat: { duration: 4, topSpeed: 1.45, accel: 3, mass: 2 },
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
    stickyMult: 0.55, stickyAccelMult: 0.7, stickyTime: 2.6,
  },
  silicone: { speedMult: 1.3, range: 900, ownerImmunity: 0.4 },
  fakeCrate: { damage: 30, life: 40, ownerImmunity: 1, radius: 26 },
  beer: { healFraction: 0.5 },
  /**
   * Magic mushrooms. For `duration` seconds: whoever was ahead of the user when it was eaten is
   * shrunk (smaller, lighter and a lot slower), whoever was behind is hasty (faster), and
   * crates within `magnetRadius` fly towards the user at `magnetSpeed`. Crates the magnet lets go
   * of float home at `homeSpeed`. The user's screen goes psychedelic too.
   */
  mushroom: {
    duration: 10, shrink: 0.55, shrunkSpeed: 0.65, hastySpeed: 1.3, hastyAccel: 1.6,
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
