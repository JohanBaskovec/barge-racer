# Boats

Every boat is a set of stats on top of the same physics model. Picking a boat
is picking a play style: tough and heavy, or fast and fragile.

## Stats

Each stat is rated **1 to 10** for the boat select screen. The physics uses the
derived values in the second table.

| Stat | What it does |
| --- | --- |
| **Speed** | Top speed on open water |
| **Acceleration** | How quickly the boat reaches its top speed |
| **Handling** | Turn rate, and how much the boat drifts sideways in turns |
| **Weight** | Mass: pushes others in collisions, shorter spin-outs, but slower to accelerate and turn |
| **Hull** | Hit points before sinking |

Every boat has the same budget: **speed counts double** (`2 x speed + accel + handling
+ hull = 32`), and weight counts for nothing, as it is good (collisions, spin-outs) and
bad (acceleration, turning) at once. Top speed decides most races on canals, so it
costs the most, and the spread of top speeds is kept small (367 to 387 px/s).

Two more rules keep the field together:

- **A damaged boat is slower**: up to 20 % off its top speed with no hull left, in
  proportion to the damage (`TUNING.damageSlow`). A tough hull pays; a fragile fast boat
  that takes a couple of hits is caught.
- **Catch-up**: a boat behind the leader gets more top speed, nothing within 200 px of
  the leader, up to +12 % from 1800 px behind (`TUNING.catchUp`), for players and AI
  alike (online too: the server sends it with each boat).

Boats are balanced with `npx vite-node scripts/balance.ts [races] [track]`: AI-only
races, every boat driven by the same AI, with items. It prints each boat's win rate (25 %
is a fair share with four boats a race), how often the lead changes and the gaps at the
finish. Before this balance pass the speedboat won 83 % of its races on Lock & Load and
four boats almost never won, leaders won by 8 s and the lead changed 1.5 times a race;
now every boat wins between 15 and 35 %, the lead changes 2.3 times a race and the gap
between first and second is about 2.6 s.

## How the boats are drawn

Every boat is drawn in code, seen from above, bow to the right. There are no image files.

- **Cabourg** has its own drawing (`src/view/peniche.ts`), redrawn from an aerial photo.
- **The other seven** are drawn in `src/view/boatArt.ts` with the browser's 2D canvas (curves,
  gradients, soft shadows), at three times their game size so they stay sharp when zoomed. Each
  is two layers:
  - the **paint**, which takes the racer's colour: the hull for most boats, the cabin roof of the
    Narrowboat, the canopy of the Party Pontoon. It is drawn in white and greys, and the game
    tints it, so grey becomes a darker shade of the racer's colour;
  - the **details** on top, in their own colours: the Coal Barge's coal and wheelhouse, the
    Tugboat's funnel, fenders and winch, the Narrowboat's flower boxes, chimney and solar panel,
    the speedboat's cockpit and outboards, the pontoon's sofas, drinks and fairy lights, the Fire
    Boat's water cannons and hose reels, the Hovercraft's skirt and fans.
- Shading is the same on both sides of a boat, never from one sun: boats turn in every
  direction, and a painted-on sun would turn with them.

## Roster

### Cabourg (default)
*A real péniche moored on the canal, redrawn from an aerial photo: two long roofs over the holds with a lawn between them, a white wheelhouse and a wooden stern deck.*

| Speed | Accel | Handling | Weight | Hull |
| --- | --- | --- | --- | --- |
| 6 | 6 | 6 | 8 | 8 |

Play style: steady. First in the list and the default boat: heavy and tough, forgiving for
beginners. At 150 x 25 px it is by far the longest boat (the real one is about 38 x 5 m), so
it is hard to get round and its Dildo reaches far. It is drawn in its own colours; only its
gunwale stripes and stern flag take the racer's colour.

### Coal Barge
*A long, black steel barge with a pile of coal. Slow to start and impossible to stop.*

| Speed | Accel | Handling | Weight | Hull |
| --- | --- | --- | --- | --- |
| 7 | 5 | 5 | 10 | 8 |

Play style: bully. Shrugs off hits, shoves everyone aside, but struggles on
twisty tracks. Long hull, so its Dildo reaches far.

### Tugboat
*Short, round and stubborn. Built to push things around.*

| Speed | Accel | Handling | Weight | Hull |
| --- | --- | --- | --- | --- |
| 5 | 9 | 6 | 8 | 7 |

Play style: brawler. Great acceleration out of spin-outs and corners, heavy
enough to win most shoves. Low top speed.

### Narrowboat
*A colourful canal boat with flower pots on the roof.*

| Speed | Accel | Handling | Weight | Hull |
| --- | --- | --- | --- | --- |
| 6 | 6 | 8 | 4 | 6 |

Play style: precise. Turns on a coin, very little drift. Good for beginners
and twisty canals.

### Cigarette Speedboat
*A long, loud racing powerboat. Fast, light and made of hope.*

| Speed | Accel | Handling | Weight | Hull |
| --- | --- | --- | --- | --- |
| 8 | 6 | 5 | 2 | 5 |

Play style: glass cannon. Highest top speed, wide drifting turns, sinks after a
couple of hits.

