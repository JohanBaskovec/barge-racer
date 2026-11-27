# Game design

## Concept

Barge Racer is a light-hearted, top-down arcade racer on water. Big, slow
working boats race fast, flimsy pleasure boats along canals, rivers and
harbours. Floating crates hand out absurd weapons. The tone is slapstick:
nobody gets hurt, boats spin, sputter, sink with a comic *bloop* and pop back
up a moment later.

Inspirations: kart racers (item crates, position-based item luck, homing
projectiles) combined with the weighty, drifting feel of boats on water.

## Target platforms

- Desktop browsers (Chrome, Firefox, Safari, Edge), played with a mouse.
- Mobile browsers (iOS Safari, Android Chrome), played with one finger, in
  landscape. Portrait shows a "please rotate" overlay.
- Target 60 fps on a mid-range phone from the last 4 years.

## Core loop

1. Pick a boat.
2. Pick a race (single track) or a cup (several tracks).
3. Race 3 opponents for a fixed number of laps.
4. Drive through crates to get an item; use it to hit opponents or speed up.
5. See the results, earn cup points, go to the next race or back to the menu.

## Camera and view

- Top-down view with the camera following the player's boat, a little ahead of
  it in the direction of travel so you can see what is coming.
- The camera zooms out slightly at high speed.
- A minimap in a corner shows the track outline and the 4 racers as dots.

## Race rules

- **4 racers**: 1 player and 3 AI. The opponents use boats different from the
  player's when possible.
- **Laps**: 3 per race by default; each track can override it.
- **Start**: a staggered grid behind the start line. A "3, 2, 1, GO!"
  countdown; throttle before "GO" is ignored. Hitting full throttle exactly on
  "GO" (within 0.25 s) gives a short start boost.
- **Checkpoints**: each track has ordered invisible checkpoint gates. A lap only
  counts if all gates were crossed in order, which stops shortcuts across land
  and driving backwards over the line.
- **Ranking during the race**: by laps completed, then checkpoints passed, then
  distance along the track's centre line to the next checkpoint (see
  [Tracks](tracks.md#progress-and-ranking)).
- **Finish**: when the player crosses the line on the last lap, the result is
  locked. The AI racers still on the track get their finish time estimated from
  their current progress and average speed, so the player does not have to wait.

## Hull and damage

Every boat has a **hull** value (hit points), set by the boat's `hull` stat
(see [Boats](boats.md)).

- Items and some hazards deal damage to the hull.
- Each hit also causes a **hit reaction**: the boat spins out for a short time
  and loses most of its speed. Heavier boats spin for less time.
- After a hit the boat is **invulnerable for 1.5 s** (flashing), so it can't be
  hit again and again.
- The hull **slowly repairs**: 2 points per second, starting 3 s after the last
  hit.
- When the hull reaches 0, the boat **sinks**: it goes under for 2 s, then
  resurfaces at the nearest point on the centre line with full hull and 3 s of
  invulnerability. Its item is kept. Sinking is the "big" penalty; spinning out
  is the small one.
- Low hull is shown on the boat: smoke at 50 %, smoke and sparks at 25 %.

## Collisions

- **Boat against boat**: the boats bounce off each other. The heavier boat is
  pushed less (impulse split by mass). Collisions alone do no hull damage,
  except with the Jigsaw (see [Items](items.md)).
- **Boat against bank**: the boat slides along the bank and loses speed
  depending on the impact angle. A head-on impact does a little damage (5).
- **Boat against floating obstacles** (logs, buoys, ice floes): like a bank, but
  some obstacles can be pushed.

## Items

Crates sit in rows across the track. Driving through one gives a random item
if you don't already hold one. A used crate respawns after 4 s. Each racer
holds **one item at a time**. The full item list and the luck rules are in
[Items](items.md):

| Item | In one line |
| --- | --- |
| Volunteers | Little people thrown at the racer ahead; they home in on it |
| Jigsaw | A saw blade on the bow for a few seconds; damages whoever you ram |
| White Powder | A short, strong speed boost |
| Electric Drill | A drill bit fired straight ahead |
| Glue | A puddle dropped behind you that slows anyone driving through it |

## Race modes

| Mode | Description |
| --- | --- |
| **Single Race** | Pick a boat and an unlocked track, race once. |
| **Cup** | 4 tracks in a row against the same 3 opponents. Points per race: 10 / 6 / 3 / 1. Highest total wins the cup; ties broken by the last race. |
| **Time Trial** *(later)* | Alone on the track, no items, best lap and best total time saved locally. Ghost replay is a stretch goal. |

## Difficulty

Three levels, chosen before a race or cup:

| Level | AI top speed | AI item use | Rubber-banding |
| --- | --- | --- | --- |
| Pond | 90 % of their boat's stats | Slow to react, often misses | Strong (helps the player) |
| River | 100 % | Normal | Medium |
| Ocean | 104 % | Fast, aims well | Weak |

See [AI](ai.md) for details.

## Progression

Kept small for the first version and stored in `localStorage`:

- At the start, 2 tracks and 4 boats are unlocked.
- Finishing a race unlocks the next track for Single Race.
- Winning a cup (any difficulty) unlocks the next cup and one boat; winning
  both cups on Ocean unlocks the last boat (see [Boats](boats.md#unlock-order)).
- Best times per track are saved.

No accounts, no server, no purchases.

## Screens

1. **Title**: logo, "Tap to start". Unlocks audio on mobile (first user gesture).
2. **Main menu**: Single Race, Cup, Options.
3. **Boat select**: carousel of boats with a stat chart, locked boats shown as
   silhouettes.
4. **Track / cup select**: thumbnails of the track layout, best time, lock state.
5. **Race**: the game itself with the HUD.
6. **Pause**: Resume, Restart, Quit. Opens with the pause button or `Esc`, and
   automatically when the page loses focus.
7. **Results**: finishing order, times, points (cup), Continue / Retry / Menu.
8. **Options**: music and sound volume, steering mode (see
   [Controls](controls.md)), left-handed layout, reduced screen shake.

## HUD (in race)

- Top left: position (`2nd / 4`) and lap (`Lap 2/3`).
- Top right: race time and minimap.
- Bottom right (bottom left in left-handed mode): **item slot**, a large round
  button that shows the held item and fires it when tapped.
- Hull bar above the player's boat, only shown after taking damage.
- Short pop-up texts: "Hit!", "Sunk!", "Boost!", "Final lap!".

## Audio

- One music loop per track, plus menu and results themes.
- Sound effects: engine (pitch follows speed, one sound per boat class), water
  splash, bank scrape, crate pickup, item roulette, each item's use and hit
  sound, volunteers shouting "Wheee!", sink *bloop*, countdown beeps, finish
  horn.

## Tone and content

The game is cartoonish and non-violent in presentation. The volunteers are
cheerful, wear life vests, and after hitting a boat they bob in the water and
wave, or swim back to shore. The White Powder is a cartoon gag, presented as an
unlabelled bag of white powder with sparkles; the boost is the joke, and the
game never shows it being consumed.
