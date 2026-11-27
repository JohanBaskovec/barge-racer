# Items

## Crates

- Crates float in **rows of 3 to 5** across the track, placed in the track data
  (see [Tracks](tracks.md)). They bob gently and spin.
- Driving through a crate breaks it. If the racer has a free **item slot**, an
  **item roulette** runs in that slot for 1 s, then lands on one item. If both
  slots are full, the crate just breaks and gives nothing.
- A broken crate respawns after **4 s**.
- A racer holds **two items at once**: slot 1 (fired with right click or the first
  button) and slot 2 (middle click or the second button). A new item goes into
  the first free slot. Items can't be swapped or thrown away.
- **Instant items** (beer) are used the moment the roulette lands and never take
  a slot.

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

### 6. Silicone Gun

*"Seals gaps. And opponents."*

A caulking gun that **shoots glue** instead of leaving it behind.

- **Uses**: 2 shots.
- **Shot**: a ball of glue flying straight ahead (or backwards with a swipe) at
  1.3 x the fastest boat's top speed, up to 900 px.
- **It lands** on the first boat it touches, with a glue puddle appearing right
  on that boat, or on the water where it runs out of range or just before a bank.
- **Glue**: exactly the same puddle as the Glue item (radius 60 px, 15 s, slows
  boats, vanishes after 3 boats). It does no damage itself.
- **Stopped by**: another boat's active Jigsaw in front of it.
- Like a drill, it is fired from the bow; hitting a bank leaves the puddle on the
  water just before it.

### 7. Fake Crate

*"Looks just like the real thing."*

A trap dropped **behind** the boat, like Glue. It looks **exactly** like a real
item crate (same picture, same bobbing), so rivals reaching for a crate may drive
straight into it.

- **Damage**: 25 hull and a spin-out to the first boat that touches it, then it
  is gone.
- **Safe for its owner** for the first second, so it can't be hit on the way out.
- **Lifetime**: 40 s.
- **A blinking boat** (just hit) drives through it without setting it off.
- **Destroyed by**: a Drill bit (both stop), or a Jigsaw in front of the boat.
  Volunteers fly over it.
- The AI steers around fake crates: it spots about 35 % of them at Pond, 60 % at
  River and 90 % at Ocean.
- The owner's item icon has a small red badge so they know which is which.

### 8. Beer Crate

*"Medicinal."*

An **instant** item: when the roulette lands the boat is healed by **50 % of its
maximum hull** (never above full), with a green burst and a "Cheers!" message.
It never occupies a slot, and is never drawn for a boat with more than 90 % hull
(redrawn instead), so it can't be wasted at full health.

### 9. Magic Mushrooms

*"Nothing happens. Nothing at all. Look at the colours."*

An item that **does nothing** except make the user's screen psychedelic for 14 s:
the colours cycle, the picture bulges and the view breathes. It doesn't affect
steering, speed or anyone else. It still takes a slot until used, which is its
price. It is the **rarest** item in every position. The AI uses it straight away
to free its slot.

The colour and lens effects need WebGL; without it only the HUD's rainbow wash
and the breathing zoom show.

## Summary table

| Item | Type | Damage | Duration / lifetime | Counters |
| --- | --- | --- | --- | --- |
| Volunteers | Homing projectile | 30 | 6 s | Jigsaw, Drill, Glue, sharp turn |
| Jigsaw | Melee buff (front) | 25 per target | 4 s | Stay out of its way, hit it from the side |
| White Powder | Self boost | 0 | 2.5 s | - |
| Electric Drill | Straight projectile | 35 | 1400 px | Dodge sideways, Jigsaw |
| Glue | Area trap | 0, slows | 15 s / 3 boats | Drive around it, White Powder |
| Silicone Gun | Straight projectile, makes glue | 0, slows | 900 px, 2 shots | Dodge sideways, Jigsaw |
| Fake Crate | Hidden trap | 25 | 40 s | Spot it, Drill, Jigsaw |
| Beer Crate | Instant heal | heals 50 % hull | instant | - |
| Magic Mushrooms | Screen effect | 0 | 14 s | - |

## Who gets what: position-based odds

The item from a crate depends on the racer's **position** at the moment the
crate is broken. **The leader gets the weakest items, the back gets the strongest**:
leaders mostly draw defensive items (Fake Crate, Glue, Beer) and almost never
the big boosts, while the last boats get Volunteer Squads and Big Bags.
The weights are per position (1st to 4th); the item is drawn at random using them.

| Item | 1st | 2nd | 3rd | 4th |
| --- | --- | --- | --- | --- |
| Volunteers | 4 | 20 | 24 | 20 |
| Volunteer Squad | 0 | 0 | 3 | 10 |
| Jigsaw | 10 | 16 | 16 | 12 |
| White Powder | 4 | 12 | 18 | 20 |
| Big Bag | 0 | 0 | 5 | 14 |
| Electric Drill | 18 | 20 | 16 | 10 |
| Glue | 24 | 10 | 6 | 4 |
| Silicone Gun | 6 | 12 | 14 | 12 |
| Fake Crate | 26 | 12 | 6 | 4 |
| Beer Crate | 14 | 12 | 10 | 8 |
| Magic Mushrooms | 2 | 2 | 2 | 2 |

Every item has a **power** rating (`ITEM_POWER` in `src/data/items.ts`: Squad 10,
Big Bag 9, Volunteers and Silicone Gun 7, Jigsaw, Powder and Drill 6, Glue 5,
Fake Crate and Beer 4, Mushrooms 0). The average power of a draw is about
**5.0 for 1st, 5.7 for 2nd, 6.1 for 3rd and 6.6 for 4th**, and a test checks that it
rises from the front to the back, that the mushroom stays the rarest item in
every column, and that 1st place never gets squads or big bags.

Rules on top of the table:

- If a racer is more than **1 lap's worth of distance** behind the leader, it
  uses the 4th place column whatever its position.
- No more than **2 homing Volunteers** may be in flight at the same time; if
  the draw would exceed this, it is redrawn.
- The roulette never gives the same item **three times in a row** to the same
  racer.
- Beer is redrawn when the racer's hull is above 90 %.

## Item data shape

```ts
type ItemId =
  | 'volunteer' | 'volunteerSquad'
  | 'jigsaw'
  | 'whitePowder' | 'bigBag'
  | 'drill'
  | 'glue' | 'siliconeGun'
  | 'fakeCrate'
  | 'beer'
  | 'mushroom';

interface ItemInfo {
  id: ItemId;
  uses: number;            // 1 for most, 2 for the silicone gun, 3 for squad / big bag
  icon: string;            // texture key
  instant?: boolean;       // applied when the crate opens, never stored (beer)
}

type Slot = { id: ItemId; uses: number } | null;  // Racer.slots: [Slot, Slot]
```

Items are used through `ItemSystem.use(racer, slot, direction)`. It either adds a
timed **effect** to the boat or spawns an **entity** (volunteer, drill, glue
blob, glue puddle, fake crate) that the system updates every step. The display
names come from the translation files (`item.<id>`), not from the item data. See
[Architecture](architecture.md#items-and-effects).

## Ideas for later

Not part of the first version, collected here so they are not lost:

- **Anchor**: dropped from the leader's side, a big hazard.
- **Foghorn**: blast that pushes nearby boats away.
- **Seagulls**: a flock that blocks the screen of the leader.
