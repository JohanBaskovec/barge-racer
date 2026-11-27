# Game design

## Concept

Fast & Fluvial is a light-hearted, top-down arcade racer on water. Big, slow
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
  except with the Jigsaw (see [Items](items.md)). **A boat that has just been hit
  (blinking, spinning) or has just respawned passes through other boats**, so it
  can't be bounced around or boxed in while it recovers, and boats that have
  finished a point-to-point race do the same.
- **Boat against bank**: the boat slides along the bank and loses speed
  depending on the impact angle. A head-on impact does a little damage (5).
- **Boat against floating obstacles** (logs, buoys, ice floes): like a bank, but
  some obstacles can be pushed.

## Items

Crates sit in rows across the track. Driving through one gives a random item
if you have a free slot. A used crate respawns after 4 s. Each racer holds
**two items at once**. Leaders draw the weakest items and the back of the field
the strongest. The full item list and the luck rules are in [Items](items.md):

| Item | In one line |
| --- | --- |
| Volunteers | Little people thrown at the racer ahead; they home in on it |
| Jigsaw | A saw blade on the bow for a few seconds; damages whoever you ram |
| White Powder | A short, strong speed boost |
| Electric Drill | A drill bit fired straight ahead |
| Glue | A puddle dropped behind you that slows anyone driving through it |
| Silicone Gun | Shoots glue ahead of you: it lands on the boat it hits |
| Fake Crate | A trap that looks like a real crate and hurts whoever hits it |
| Beer Crate | Heals half your hull on the spot (never takes a slot) |
| Magic Mushrooms | Does nothing but make your screen psychedelic; the rarest item |

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

1. **Title**: logo, **Play**, **Play online** and **Options** buttons, language and fullscreen
   buttons, the version number, and boats racing along a canal at the bottom. The first press
   unlocks audio on mobile and, on phones and tablets, goes fullscreen.
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

All sound is **synthesised in the browser** with the Web Audio API (`src/audio/`):
no audio files to download or license, and engines can follow the boat exactly.

- **Music**: a small step sequencer plays loops written as text in
  `src/audio/music.ts`. Menu theme (calm, C major), race theme (Lock & Load),
  the same tune lower with a heavier beat (Industrial Estuary), a swampy blues
  (Bayou Bends) and a **musette waltz on the accordion** for the Canal de Reims.
  The results screen plays a win or lose jingle, then the menu theme.
- **Engines**: one voice per boat, its pitch and loudness following speed and
  throttle. A chugging diesel for the barges, tug, canal boat and fire boat, an
  outboard buzz for the speedboat and the pontoon, a fan whine for the hovercraft.
  Opponents' engines fade with distance and are panned left or right.
- **Effects** (`src/audio/sfx.ts`): countdown beeps and GO, crate crack, roulette
  ticks and ding, "wheee!" for volunteers, jigsaw buzz (a loop while it runs),
  white-powder whoosh, drill whine, glue squelch, silicone squirt, fake-crate
  drop and its "boing" trap, beer pop and fizz, mushroom chord, hits, bank
  scrapes, bumps, splashes, sinking bloop and bubbles, respawn, lap chime,
  final-lap fanfare, a ship's horn at the finish, UI clicks.
- Effects away from the camera are quieter and panned. Pausing silences engines
  and lowers the music. A compressor on the output keeps loud moments from
  clipping. Phaser unlocks audio on the first tap and suspends it when the tab is
  hidden.

## Options

Options screen (from the title screen or the pause menu), saved in the browser:
music and sound-effects volume, **left-handed** layout (item buttons on the
left), **auto-fire** (items are fired when the AI would fire them) and **reduce
screen shake** (also turns off hit pauses). There is no steering assist.

## Tone and content

The game is cartoonish and non-violent in presentation. The volunteers are
cheerful, wear life vests, and after hitting a boat they bob in the water and
wave, or swim back to shore. The White Powder is a cartoon gag, presented as an
unlabelled bag of white powder with sparkles; the boost is the joke, and the
game never shows it being consumed.
