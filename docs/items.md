# Items

## Crates

- Crates float in **rows of 8** across the track, placed in the track data (see
  [Tracks](tracks.md)): as many across as the canal has room for (up to 4, two crate
  widths apart), the rest in staggered lines behind (4 + 4, or 3 + 3 + 2 on a narrow
  canal). They bob gently and spin.
- Driving through a crate breaks it. If the racer has a free **item slot**, an
  **item roulette** runs in that slot for 1 s, then lands on one item. If both
  slots are full, the crate just breaks and gives nothing.
- A broken crate respawns after **4 s**.
- **Barges toss extra crates** to boats that are behind (never to the leader, who can't
  pick them up either): see [Game design](game-design.md#traffic-wakes-and-slipstream).
  They give items like any crate, drawn for the boat's position.
- **People on the towpath push crates in** for the boats behind, too: about once every
  9 s for each boat that isn't leading and has a free slot, someone shoves a crate off
  the bank 380 px ahead of it (never near the leader, who can't take it either; and not
  within 7 s of the last crate a barge or a pusher gave that boat).
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
- **Count**: 1 volunteer per crate, or 3 in its better version (each throw uses one).
- **Backwards throw**: flies straight back without homing.
- **After the hit**: the volunteer bobs in the water and waves. Purely visual.

### 2. Jigsaw

*"Health and safety has left the chat."*

Big electric jigsaw blades fold out of **each side** of the boat and the **bow**.

- **Duration**: 4 s after activation.
- **Hitbox**: beside the hull, along its middle 60 %, out to 62 px past its side, on
  both sides; and a cone ahead of the bow, 50 degrees wide, reaching 1.2 x the boat's
  length. Boats alongside or ahead are cut; boats behind are not.
- **Damage**: 30 hull plus a spin-out to each opponent touched. Each opponent can
  be hit once per activation.
- **Side effects**: the owner gets +5 % top speed while active.
- **Visuals and sound**: three saw blades, sideways and ahead, sparks, a buzzing loop.

### 3. Flour

*"Don't ask. Just go."*

An unlabelled bag of flour. Using it gives a speed boost.

- **Duration**: 2.5 s.
- **Effect**: top speed x 1.5, acceleration x 2, and the boat ignores the
  slow-down from Glue and shallow water while boosted.
- **Ramming**: during the boost, hitting another boat pushes it away hard
  (as if the boosted boat were 2 x heavier), but does no damage.
- **Better version**: 3 uses, like every item.
- **Visuals**: white sparkly wake, speed lines, the driver's eyes go wide.
  Nothing else is shown.

### 4. Electric Drill

*"Lefty loosey, righty... fire."*

Only the bit (a big one, 72 px; the drill itself is never shown, and that's the joke):
it sits **on the bow, spinning, for 3 s**, and whoever it rams takes **28 hull** and a
spin-out (once each). Then it **shoots off straight ahead**, from wherever the boat is
pointing. It does not home.

- **Speed**: 1.6 x the fastest boat's top speed.
- **Range**: travels until it has gone 1400 px, or hits something.
- **Banks**: it does **not** bounce; it gets stuck in the bank and disappears
  after 1 s.
- **Damage**: 42 hull and a spin-out to the first boat hit.
- **Aim assist**: a dotted aim line from the bow shows where it will go while
  the item is held. Just a line, no auto-aim.
- **Backwards fire**: swiped down, the bit sits on the stern and fires straight back.
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
  it does no damage. A test checks this for light and heavy boats. Flour
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
- **Stopped by**: another boat's Dildo, head-on.
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
- **Destroyed by**: a Drill bit (both stop), or a Dildo on the bow of the boat.
  Volunteers fly over it.
- The AI steers around fake crates: it spots about 35 % of them at Pond, 60 % at
  River and 90 % at Ocean.
- The owner's item icon has a small red badge so they know which is which.

### 8. Beer Crate

*"Medicinal."*

A crate of beer in a slot. Using it **heals 50 % of the boat's maximum hull** (never
above full), with a green burst and a "Cheers!" message. And it goes to your head: for
**4 s** you are drunk ("Hic!"): the boat weaves from side to side on its own (up to about
17 degrees either way, a sway every 2.4 s), and your screen goes green, with soft waves
rolling across it and the view swaying. Drink it when you need it:
it can be kept for after the next hit. The AI drinks when its hull is under 55 %.

### 9. Magic Mushrooms

*"Everyone ahead of you looks tiny. Everyone behind you looks hungry."*

For **10 s** after it is eaten:

- **Everyone who was ahead of you is shrunk.** Their boat shrinks to 55 % (the
  collision shape too), so it is lighter and gets shoved around, and it is **35 % slower**.
  The change eases in and out.
- **Everyone who was behind you is hasty**: top speed x 1.3 and acceleration x 1.6.
- **Crates fly to you.** Every crate within 900 px is pulled towards you at 650 px/s
  and is yours the moment it touches you. Crates the magic lets go of float home.
- Your screen goes psychedelic (colours cycle, the picture bulges, the view breathes),
  and rings contract on your boat. That part is only for show.

Who is "ahead" and "behind" is decided at the moment of eating, by race progress, and
holds for the whole 10 s. So it is a gamble: from the back, everyone ahead shrinks and
slows and nobody speeds up; from the front, everyone behind gets faster. It is the
**rarest item** in every position, and never given to the leader. The AI eats it when more boats are ahead of it than
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
  potato, 26 for each slice of ham, each with a spin-out. A dildo on a bow smashes them; a bank
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

A **trail of toxic smoke** is left behind the boat for 3 s: a cloud every 0.25 s
(radius 70 px, each lasting 9 s), so a long smelly line along the way you went.

- Every boat in it takes **10 hull damage per second**, once however many clouds of the
  trail it is in: about 30 for a boat that follows the whole trail, less for one that
  steers out of it. It is damage over time, not a hit: no spin-out and no blinking,
  and it can sink a boat. A boat that is blinking after a hit is spared.
- **It hurts its owner too**, after the first second, so don't turn back into it.
- The boats announce it now and then with a green puff, a cough and "Toxic!", not every
  step.
- The AI steers round smoke clouds.

A defensive trap (power 4), so the leader gets it most.

### 13. Kärcher

*"Karchérisé."*

A pressure washer. For **3.5 s**, jets of water on **both sides** of the boat push every
boat alongside **away from you, sideways**: the nearer the nozzle, the harder. The jets
fan out of the middle 60 % of each side, widening by 0.45 px per px out, up to 280 px
away: only boats inside that fan are pushed (not those level with your stern or bow),
and the spray drawn on screen is exactly that fan. Heavy boats are pushed less than
light ones.

- **They crash.** A boat the jets hit is soaked for 1.4 s after, and a soaked boat that
  reaches the bank (even pinned against it from close by) is not just bumped: it takes **24 hull damage** and a spin-out, and the
  message "Washed out!". In practice a boat beside you in a normal canal ends up in the
  bank. They can steer against the push, but a soaked boat turns at 60 % of its rate.
- Nothing happens to boats out of reach, and nothing to you.
- The AI uses it when someone is alongside it.

### 14. Dicke Titten

*Strong.* A giant pair of breasts drops onto the water in front of **every opponent**,
420 px ahead on the line it is taking. There is **always a way round**: one pair per
330 px of canal (a pair that would land beside another goes further on), each leaving at
least 100 px free on one side, and where the canal is too narrow for that the pair lies
along the canal instead of across it. They fall for 0.55 s (a shadow grows where they
will land), then lie on the water for 9 s, solid: running into them bounces the boat
off, costs 40 hull and a spin-out (once per boat). Their owner passes through. They
also stop volunteers, drills and shots. The AI steers round them (the better the AI,
the surer). Only the boats behind get them.

### 15. Giant Black Dildo

*Weak.* Fixed to the bow for 5 s, like the old jigsaw: ram a boat to hurt it, 16 hull
and a spin-out (once per boat per use). It also smashes volunteers, drills, shots and
fake crates that meet it head-on. Mostly given to the leader.

### 16. Nail Gun

Three nails, 0.11 s apart, straight ahead (or behind, swiped down), fast (2.1 x the
fastest boat). Each nail costs 13 hull and a jolt (the boat loses 20 % of its speed) but
no spin-out and no blinking, so all three can hit the same boat: 39 in all.

### 17. Gas Siphoning

*Strong.* Every opponent's tank is emptied: for 3 s they have no thrust and stop
(extra drag); they can still steer and fire. An empty jerrycan bobs over them and their
engine coughs black smoke. Only the back two positions get it.

### 18. Tugboat

A tugboat appears ahead of you and **tows** you for 4 s: it steers along the racing
line for you, top speed x 1.45, acceleration x 3, twice the mass, and through glue. You
can still fire items. Only the boats behind get it.

### 19. Beer Dispenser

A bar's beer tap: the hull is repaired **in full** (and you are drunk for 6 s, as with a
beer), and a head of foam forms round the boat that **takes the next hit** instead of it (within 45 s): a weapon, a trap, a crash
caused by an item, a nail, a police bullet. Bumping the bank doesn't burst it, nor does
toxic smoke (damage over time, not a hit). When it bursts the boat blinks, as if hit, so
the same thing can't hurt it a moment later. The AI drinks it below 65 % hull.

