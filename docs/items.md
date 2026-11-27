# Items

## Crates

- Crates float in **rows of 3 to 5** across the track, placed in the track data
  (see [Tracks](tracks.md)). They bob gently and spin.
- Driving through a crate breaks it. If the racer has a free **item slot**, an
  **item roulette** runs in that slot for 1 s, then lands on one item. If both
  slots are full, the crate just breaks and gives nothing.
- A broken crate respawns after **4 s**.
- **Barges toss extra crates** to boats that are behind (never to the leader, who can't
  pick them up either): see [Game design](game-design.md#traffic-wakes-and-slipstream).
  They give items like any crate, drawn for the boat's position.
- A racer holds **two items at once**: slot 1 (fired with right click or the first
  button) and slot 2 (middle click or the second button). A new item goes into
  the first free slot. Items can't be swapped or thrown away.
- Every item is held until you use it (a beer too: drink it when you need it).

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
- **Damage**: 35 hull and a spin-out (1.2 s, shortened by mass).
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
- **Damage**: 30 hull plus a spin-out to each opponent touched. Each opponent can
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
- **Damage**: 42 hull and a spin-out to the first boat hit.
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
- **Effect on boats**: while inside, top speed x 0.25, turning x 0.4, acceleration
  x 0.6 and a strong extra drag, so a boat nearly stops. After leaving, the boat
  stays "sticky" for 2 s (top speed x 0.6, acceleration x 0.7). No hull damage.
- **More annoying than a hit**: being hit costs about 2 s (the spin-out and the speed
  it kills). Crossing a puddle costs about **1.6 to 2.2 times that**, more for heavy
  boats that are slow to get going again, so glue is worse than a hit even though
  it does no damage. A test checks this for light and heavy boats. White Powder
  still ignores it, and the Fire Boat washes it away.
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

- **Damage**: 30 hull and a spin-out to the first boat that touches it, then it
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

A crate of beer in a slot. Using it **heals 50 % of the boat's maximum hull** (never
above full), with a green burst and a "Cheers!" message. Drink it when you need it:
it can be kept for after the next hit. The AI drinks when its hull is under 55 %.

### 9. Magic Mushrooms

*"Everyone ahead of you looks tiny. Everyone behind you looks hungry."*

For **10 s** after it is eaten:

- **Everyone who was ahead of you is shrunk.** Their boat shrinks to 55 % (the
  collision shape too), so it is lighter and gets shoved around, and it is 15 % slower.
  The change eases in and out.
- **Everyone who was behind you is hasty**: top speed x 1.3 and acceleration x 1.6.
- **Crates fly to you.** Every crate within 900 px is pulled towards you at 650 px/s
  and is yours the moment it touches you. Crates the magic lets go of float home.
- Your screen goes psychedelic (colours cycle, the picture bulges, the view breathes),
  and rings contract on your boat. That part is only for show.

Who is "ahead" and "behind" is decided at the moment of eating, by race progress, and
holds for the whole 10 s. So it is a gamble: from the back, everyone ahead shrinks and
slows and nobody speeds up; from the front, everyone behind gets faster. It is the
**rarest item** in every position. The AI eats it when more boats are ahead of it than
behind.

### 10. Electrical Failure

*"Have you tried turning it off and on again?"*

Every **opponent** loses their controls for **3.2 s**: they can't steer, their throttle
is frozen at what it was, and they can't use items. The boats keep going straight at the
speed they had until they hit a bank, so a failure on a bend sends them into it, and it
does nothing to you. Boats that have finished, and boats that are sinking, are not
affected. It is shown by blue arcs and flickering lights on the boats and a "Power cut!"
message on the victim's screen.

The most powerful item (power 10), given only to the **back two positions**, and never
to the leader. The AI uses it when it is behind someone worth passing, or has someone on
its tail.

### 11. Ultimate Raclette

