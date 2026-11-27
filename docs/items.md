# Items

## Crates

- Crates float in **rows of 3 to 5** across the track, placed in the track data
  (see [Tracks](tracks.md)). They bob gently and spin.
- Driving through a crate breaks it. If the racer holds no item, an **item
  roulette** runs in the item slot for 1 s, then lands on one item. If the
  racer already holds an item, the crate just breaks and gives nothing.
- A broken crate respawns after **4 s**.
- One item at a time. Items can't be stored, swapped or thrown away.

## Item list

All numbers are starting values to be tuned during playtesting. They live in
`src/data/items.ts` (see [Architecture](architecture.md)).

### 1. Volunteers

*"Brave little people who really want to help."*

The racer throws a volunteer (a little person in a life vest) at an opponent.
It works like a **homing missile**.

- **Target**: the racer directly ahead in the ranking. If no one is
  ahead (they're 1st), the volunteer flies straight ahead without homing.
- **Flight**: launched forwards in an arc, then follows the track's centre line
  towards the target until it is within 250 px, then locks on and homes in
  directly.
- **Speed**: 1.4 x the fastest boat's top speed, so it always catches up.
- **Turn rate**: high, but limited; a sharp last-second turn can make it miss.
- **Lifetime**: 6 s, or until it hits something.
- **Hits**: the first boat it touches (it can hit someone other than its target),
  banks and obstacles. It can be blocked by a Drill bit or eaten by a Glue
  puddle (it gets stuck and is removed).
- **Damage**: 30 hull and a spin-out (1.2 s, shortened by mass).
- **Count**: 1 volunteer per crate. A rare **Volunteer Squad** (3 volunteers,
  each throw uses one) is given to racers in the last position only.
- **Backwards throw**: flies straight back without homing.
- **After the hit**: the volunteer bobs in the water and waves. Purely visual.

### 2. Jigsaw

*"Health and safety has left the chat."*

A big electric jigsaw blade folds out of the bow.

- **Duration**: 4 s after activation.
- **Hitbox**: a cone in front of the boat, 50 degrees wide, reaching 1.2 x the
  boat's length forward of its centre. Only boats **in front** are hit; touching
  the saw from the side or back does nothing to the owner.
- **Damage**: 25 hull plus a spin-out to each opponent touched. Each opponent can
  be hit once per activation.
- **Side effects**: the owner gets +5 % top speed while active and is not
  slowed by boat-on-boat bumps from the front.
- **Defence**: it destroys Volunteers and Drill bits that hit the saw head-on.
- **Visuals and sound**: saw blade sprite with sparks and a buzzing loop.

### 3. White Powder

*"Don't ask. Just go."*

An unlabelled bag of white powder. Using it gives a speed boost.

- **Duration**: 2.5 s.
- **Effect**: top speed x 1.5, acceleration x 2, and the boat ignores the
  slow-down from Glue and shallow water while boosted.
- **Ramming**: during the boost, hitting another boat pushes it away hard
  (as if the boosted boat were 2 x heavier), but does no damage.
- **Rare variant**: **Big Bag**, 3 uses of 2 s each, given only to the last two
  positions.
- **Visuals**: white sparkly wake, speed lines, the driver's eyes go wide.
  Nothing else is shown.

### 4. Electric Drill

*"Lefty loosey, righty... fire."*

The racer fires a spinning drill bit **straight ahead**. It does not home.

- **Speed**: 1.6 x the fastest boat's top speed.
- **Range**: travels until it has gone 1400 px, or hits something.
- **Banks**: it does **not** bounce; it gets stuck in the bank and disappears
  after 1 s.
- **Damage**: 35 hull and a spin-out to the first boat hit.
- **Aim assist**: a dotted aim line from the bow shows where it will go while
  the item is held. Just a line, no auto-aim.
- **Backwards fire**: fires straight back, useful against someone right behind.
- **Blocks**: hitting a Volunteer cancels both.

### 5. Glue

*"Industrial strength. Smells like regret."*

The racer drops a puddle of glue behind them.

- **Placement**: directly behind the stern, always (forward fire also drops it
  behind).
- **Size**: a circle of radius 60 px, growing in over 0.3 s.
- **Lifetime**: 15 s, or until 3 boats have driven through it.
- **Effect on boats**: while inside, top speed x 0.4 and turning x 0.6. After
  leaving, the boat stays "sticky" for 1 s (top speed x 0.7). No hull damage.
- **The owner** is affected too if they drive back into it, after the first
  1 s.
- **Projectiles**: a Volunteer that flies through a puddle gets stuck and is
  removed. Drill bits pass over it.
- **Visuals**: a yellow-white sticky puddle with bubbles; stuck boats leave
  stretchy strings behind for a moment.

## Summary table

| Item | Type | Damage | Duration / lifetime | Counters |
| --- | --- | --- | --- | --- |
| Volunteers | Homing projectile | 30 | 6 s | Jigsaw, Drill, Glue, sharp turn |
| Jigsaw | Melee buff (front) | 25 per target | 4 s | Stay out of its way, hit it from the side |
| White Powder | Self boost | 0 | 2.5 s | - |
| Electric Drill | Straight projectile | 35 | 1400 px | Dodge sideways, Jigsaw |
| Glue | Area trap | 0, slows | 15 s / 3 boats | Drive around it, White Powder |

## Who gets what: position-based odds

The item from a crate depends on the racer's **position** at the moment the
crate is broken. Leaders get defensive or weak items; racers at the back get
items that help them catch up. The weights are per position (1st to 4th); the
item is drawn at random using these weights.

| Item | 1st | 2nd | 3rd | 4th |
| --- | --- | --- | --- | --- |
| Volunteers | 10 | 30 | 30 | 20 |
| Volunteer Squad | 0 | 0 | 0 | 10 |
| Jigsaw | 15 | 20 | 15 | 10 |
| White Powder | 5 | 15 | 20 | 20 |
| Big Bag | 0 | 0 | 5 | 15 |
| Electric Drill | 30 | 25 | 20 | 15 |
| Glue | 40 | 10 | 10 | 10 |

Rules on top of the table:

- If a racer is more than **1 lap's worth of distance** behind the leader, it
  uses the 4th place column whatever its position.
- No more than **2 homing Volunteers** may be in flight at the same time; if
  the draw would exceed this, it is redrawn.
- The roulette never gives the same item **three times in a row** to the same
  racer.

## Item data shape

```ts
type ItemId =
  | 'volunteer' | 'volunteerSquad'
  | 'jigsaw'
  | 'whitePowder' | 'bigBag'
  | 'drill'
  | 'glue';

interface ItemDef {
  id: ItemId;
  name: string;
  uses: number;            // 1 for most, 3 for squad / big bag
  icon: string;            // texture key
  activate(ctx: ItemContext, direction: 'forward' | 'backward'): void;
}
```

Each item is implemented as a small class in `src/items/` that spawns
**entities** (projectiles, puddles) or applies **effects** (timed modifiers on a
boat). See [Architecture](architecture.md#items-and-effects).

## Ideas for later

Not part of the first version, collected here so they are not lost:

- **Anchor**: dropped from the leader's side, a big hazard.
- **Foghorn**: blast that pushes nearby boats away.
- **Seagulls**: a flock that blocks the screen of the leader.
- **Duct tape**: instantly repairs the hull.