### 20. Vacuum Cleaner

A hose and nozzle on the bow for 3 s: every boat **ahead**, within 1100 px and 70 degrees
of straight ahead, is pulled back towards you, harder when closer and the lighter it is
(up to 300 px/s towards you). A boat 700 px ahead gets about a quarter as far as it would
have in those seconds. Useless for the leader: never given to 1st.

### 21. Sauna

Every opponent is lost in **thick steam** for 5 s: their screen goes grey-white except for
a clear spot round the boat that brought the sauna, so they can see you but not where they
are going. The AI wanders and lifts off, as when covered in cheese. Your own screen gets a
little steam round the edges. Never given to 1st.

### 22. Noise Complaint

You call the police on everyone, for the noise: **a police boat after every opponent**
(not one already chased). Each one turns up 1.2 s later, chases for 8 s and fires rockets,
like the speeding police. A rocket that hits stops its target and fines it **€68 for
noise** (3 s stopped). Only the back two places get it.

### 23. Lazy Volunteers

Three **floating couches** full of volunteers chilling (hi-vis vests, sunglasses, a drink)
dropped behind you, staggered left, middle and right a little way apart, so there is
always a way through. They behave like swimmers: running into one makes a mess (blood,
screams) and slows the boat for 1.3 s, no damage. They drift for 25 s; you are immune for
1.5 s after dropping them.