*"Potato. Ham. Cheese. Not necessarily in that order."*

A raclette grill on the bow:

- It **fires a potato and two slices of ham** straight ahead in a fan (the potato in the
  middle, the ham 10 degrees either side). They fly at 1.25 and 1.45 x the fastest boat's
  top speed for up to 1300 px, and hit the first boat they touch. **Damage**: 45 for the
  potato, 26 for each slice of ham, each with a spin-out. A jigsaw cuts them down; a bank
  stops them.
- It **leaves melted cheese behind** (a puddle of radius 75 px for 12 s, dropped like
  glue), whatever the direction you fire.
- **Cheese on the screen**: a boat hit by the potato or the ham (3.5 s), and any boat
  that drives through the melted cheese (4.5 s), gets its screen covered with melted
  cheese: it drops down, covers most of the view (with holes to peek through), and runs
  off again in the last second. The buttons stay clear and usable. An AI boat can't see
  either: it wanders and eases off.
- The cheese puddle is harmless to its owner for the first second.

Power 10, given only to the **back two positions**.

### 12. Clogged Toilet

*"Do not flush."*

A **cloud of toxic smoke** is left behind the boat, like glue: radius 95 px, 12 s.

- Every boat in it takes **38 hull damage per second** (about 24 for a boat driving
  straight through). It is damage over time, not a hit: no spin-out and no blinking,
  and it can sink a boat. A boat that is blinking after a hit is spared.
- **It hurts its owner too**, after the first second, so don't turn back into it.
- The boats announce it now and then with a green puff, a cough and "Toxic!", not every
  step.
- The AI steers round smoke clouds.

A defensive trap (power 4), so the leader gets it most.

### 13. Kärcher

*"Karchérisé."*

A pressure washer. For **3.5 s**, jets of water on **both sides** of the boat push every
boat alongside **away from you, sideways**: the nearer the nozzle, the harder, up to
300 px away and from a bit in front of the bow to a bit behind the stern. Heavy boats
are pushed less than light ones.

- **They crash.** A boat the jets hit is soaked for 1.4 s after, and a soaked boat that
  reaches the bank is not just bumped: it takes **24 hull damage** and a spin-out, and the
  message "Washed out!". In practice a boat beside you in a normal canal ends up in the
  bank. They can steer against the push, but a soaked boat turns at 60 % of its rate.
- Nothing happens to boats out of reach, and nothing to you.
- The AI uses it when someone is alongside it.

## Summary table

| Item | Type | Damage | Duration / lifetime | Counters |
| --- | --- | --- | --- | --- |
| Volunteers | Homing projectile | 35 | 6 s | Jigsaw, Drill, Glue, sharp turn |
| Jigsaw | Melee buff (front) | 30 per target | 4 s | Stay out of its way, hit it from the side |
| White Powder | Self boost | 0 | 2.5 s | - |
| Electric Drill | Straight projectile | 42 | 1400 px | Dodge sideways, Jigsaw |
| Glue | Area trap | 0, slows a lot | 15 s / 3 boats | Drive around it, White Powder |
| Silicone Gun | Straight projectile, makes glue | 0, slows a lot | 900 px, 2 shots | Dodge sideways, Jigsaw |
| Fake Crate | Hidden trap | 30 | 40 s | Spot it, Drill, Jigsaw |
| Beer Crate | Heal | heals 50 % hull | on use | - |
| Magic Mushrooms | Shrinks those ahead, speeds up those behind, pulls crates | 0 | 10 s | - |
| Electrical Failure | Opponents' controls stuck | 0 (a crash costs) | 3.2 s | - |
| Ultimate Raclette | 3 straight shots + a trap, cheese on the screen | 45 + 2 x 26 | 1300 px, cheese 12 s | Dodge, Jigsaw, drive round the cheese |
| Clogged Toilet | Area trap, damage over time | 38 per second | 12 s | Drive round it |
| Kärcher | Sideways push on both sides | 24 (when they hit the bank) | 3.5 s | Stay out of reach, steer away |

