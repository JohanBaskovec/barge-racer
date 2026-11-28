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
| White Powder | On a long straight, or right after a spin-out to catch up |
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
