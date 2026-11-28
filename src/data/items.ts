export type ItemId =
  | 'volunteer'
  | 'jigsaw'
  | 'whitePowder'
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
  | 'vacuum'
  | 'sauna'
  | 'noise'
  | 'lazyVolunteers'
  | 'paint'
  | 'translation'
  | 'champagne';

export interface ItemInfo {
  id: ItemId;
  uses: number;
  /** Texture key of the HUD icon (drawn in view/itemIcons.ts). */
  icon: string;
}

export const ITEM_INFO: Record<ItemId, ItemInfo> = {
  volunteer: { id: 'volunteer', uses: 1, icon: 'icon_volunteer' },
  jigsaw: { id: 'jigsaw', uses: 1, icon: 'icon_jigsaw' },
  whitePowder: { id: 'whitePowder', uses: 1, icon: 'icon_powder' },
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
  sauna: { id: 'sauna', uses: 1, icon: 'icon_sauna' },
  noise: { id: 'noise', uses: 1, icon: 'icon_noise' },
  lazyVolunteers: { id: 'lazyVolunteers', uses: 1, icon: 'icon_lazyVolunteers' },
  paint: { id: 'paint', uses: 1, icon: 'icon_paint' },
  translation: { id: 'translation', uses: 1, icon: 'icon_translation' },
  champagne: { id: 'champagne', uses: 1, icon: 'icon_champagne' },
};

/** The strongest items, which hit every opponent at once: as a triple only for the last place, and rarely. */
export const GLOBAL_ITEMS: ItemId[] = ['mushroom', 'blackout', 'siphon', 'titten', 'raclette', 'sauna', 'noise'];
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
 * Rules: the mushroom is rarer than every other item; only the back gets the "ultimate" items
 * (electrical failure, raclette, gas siphoning); the leader gets weak items and a few traps. Any
 * item can also come as its better version, with three uses (TRIPLE_ODDS).
 */
export const ITEM_ODDS: Record<ItemId, [number, number, number, number]> = {
  volunteer: [4, 16, 21, 22],
  jigsaw: [8, 12, 11, 8],
  whitePowder: [4, 10, 17, 23],
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
  sauna: [0, 2, 4, 6],
  noise: [0, 0, 3, 6],
  lazyVolunteers: [10, 8, 4, 2],
  paint: [9, 9, 6, 3],
  // Completely useless, for the leader alone.
  translation: [7, 0, 0, 0],
  champagne: [8, 0, 0, 0],
};

