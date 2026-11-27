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

The ratings should add up to about **30** for every boat so that no boat is
strictly better than another. Boats are balanced by testing lap times on each
track with no items.

## Roster

### Coal Barge
*A long, black steel barge with a pile of coal. Slow to start and impossible to stop.*

| Speed | Accel | Handling | Weight | Hull |
| --- | --- | --- | --- | --- |
| 5 | 3 | 3 | 10 | 9 |

Play style: bully. Shrugs off hits, shoves everyone aside, but struggles on
twisty tracks. Long hull, so its Jigsaw cone reaches far.

### Tugboat
*Short, round and stubborn. Built to push things around.*

| Speed | Accel | Handling | Weight | Hull |
| --- | --- | --- | --- | --- |
| 4 | 8 | 5 | 8 | 5 |

Play style: brawler. Great acceleration out of spin-outs and corners, heavy
enough to win most shoves. Low top speed.

### Narrowboat
*A colourful canal boat with flower pots on the roof.*

| Speed | Accel | Handling | Weight | Hull |
| --- | --- | --- | --- | --- |
| 5 | 6 | 9 | 4 | 6 |

Play style: precise. Turns on a coin, very little drift. Good for beginners
and twisty canals.

### Cigarette Speedboat
*A long, loud racing powerboat. Fast, light and made of hope.*

| Speed | Accel | Handling | Weight | Hull |
| --- | --- | --- | --- | --- |
| 10 | 8 | 7 | 2 | 3 |

Play style: glass cannon. Highest top speed, wide drifting turns, sinks after a
couple of hits.

### Party Pontoon
*A flat pontoon with a barbecue and a disco ball.*

| Speed | Accel | Handling | Weight | Hull |
| --- | --- | --- | --- | --- |
| 6 | 7 | 7 | 5 | 5 |

Play style: all-rounder. No weakness, no strength. Its passengers cheer when it
uses an item.

### Fire Boat
*A red harbour fire boat with water cannons.* (unlockable)

| Speed | Accel | Handling | Weight | Hull |
| --- | --- | --- | --- | --- |
| 6 | 5 | 5 | 7 | 7 |

Special: Glue puddles touched by the Fire Boat are washed away immediately.

### Hovercraft
*Rides on a cushion of air. Not technically a boat. Don't tell anyone.* (unlockable)

| Speed | Accel | Handling | Weight | Hull |
| --- | --- | --- | --- | --- |
| 9 | 8 | 4 | 4 | 5 |

Special: slides a lot (very low sideways grip), but ignores shallow water and
can cut briefly over sandbanks (not solid banks).

### Unlock order

At the start: Coal Barge, Tugboat, Narrowboat, Party Pontoon.
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
| `topSpeed` (px/s) | 260 | 440 | Speed |
| `accel` (px/s²) | 120 | 420 | Acceleration, then divided by `0.7 + 0.03 * weight` |
| `turnRate` (rad/s) | 1.6 | 3.6 | Handling, then divided by `0.8 + 0.02 * weight` |
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
  size: { length: number; width: number }; // px, used for the collision capsule and Jigsaw cone
  sprite: string;          // texture key
  engineSound: 'diesel' | 'outboard' | 'turbine' | 'fan';
  specials?: { washesGlue?: boolean; hover?: boolean };
  unlockedByDefault: boolean;
}
```

Boats collide as **capsules** (or circles for short boats), sized from
`size`. A long barge is harder to get around than a short tug.

## Art direction

- Top-down sprites, around 96 px long for the longest boat at 1x, drawn at 2x
  for high-density screens.
- Each boat has: hull sprite, a small driver, a wake emitter at the stern, and
  4 colour tints so the 4 racers can be told apart even on the same boat type.
- Damage states as overlays (scratches, smoke) rather than separate sprites.