### 24. Painting Workshop

For 3 s you leave a **trail of wet paint** (a splash of a random colour every 0.22 s,
10 s each). Whoever drives through gets **paint all over the screen** for 3.5 s (big
splats with drips, gaps to peer through), no damage. The AI steers a little blind too.

### The better versions (x 3)

Every item can come as its **better version, with three uses** (this replaced the old
Volunteer Squad and Big Bag, which were exactly that for the Volunteers and the Powder). The
chance depends on the position when the crate is broken: never for 1st, 8 % for 2nd,
18 % for 3rd and 30 % for 4th (`TRIPLE_ODDS`). The strongest items, those that hit every
opponent at once (Mushrooms, Electrical Failure, Gas Siphoning, Dicke Titten, Raclette,
Sauna, Noise Complaint),
come as triples only for the last place, 12 % of the time. A triple shows a thicker
orange ring round its button and its uses left.

## Summary table

| Item | Type | Damage | Duration / lifetime | Counters |
| --- | --- | --- | --- | --- |
| Volunteers | Homing projectile | 35 | 6 s | Dildo, Drill, Glue, sharp turn |
| Jigsaw | Melee buff (both sides and ahead) | 30 per target | 4 s | Don't ride alongside or just ahead |
| Flour | Self boost | 0 | 2.5 s | - |
| Electric Drill | Bit on the bow 3 s, then a straight projectile | 28 rammed, 42 shot | 3 s + 1400 px | Keep off its bow, dodge sideways, Dildo |
| Glue | Area trap | 0, slows a lot | 15 s / 3 boats | Drive around it, Flour |
| Silicone Gun | Straight projectile, makes glue | 0, slows a lot | 900 px, 2 shots | Dodge sideways, Dildo |
| Fake Crate | Hidden trap | 30 | 40 s | Spot it, Drill, Dildo |
| Beer Crate | Heal | heals 50 % hull | on use | - |
| Magic Mushrooms | Shrinks and slows those ahead, speeds up those behind, pulls crates | 0 | 10 s | - |
| Electrical Failure | Opponents' controls stuck | 0 (a crash costs) | 3.2 s | - |
| Ultimate Raclette | 3 straight shots + a trap, cheese on the screen | 45 + 2 x 26 | 1300 px, cheese 12 s | Dodge, Dildo, drive round the cheese |
| Clogged Toilet | Trail of smoke, damage over time | 10 per second | 3 s trail, 9 s each cloud | Drive round it |
| Kärcher | Sideways push on both sides | 24 (when they hit the bank) | 3.5 s | Stay out of reach, steer away |
| Dicke Titten | Solid obstacle in front of every opponent | 40 | 0.55 s fall + 9 s | Dodge |
| Giant Black Dildo | Melee buff (front) | 16 per target | 5 s | Stay out of its way |
| Nail Gun | 3 straight shots | 3 x 13 | 1100 px | Dodge sideways |
| Gas Siphoning | Opponents lose thrust and stop | 0 | 3 s | - |
| Tugboat | Towed along the line, faster | 0 | 4 s | - |
| Beer Dispenser | Full heal + a shield for the next hit | heals 100 % | until hit (45 s) | - |
| Vacuum Cleaner | Pulls boats ahead back towards you | 0 | 3 s | Be far away |
| Sauna | Opponents can't see (steam) | 0 | 5 s | Follow the boat that brought it |
| Noise Complaint | A police boat after every opponent | 15 per rocket, stopped 3 s | 8 s chase | Dodge the rockets |
| Lazy Volunteers | 3 floating couches behind, slow like swimmers | 0, slows | 25 s | Go through the gaps |
| Painting Workshop | Trail of paint, paint on the screen | 0 | 3 s trail, 10 s each splash | Drive round it |