/** How much an item helps whoever holds it (0-10). Used to check the odds really favour the back. */
export const ITEM_POWER: Record<ItemId, number> = {
  volunteer: 7, jigsaw: 6, whitePowder: 6, drill: 6,
  glue: 6, siliconeGun: 8, fakeCrate: 4, beer: 5, mushroom: 9,
  blackout: 10, raclette: 10, toilet: 4, karcher: 6,
  titten: 9, dildo: 3, nailGun: 6, siphon: 10, tugboat: 9,
  beerDispenser: 7, vacuum: 8,
  sauna: 8, noise: 10, lazyVolunteers: 4, paint: 5,
  translation: 0, champagne: 0,
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
  /**
   * Three saws: one sticking out of each side (boats alongside, within `reach` px of the hull, are
   * cut) and one on the bow (a cone of `halfAngle`, reaching `reachMult` x the boat's length).
   */
  jigsaw: { duration: 4, damage: 30, reach: 62, halfAngle: (25 * Math.PI) / 180, reachMult: 1.2, speedMult: 1.05 },
  /** Giant dildo on the bow: ram boats to hurt them (a little). Also smashes things flying at it. */
  dildo: { duration: 5, damage: 16, halfAngle: (24 * Math.PI) / 180, reachMult: 1.15, speedMult: 1.05 },
  /** Nail gun: three nails in quick succession, straight. Each one hurts (no blinking in between), none spins. */
  nail: { speedMult: 2.1, damage: 13, radius: 6, range: 1100, every: 0.11, slow: 0.8 },
  /**
   * Dicke Titten: a giant pair drops onto the water `ahead` px in front of every opponent (on its
   * current line), `warn` s to see them coming before they are solid. Solid for `life` s; running
   * into them hurts, a lot. Each one is a pair of breasts of `radius`, side by side across the canal.
   * There is always a way round: one pair per `row` px of canal, each leaving at least `clear` px
   * free on one side; where the canal is too narrow for that, the pair lies along it instead.
   */
  titten: { damage: 40, life: 9, radius: 32, ahead: 420, warn: 0.55, ownerImmunity: 99, row: 330, clear: 100 },
  /** Gas siphoning: every opponent's tank is empty for `duration` s: no thrust, and they stop. */
  siphon: { duration: 3, drag: 4 },
  /** Beer dispenser: the hull is repaired in full, and a head of foam takes the next hit (not bank bumps or smoke), within `shieldTime` s. */
  beerDispenser: { shieldTime: 45, drunkTime: 6 },
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
    /** A rocket that hits does this much damage too (and pulls the boat over if it is the one chased). */
    rocketDamage: 15,
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
    // kinds: birds, rowers, swimmers, and lazy volunteers on a couch (an item, never spawned by itself)
    radius: [38, 30, 26, 40], speed: [12, 70, 18, 5], slowMult: 0.7, drag: 0.8, slowTime: 1.3, jolt: 0.8,
  },
  /**
   * Sauna: every opponent is in thick steam for `duration` s and can't see where they are going,
   * except round the sauna's owner (`clear` px: the view leaves that hole in the steam).
   */
  sauna: { duration: 5, clear: 230 },
  /**
   * Noise complaint: a police boat for every opponent, warned `warn` s before it turns up, chasing
   * for `chase` s and shooting rockets like the speeding police. A hit: stopped and fined for noise.
   */
  noise: { warn: 1.2, chase: 8 },
  /**
   * Lazy volunteers: `couches` floating couches full of volunteers chilling, dropped behind the owner
   * across the canal (staggered, so there is a way through). Like swimmers: running into one makes
   * a mess and slows the boat (`critters` slow), no damage. They drift for `life` s.
   */
  lazyVolunteers: { couches: 3, behind: 110, stagger: 95, life: 25, ownerImmunity: 1.5 },
  /**
   * Painting workshop: for `trailTime` s a trail of wet paint is left behind, a splash every `every`
   * s. Driving through it: paint all over the screen for `paintTime` s (no damage).
   */
  paint: { radius: 58, life: 10, ownerImmunity: 1, trailTime: 3, every: 0.22, paintTime: 3.5 },
  /**
   * Lost in Translation (useless, for the leader): every opponent's game switches to another
   * language, menus and all, for `duration` s. Nothing else happens.
   */
  translation: { duration: 20 },
  /** Premature Celebration (useless, for the leader): a bottle of champagne: a little drunker than a beer (`sway` x the beer's), no repair. */
  champagne: { drunkTime: 5, sway: 1.3 },
  /** Tugboat: tows its owner along the canal for `duration` s: steered for you, faster, and through glue. */
  tugboat: { duration: 4, topSpeed: 1.45, accel: 3, mass: 2 },
  powder: { duration: 2.5, topSpeedMult: 1.5, accelMult: 2, massMult: 2 },
  /**
   * Electric drill: only the bit. It sits on the bow (or the stern, swiped down) for `mountTime` s,
   * spinning, and hurts whoever it rams (`mountDamage`, once each); then it shoots off straight
   * ahead and hurts the first boat it meets (`damage`). `length` and `radius`: its size.
   */
  drill: { speedMult: 1.6, range: 1400, damage: 42, stuckTime: 1, mountTime: 3, mountDamage: 28, length: 72, radius: 9 },
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
  beer: { healFraction: 0.5, drunkTime: 4 },
  /** Drunk (beer, beer dispenser): the boat weaves, `sway` rad either side, a full sway every 2π / `rate` s. */
  drunk: { sway: 0.3, rate: 2.6 },
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
  /**
   * Clogged toilet: for `trailTime` s a trail of toxic smoke is left behind, a cloud every `every`
   * s. Damage per second to every boat inside (once, however many clouds it is in), the owner too.
   */
  toilet: { radius: 70, life: 9, dps: 10, ownerImmunity: 1, feedbackEvery: 0.8, trailTime: 3, every: 0.25 },
  /**
   * Kärcher: for `duration` seconds, jets of water on both sides push every boat alongside away,
   * sideways. A boat that is still wet (`soakTime`) when it reaches the bank crashes into it.
   * The jets fan out from the middle half of each side (`base` x the boat's length), widening by
   * `spread` px per px out, as far as `reach`: the view draws exactly that.
   */
  karcher: { duration: 3.5, reach: 280, base: 0.6, spread: 0.45, push: 8500, maxSideSpeed: 480, crashDamage: 24, soakTime: 1.4, soakedTurnMult: 0.6 },

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
   * People on the towpath who push a crate into the water `ahead` px in front of a boat that is
   * behind (never the leader, nor near it): about once every `every` s for each such boat with a
   * free slot (and not within the barges' `dropEvery` of the last crate it was given).
   */
  pushers: { every: 9, ahead: 380, startAfter: 6 },
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
