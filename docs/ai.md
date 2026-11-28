# AI opponents

The 3 opponents are driven by an `AIController` that outputs the same
`ControlIntent` as the player's input (see [Controls](controls.md)). The AI
does not cheat with physics: it drives the same boats with the same stats,
except for the difficulty speed multiplier and rubber-banding described below.

## Driving

### Racing line

Each track has a racing line computed at load time from the centre line: an
offset along the normal at each sample, smoothed so the boat cuts the inside of
corners. Each AI racer gets a small **personal lateral offset** (between -25 %
and +25 % of the half-width) so the three don't follow each other nose to tail.

### Steering

Every frame:

1. Look ahead along the racing line by a distance that grows with speed
   (`lookAhead = 120 + 0.8 * speed` px).
2. Set `desiredHeading` towards that look-ahead point.
3. Measure the curvature of the line ahead. If the turn ahead is sharper than
   the boat can make at its current speed, reduce throttle.
4. Add avoidance (below), then clamp.

### Avoidance

The AI casts a few short rays (forward, ±25°, ±50°) against:

- Banks and obstacles: steer away from the nearest hit.
- Glue puddles: steer around unless boosted.
- Other boats directly ahead: overtake on the side with more room.
- Incoming Drill bits in front: dodge sideways (chance depends on difficulty).

### Mistakes

To make the AI feel human, it sometimes:

- Picks a slightly wrong line through a corner.
- Reacts late to a hazard.
- Holds an item for too long.

The mistake rate depends on the difficulty level.

### Branches

At each branch, an AI picks the shortcut with a probability depending on
difficulty and its boat's handling (narrow, twisty shortcuts are avoided by
low-handling boats).

### Getting stuck

If an AI boat moves less than 20 px in 1.5 s while it should be driving, it
reverses for 0.8 s while steering away from the nearest bank, then retries.
After 4 s stuck, it is respawned at the nearest centre-line point like a
sinking boat, without the 2 s delay.

## Using items

| Item | When the AI uses it |
| --- | --- |
| Volunteers | When there is a racer ahead within 900 px of track distance, or right away if it's 1st (fired backwards at someone close behind) |
| Jigsaw | When a boat is alongside, close |
| Giant Black Dildo | When a boat is just ahead, roughly in front |
| Nail Gun | A boat in line ahead within 700 px (behind within 450 px: backwards) |
| Dicke Titten, Gas Siphoning | Not leading, with a boat ahead within 1800 px |
| Tugboat | Whenever it isn't leading, or just after a hit |
| Flour | On a long straight, or right after a spin-out to catch up |
| Electric Drill | When a boat is in a narrow cone in front (±6°) within 800 px, or backwards if someone is right behind |
| Glue | When it is 1st or 2nd and someone is within 400 px behind, preferably in a narrow section |

Each difficulty level adds a **reaction delay** before the AI uses an item it
could use: Pond 1.5–3 s, River 0.5–1.5 s, Ocean 0.2–0.6 s.

## Rubber-banding

To keep races close, the AI's top speed is adjusted by its distance to the
player:

- AI ahead of the player by more than 600 px of track distance: top speed x
  `(1 - strength)`.
- AI behind the player by more than 600 px: top speed x `(1 + strength)`.
- Between: interpolated.

| Difficulty | `strength` |
| --- | --- |
| Pond | 0.12 |
| River | 0.07 |
| Ocean | 0.03 |

Rubber-banding is turned off on the last half of the final lap so the finish
feels earned.

## Battles

In the [battle modes](game-design.md#battle-modes) there is no racing line to follow: the AI
picks a target (`battleTarget` in `src/control/AIController.ts`) and steers straight at it when it
is close along the loop (under 420 px), otherwise round the loop the short way. A moored barge in
the way bends the course round it, on the side the boat is already on (`roundBarges`). No
rubber-banding. Stuck recovery works as in a race.

- **Deathmatch** (and team deathmatch): a golden crate that is up within 1300 px (with a free
  slot); with no item, the nearest crate within 700 px; otherwise the nearest opponent, or a
  weaker one (less hull) a little further away.
- **Capture the flag**:
  - carrying the flag: home to its base;
  - an opponent has its flag: chase the thief;
  - its flag lies dropped: go and touch it (it goes home);
  - otherwise, one boat in two **guards**: goes for any opponent within 1000 px of its flag, or,
    empty-handed, arms itself from the crates near its base, or waits at the flag;
  - the others **attack**: escort a team-mate carrying the flag, take a golden crate within
    900 px, grab a crate within 450 px when empty-handed, then go for the other team's flag.
- **Items**: only opponents count (team-mates can't be hurt). Instead of "the boat ahead" and
  "chasing behind": volunteers when an opponent is in front within 1100 px; items that hit every
  opponent when some are within 900 px (or after 8 s); traps dropped behind when an opponent is
  close behind. Straight shots use the same checks as in a race (and get the aim assist).
- **Measuring the pace**: AI-only matches of every mode on both arenas, with the sinkings a
  minute, how long matches last, captures, flags taken, dropped and returned, and team wins. It
  is a short script over `RaceSimulation` (no screen) of the kind kept with the balance checks;
  the numbers in [Game design](game-design.md#battle-modes) come from it.

## Difficulty summary

| | Pond | River | Ocean |
| --- | --- | --- | --- |
| Speed multiplier | 0.90 | 1.00 | 1.04 |
| Line offset noise | High | Medium | Low |
| Drill dodge chance | 10 % | 35 % | 65 % |
| Item reaction delay | 1.5–3 s | 0.5–1.5 s | 0.2–0.6 s |
| Takes shortcuts | 10 % | 40 % | 80 % |
| Rubber-banding | 0.12 | 0.07 | 0.03 |

## Personalities (later)

Optional per-opponent personality on top of difficulty, for flavour:

- **Aggressive**: uses items earlier, steers into opponents with a Dildo.
- **Careful**: keeps the line, saves defensive items.
- **Chaotic**: random item timing, likes Glue.

## Debugging

With `?debug=1`, each AI shows its look-ahead point, racing line, avoidance
rays and current item intent as an overlay.