## Who gets what: position-based odds

The item from a crate depends on the racer's **position** at the moment the
crate is broken. **The leader gets the weakest items, the back gets the strongest**:
leaders mostly draw beer, the dildo and a few traps, never the big boosts; the last boats
get most of the Volunteers and the Powder, the Tugboat, Dicke Titten and Gas Siphoning. The weights
are per position (1st to 4th); the item is drawn at random using them. The items that
hit every opponent at once (Electrical Failure, Raclette, Gas Siphoning, Noise Complaint)
go only to the back two positions; the Sauna also reaches 2nd now and then. The two new traps
dropped behind (Lazy Volunteers, Painting Workshop) mostly go to the front. Leaders used to get mostly traps to drop behind (glue, fake crates,
the toilet), which is how they kept the lead: they get half as many now.

| Item | 1st | 2nd | 3rd | 4th |
| --- | --- | --- | --- | --- |
| Volunteers | 4 | 16 | 21 | 22 |
| Jigsaw | 8 | 12 | 11 | 8 |
| Flour | 4 | 10 | 17 | 23 |
| Electric Drill | 14 | 15 | 12 | 8 |
| Glue | 11 | 9 | 5 | 2 |
| Silicone Gun | 5 | 10 | 10 | 8 |
| Fake Crate | 11 | 9 | 4 | 2 |
| Beer Crate | 18 | 10 | 8 | 6 |
| Magic Mushrooms | 0 | 1 | 1 | 1 |
| Electrical Failure | 0 | 0 | 3 | 6 |
| Ultimate Raclette | 0 | 0 | 3 | 6 |
| Clogged Toilet | 9 | 8 | 4 | 2 |
| Kärcher | 3 | 8 | 9 | 7 |
| Dicke Titten | 0 | 2 | 4 | 7 |
| Giant Black Dildo | 16 | 9 | 4 | 2 |
| Nail Gun | 6 | 12 | 11 | 8 |
| Gas Siphoning | 0 | 0 | 3 | 6 |
| Tugboat | 0 | 2 | 6 | 9 |
| Beer Dispenser | 3 | 6 | 7 | 7 |
| Vacuum Cleaner | 0 | 5 | 8 | 8 |
| Sauna | 0 | 2 | 4 | 6 |
| Noise Complaint | 0 | 0 | 3 | 6 |
| Lazy Volunteers | 10 | 8 | 4 | 2 |
| Painting Workshop | 9 | 9 | 6 | 3 |

Every item has a **power** rating (`ITEM_POWER` in `src/data/items.ts`: Electrical
Failure, Raclette, Gas Siphoning and Noise Complaint 10, Mushrooms, Dicke Titten and Tugboat 9,
Silicone Gun, Vacuum Cleaner and Sauna 8, Beer Dispenser 7, Volunteers 7, Jigsaw, Powder, Drill, Glue, Kärcher and Nail Gun 6,
Beer and Painting Workshop 5, Fake Crate, Toilet and Lazy Volunteers 4, Dildo 3). The average power of a draw is about **5.1 for 1st,
5.9 for 2nd, 6.6 for 3rd and 7.2 for 4th** (before the better versions, which only add
to the back), and tests check that it rises from the front to the back, that the
mushroom stays the rarest item in every column, and that 1st place never gets the
ultimate items or the catch-up items.

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
  | 'karcher';

interface ItemInfo {
  id: ItemId;
  uses: number;            // 1 for most, 2 for the silicone gun (3 in a better version)
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