### Party Pontoon
*A flat pontoon with a barbecue and a disco ball.*

| Speed | Accel | Handling | Weight | Hull |
| --- | --- | --- | --- | --- |
| 7 | 6 | 6 | 5 | 6 |

Play style: all-rounder. No weakness, no strength. Its passengers cheer when it
uses an item.

### Fire Boat
*A red harbour fire boat with water cannons.* (unlockable)

| Speed | Accel | Handling | Weight | Hull |
| --- | --- | --- | --- | --- |
| 6 | 6 | 6 | 7 | 8 |

Special: Glue puddles touched by the Fire Boat are washed away immediately.

### Hovercraft
*Rides on a cushion of air. Not technically a boat. Don't tell anyone.* (unlockable)

| Speed | Accel | Handling | Weight | Hull |
| --- | --- | --- | --- | --- |
| 6 | 8 | 4 | 4 | 8 |

Special: slides a lot (very low sideways grip), but ignores shallow water and other
boats' wakes, and can cut briefly over sandbanks (not solid banks).

Weight also decides wakes (see [Game design](game-design.md#traffic-wakes-and-slipstream)):
heavy boats' wakes push light boats sideways, and heavy boats hardly feel anyone's.

### Unlock order

At the start: Cabourg, Coal Barge, Tugboat, Narrowboat, Party Pontoon.
Winning the Canal Cup unlocks the Cigarette Speedboat, winning the Open Water Cup
unlocks the Fire Boat, and winning both cups on Ocean difficulty unlocks the
Hovercraft.

## Physics model

Boats use a custom, simple 2D boat model instead of a full physics engine. It
runs at a fixed time step of **1/60 s** (see
[Architecture](architecture.md#game-loop)).

State per boat: position, velocity (2D), heading, angular velocity.

Every step:

1. **Steering**: turn `heading` towards `intent.desiredHeading`, limited to
   `turnRate`. The turn rate is reduced at very low speed (boats don't turn on
   the spot) and multiplied by active effects (Glue).
2. **Thrust**: add `heading direction * accel * throttle * dt` to velocity.
3. **Water drag**: split velocity into a forward part (along the heading) and a
   sideways part.
   - Forward part: `v -= v * forwardDrag * dt`. `forwardDrag` is chosen so
     the boat settles at `topSpeed` at full throttle.
   - Sideways part: `v -= v * lateralGrip * dt`. High grip = carves through
     turns; low grip = drifts.
4. **Effects**: apply multipliers from active effects (boost, glue, spin-out).
5. **Integrate**: `position += velocity * dt`.
6. **Collisions**: banks, obstacles, other boats (see
   [Game design](game-design.md#collisions)).

### From ratings to physics values

Ratings are mapped linearly between a minimum and a maximum. Starting values:

| Physics value | Rating 1 | Rating 10 | Comes from |
| --- | --- | --- | --- |
| `topSpeed` (px/s) | 340 | 400 | Speed, then x catch-up and x the damage slowdown |
| `accel` (px/s²) | 120 | 420 | Acceleration, then divided by `0.85 + 0.015 * weight` |
| `turnRate` (rad/s) | 1.6 | 3.6 | Handling, then divided by `0.9 + 0.01 * weight` |
| `lateralGrip` (1/s) | 1.5 | 6.0 | Handling |
| `mass` | 1.0 | 4.0 | Weight |
| `maxHull` | 60 | 150 | Hull |
| spin-out time multiplier | 1.2 | 0.6 | Weight |

Specials (Fire Boat, Hovercraft) are flags on the boat definition, read by the
systems that care about them.

### Boat data shape

```ts
interface BoatDef {
  id: string;              // 'coalBarge'
  name: string;            // 'Coal Barge'
  description: string;
  ratings: { speed: number; accel: number; handling: number; weight: number; hull: number };
  size: { length: number; width: number }; // px, used for the collision capsule and the Dildo's cone
  sprite: string;          // texture key
  engineSound: 'diesel' | 'outboard' | 'turbine' | 'fan';
  specials?: { washesGlue?: boolean; hover?: boolean };
  unlockedByDefault: boolean;
}
```

Boats collide as **capsules**: a segment along the heading with round ends, as long and
as wide as the hull (`halfLen` and `capRadius` in `BoatStats`). Boat-to-boat contacts use the
closest points of the two segments; items (crates, volunteers, drills, glue balls, fake crates)
touch a boat anywhere along its hull. Against the banks the middle and both ends of the hull are
checked, the ends taken a little inside the hull so a long boat turning across a narrow canal
isn't wedged between both banks. `radius = (length + width) / 4` is kept as a rough size for AI
spacing and item ranges. Boats that have just been hit pass through each other (see
[Game design](game-design.md#collisions)).

**Current state:** all boats are unlocked from the start; the unlock rules above
are not implemented yet.

## Art direction

- Top-down sprites, around 96 px long for the longest boat at 1x, drawn at 2x
  for high-density screens.
- Each boat has: hull sprite, a small driver, a wake emitter at the stern, and
  4 colour tints so the 4 racers can be told apart even on the same boat type.
- Damage states as overlays (scratches, smoke) rather than separate sprites.