## Who gets what: position-based odds

The item from a crate depends on the racer's **position** at the moment the
crate is broken. **The leader gets the weakest items, the back gets the strongest**:
leaders mostly draw defensive items (Fake Crate, Glue, Toilet, Beer) and almost never
the big boosts, while the last boats get Volunteer Squads and Big Bags.
The weights are per position (1st to 4th); the item is drawn at random using them.
The two "ultimate" items, the Electrical Failure and the Raclette, go only to the back
two positions.

| Item | 1st | 2nd | 3rd | 4th |
| --- | --- | --- | --- | --- |
| Volunteers | 4 | 18 | 22 | 18 |
| Volunteer Squad | 0 | 0 | 3 | 9 |
| Jigsaw | 9 | 14 | 14 | 10 |
| White Powder | 4 | 10 | 15 | 16 |
| Big Bag | 0 | 0 | 4 | 12 |
| Electric Drill | 16 | 18 | 14 | 9 |
| Glue | 22 | 9 | 5 | 3 |
| Silicone Gun | 5 | 10 | 12 | 10 |
| Fake Crate | 22 | 10 | 5 | 3 |
| Beer Crate | 14 | 12 | 9 | 7 |
| Magic Mushrooms | 2 | 2 | 2 | 2 |
| Electrical Failure | 0 | 0 | 3 | 7 |
| Ultimate Raclette | 0 | 0 | 3 | 8 |
| Clogged Toilet | 14 | 8 | 5 | 3 |
| Kärcher | 3 | 9 | 11 | 9 |

Every item has a **power** rating (`ITEM_POWER` in `src/data/items.ts`: Squad, Electrical
Failure and Raclette 10, Big Bag 9, Silicone Gun 8, Volunteers 7, Jigsaw, Powder, Drill,
Glue, Mushrooms and Kärcher 6, Beer 5, Fake Crate and Toilet 4). The average power of a
draw is about **5.4 for 1st, 5.9 for 2nd, 6.5 for 3rd and 7.2 for 4th**, and a test checks
that it rises from the front to the back, that the mushroom stays the rarest item in every
column, and that 1st place never gets squads, big bags or the ultimate items.

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
  | 'glue' | 'siliconeGun'
  | 'fakeCrate'
  | 'beer'
  | 'mushroom'
  | 'blackout'
  | 'raclette'
  | 'toilet'
  | 'karcher';

interface ItemInfo {
  id: ItemId;
  uses: number;            // 1 for most, 2 for the silicone gun, 3 for squad / big bag
  icon: string;            // texture key
}

type Slot = { id: ItemId; uses: number } | null;  // Racer.slots: [Slot, Slot]
```

Items are used through `ItemSystem.use(racer, slot, direction)`. It either adds a
timed **effect** to the boat (or to the others: mushrooms, electrical failure) or spawns
an **entity** (volunteer, drill, glue blob, glue puddle, fake crate, raclette shot,
cheese or smoke cloud) that the system updates every step. The Kärcher is an effect on
the user that the system turns into pushes each step. The effects are listed in
`src/effects/effects.ts`: `magnet`, `shrunk`, `hasty`, `blackout`, `cheesed`, `karcher`
and `soaked` are the new ones; they travel to the other screens in an online race like
the old ones, and the new entities, a boat's size and the crates a mushroom has pulled
away have their own fields in the snapshot (see [Multiplayer](multiplayer.md)). The display
names come from the translation files (`item.<id>`), not from the item data. See
[Architecture](architecture.md#items-and-effects).

## Ideas for later

Not part of the first version, collected here so they are not lost:

- **Anchor**: dropped from the leader's side, a big hazard.
- **Foghorn**: blast that pushes nearby boats away.
- **Seagulls**: a flock that blocks the screen of the leader.
