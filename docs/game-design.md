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
  except with the Jigsaw or the Dildo (see [Items](items.md)). **A boat that has just been hit
  (blinking, spinning) or has just respawned passes through other boats**, so it
  can't be bounced around or boxed in while it recovers, and boats that have
  finished a point-to-point race do the same.
- **Boat against bank**: the boat slides along the bank and loses speed
  depending on the impact angle. A head-on impact does a little damage (5).
- **Boat against a barge** (traffic, below): like a bank that moves. A head-on bump
  does a little damage (8). A boat met head-on by a barge's bow is shoved towards the
  middle of the canal, not pushed along in front of it.
- **Boat against floating obstacles** (logs, buoys, ice floes): like a bank, but
  some obstacles can be pushed.

## Traffic, wakes and slipstream

- **Traffic**: working barges go up and down every canal, both ways, each keeping to
  its side (about one every 400 m each way, one every 600 m on the long Reims canal).
  They are slow (8 to 10 km/h at the game's scale) and immovable: you overtake the ones
  going your way and dodge the ones coming at you. Projectiles stop against them, and a
  boat a Kärcher pushes into one crashes as into the bank. A barge sounds its horn as it
  passes close to you. They carry cargo under green tarpaulins, sand, or oil, with the
  family's car on the stern deck and the washing out.
- **Barges help the boats behind**: now and then a barge tosses a crate ahead of a
  nearby boat that **isn't leading** and has a free slot ("A crate for you!"). Never to
  the leader, never where the leader is close, and **the leader can't pick these crates
  up** at all. A boat gets at most one every 7 s, a barge throws one every 9 s at most.
  It is meant for beginners who fall behind: more items, and they are the good ones
  the back of the field draws.
- **Wakes**: a moving boat leaves a V behind it. A boat on one of the V's arms is pushed
  outward, sideways: harder the heavier and faster the maker and the lighter the
  receiver. A speedboat gets thrown about behind Cabourg or a barge; a coal barge hardly
  notices a speedboat. Heavy boats show the arms of their V on the water. The Hovercraft
  floats over wakes.
- **Slipstream**: straight behind another boat (within about 28 m), in line with it and
  both going fast, a boat gets a little faster (top speed x 1.1, acceleration x 1.35)
  after half a second there, shown by streaks of air along its sides. Leave it at the
  right moment to overtake. There is no push in the middle of a wake, so a light boat
  can draft behind a heavy one as long as it stays in line.

## Items

Crates sit in rows across the track. Driving through one gives a random item
if you have a free slot. A used crate respawns after 4 s. Each racer holds
**two items at once**. Leaders draw the weakest items and the back of the field
the strongest. The full item list and the luck rules are in [Items](items.md):

| Item | In one line |
| --- | --- |
| Volunteers | Little people thrown at the racer ahead; they home in on it |
| Jigsaw | Saw blades out of each side and the bow for a few seconds; cuts whoever is alongside or just ahead |
| Flour | A short, strong speed boost |
| Electric Drill | A big drill bit on your bow for 3 s (ram with it), then fired straight ahead |
| Glue | A puddle dropped behind you that nearly stops anyone driving through it: worse than a hit |
| Silicone Gun | Shoots glue ahead of you: it lands on the boat it hits |
| Fake Crate | A trap that looks like a real crate and hurts whoever hits it |
| Beer Crate | Heals half your hull when you drink it |
| Magic Mushrooms | Everyone ahead shrinks and slows right down, everyone behind speeds up, crates fly to you; the rarest item |
| Electrical Failure | Every opponent loses their controls for a few seconds |
| Ultimate Raclette | A potato and two slices of ham ahead, melted cheese behind, cheese over the victims' screens |
| Clogged Toilet | A trail of toxic smoke behind you that hurts everyone in it, you too |
| Kärcher | Water jets on both sides push boats alongside into the bank |
| Dicke Titten | A giant pair drops in front of every opponent: dodge or crash into them |
| Giant Black Dildo | On your bow for a few seconds: ram boats to hurt them (a little) |
| Nail Gun | Three quick nails, straight ahead |
| Gas Siphoning | Every opponent runs out of fuel and stops for 3 s |
| Tugboat | A tug tows you along the canal, fast, for a few seconds |
| Beer Dispenser | Repairs the hull in full; a head of foam takes the next hit |
| Vacuum Cleaner | Sucks the boats ahead back towards you |

Every item can also come as its **better version, with three uses**: never for the
leader, more often the further back you are.

## Hazards

Things that come by themselves (`src/race/hazards.ts`, drawn by `src/view/hazardView.ts`),
seeded like the rest of the race, so they run on the server too:

- **Police (the leader only).** A leader more than 1400 px ahead of the second boat for 2 s
  is warned for **speeding** ("SPEEDING!" on its screen, "Police after X!" on the
  others'). 2 s later a police boat with flashing lights turns up behind it and chases it
  for 15 s, its siren wailing, firing a **rocket** every 1.3 s (aiming where the boat will
  be, give or take; a flame trail shows it coming). A rocket explodes on the first thing it
  meets: a boat, the bank or a barge (fire, smoke, a shock ring, a bang). Only a rocket that
  hits the chased leader **pulls it over and fines it** ("FINED!", "€135 fine for
  speeding"): the police boat parks alongside, in the way, and the leader is stopped for
  3 s while the ticket is written. A rocket that hits another boat only hurts it (15 hull,
  like the leader). No hit, no fine: after 15 s the police leave anyway, and don't come
  back for 30 s. A beer dispenser's foam takes a rocket whole.
- **Anglers (the leader only).** About every 20 s an angler sits on a bank 720 px ahead
  of the leader and casts a line across 55 % of the canal (a float marks its end). Caught
  on it, the leader is dragged towards the bank for up to 1.4 s; hitting the bank while
  hooked is a crash (20 hull and a spin-out). Other boats pass through the line.
- **Birds, rowers and swimmers (everyone, the better placed the more often).** About every
  5 s a flock of ducks, a rowing four or a few swimmers appear 650 to 950 px ahead of a
  boat picked by position (weights 5, 3, 2, 1 from 1st to 4th). Rowers and swimmers move
  along the canal. Running into them makes them explode in blood, bits (and feathers),
  leaves a stain on the water and blood on the bow (swimmers and rowers scream), and slows the boat down (top speed
  x 0.7 for 1.3 s, and a jolt); no damage. The AI swerves round them now and then.
- **Set off by items.** A **Noise Complaint** sends a police boat after every opponent of its
  user ("NOISE COMPLAINT!"; a hit costs "€68 fine for noise"), several at once, each like the
  speeding police but chasing for 8 s. **Lazy Volunteers** drop floating couches that behave
  like swimmers. These run even where the other hazards are turned off.

With them, in AI races on Lock & Load, the lead changes hands about 4.4 times a race
(2.3 without) and the first two finish under 2 s apart; a race takes about 5 s longer.

## Race modes

| Mode | Description |
| --- | --- |
| **Single Race** | Pick a boat and a track, race once. |
| **Championship** | Every track with laps in a row (Lock & Load, Industrial Estuary, Bayou Bends, Champagne Hills) against the same 3 opponents. Points by place: 10 / 8 / 6 / 5 / 4 / 3 / 2 / 1. The grid of each race is set by the standings, **fewest points in front, the leader at the back**. Most points at the end wins; level on points, the better place in the latest race goes first. Online too (see [Multiplayer](multiplayer.md#rooms-and-lobby)). |
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
4. **Track select**: thumbnails of the track layout. A **Championship** button switches to the
   championship: its tracks are numbered and lit, the others faded, and the green button
   starts it.
5. **Race**: the game itself with the HUD.
6. **Pause**: Resume, Restart, Quit. Opens with the pause button or `Esc`, and
   automatically when the page loses focus.
7. **Results**: finishing order, times, and in a championship the points of each place, then
   **Standings**: the points of each race and the total, with the next race (or Give up); after
   the last race, the champion, New championship / Menu.
8. **Options**: music and sound volume, steering mode (see
   [Controls](controls.md)), left-handed layout, reduced screen shake.

## HUD (in race)

- Top left: position (`2nd / 4`) and lap (`Lap 2/3`).
- Top right: race time and minimap.
- Bottom right (bottom left in left-handed mode): **item slot**, a large round
  button that shows the held item and fires it when tapped.
- Hull bar above the player's boat, only shown after taking damage.
- Short pop-up texts: "Hit!", "Sunk!", "Boost!", "Final lap!".
- Top centre, left of pause: the **taunt** button (a speech bubble), see below.

## Taunts

Six phrases: *HONK HONK!*, *Bye bye!*, *Too slow!*, *Sorry, not sorry*, *Nice boat… NOT* and
*Cheers!* (`src/data/taunts.ts`). The taunt button opens them; the one picked appears in a
speech bubble over your boat for about 2.6 seconds (the honk also honks).

- **Online** everyone sees it over your boat, and in the lobby beside your name ("Taunt…" at
  the bottom of the list). The server passes on at most one taunt per player every 1.2 s.
- **AI boats taunt too**: one that overtakes you close by sometimes says *Bye bye!*, *Too slow!*
  or honks (at most every 7 s), and offline one answers your taunt now and then.

## Audio

All sound is **synthesised in the browser** with the Web Audio API (`src/audio/`):
no audio files to download or license, and engines can follow the boat exactly.

- **Music**: a small step sequencer plays loops written as text in
  `src/audio/music.ts`. Menu theme (calm, C major), race theme (Lock & Load),
  the same tune lower with a heavier beat (Industrial Estuary), a swampy blues
  (Bayou Bends), a quick **accordion galop** (Champagne Hills) and a **musette waltz on the
  accordion** for the Canal de Reims.
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
wave, or swim back to shore. The Flour is a cartoon gag, presented as an
unlabelled bag of flour with sparkles; the boost is the joke, and the
game never shows it being consumed.
