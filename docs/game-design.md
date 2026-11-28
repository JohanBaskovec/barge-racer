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
| **Championship** | Races in a row against the same 3 opponents. You pick them on the championship screen: 1 to 8 races, any tracks (the same one several times if you like), in any order, 1 to 9 laps each, and for the Reims canal the stretch (start and finish, on the same stretch screen as a single race). By default: every track with laps, three laps each. Points by place: 10 / 8 / 6 / 5 / 4 / 3 / 2 / 1. The grid of each race is set by the standings, **fewest points in front, the leader at the back**. Most points at the end wins; level on points, the better place in the latest race goes first. Online too (see [Multiplayer](multiplayer.md#rooms-and-lobby)). |
| **Battle** | Deathmatch, team deathmatch or capture the flag on an arena, against AI boats (3 to 8 boats) or online. See [Battle modes](#battle-modes). |
| **Time Trial** *(later)* | Alone on the track, no items, best lap and best total time saved locally. Ghost replay is a stretch goal. |

## Battle modes

Played on the two [arenas](tracks.md#arenas), offline (Single player → Battle) or online (the
host picks the mode in the lobby). No laps: boats score. Catch-up boost, rubber-banding, police,
anglers and barge drops are off. Code: `src/race/battle.ts`; numbers in `BATTLE`.

| Mode | Teams | Wins | Time limit |
| --- | --- | --- | --- |
| **Deathmatch** | Every boat for itself | boats + 2 sinkings (8 for six boats), or the most when time runs out (level on points: fewer times sunk) | 4 min |
| **Team deathmatch** | Corsica against Brittany | 2.5 sinkings a boat for the team (15 for six boats, 10 for four) | 4 min |
| **Capture the flag** | Corsica against Brittany | 4 captures | 5 min |

- **A sinking scores** for the boat that last hit the one that sank, if that hit was less than
  6 s before (sinking on your own scores nothing).
- **Teams**: Corsica (red boats, the Moor's head flag) and Brittany (blue boats, the Gwenn-ha-Du).
  Every boat of a team has a ring of its colour round the hull and its team's flag (in a
  frame of the team's colour) flying over it. Each team has a **base**: a glowing ring on the
  water. Offline you pick your team; online each person picks a side in the lobby and AI boats
  fill in for the side with fewer boats.
- **No friendly fire**: nothing a team-mate does hurts, slows or blinds you. Items that hit
  "every opponent" (siphoning, blackout, sauna, stairs, noise complaint, Dicke Titten, Lost in
  Translation…) skip your team; homing volunteers only go for opponents; your team-mates'
  traps, smoke, glue, saws and jets let you through. A magic mushroom shrinks opponents ahead on
  points and speeds up everyone else on your team.
- **Items in an arena**:
  - There is no "boat ahead": volunteers home in on the nearest opponent in front (within
    1400 px); things that land in front of or behind a boat (Dicke Titten, stairs, lazy
    volunteers, ducks) go by **the way it is going** round the arena.
  - **Odds by the lead on points**, not by place (at 0-0 nobody leads): ahead (by a point, a
    capture, or 3 points in team deathmatch): the leader's weak items; level: the second
    column; a little behind: the third; far behind: the strongest.
  - Items hurt **1.6×** as much as in a race (fights end in sinkings rather than dents), and
    crates come back after 2.5 s instead of 4.
  - **Aim assist**: a shot (nails, silicone, raclette, the drill when it leaves the bow) fired
    within 17° of an opponent, closer than 1000 px, goes straight at where it is heading.
  - The **tugboat** never comes out of a crate (it tows you along the loop).
- **Golden crates**: two spots per arena, in the middle of the water (in the chicanes of the
  Great Basin, in the channels of the Two Lakes). The first turns up after 20 s, the second 15 s
  later, then each comes back 30 s after it is opened. A golden crate holds an item from the
  strongest column, always the better version (×3), and only opens for a boat with a free slot.
  Big, gold, glowing; a star on the minimap, an arrow at the edge of the screen and "A golden
  crate is up!" when one appears.
- **Respawn**: a boat that sinks comes back with a full hull **at its team's base**, on a random
  spot there, the one of twelve tries farthest from any opponent (never on a moored barge).
  Free for all: anywhere on the arena, again the try farthest from any opponent.
- **Capture the flag**: each team's flag stands at its base. Touch the other team's flag to take
  it (it flies over your boat), bring it to your own base **while your own flag is there**: a
  capture. The carrier is slower (75 % top speed). **Hit by an opponent, the carrier drops the
  flag** (and blinks, so it can't pick it straight back up); so does a carrier that sinks.
  Touched by its own team, a dropped flag goes home at once; touched by the other team it is
  taken again; left alone it goes home after 20 s.
- **Sudden death**: time runs out with the lead shared (two teams level, or two boats on the top
  score): "Sudden death!", the clock is replaced by it, and the next point that breaks the tie
  wins. Still level after 90 s: a draw.
- **The end**: when a team or a boat reaches the limit, or time runs out, everyone blinks
  (can't be hurt) for 2.5 s, then the results: the winning team (or a draw) with both teams'
  scores beside their flags, and for each boat its flags, sinkings and times sunk.
- **The HUD**: the two flags with the team scores (yours highlighted) or your place in free for
  all, your score, the time left (red under 30 s), bases, flags and golden crates on the
  minimap, and messages ("You sank X", "Your flag was taken", …). Under the minimap a **feed** of
  the last four sinkings ("Bilge sank Marge", in the scoring team's colour). **Arrows** at the
  edge of the screen point to what matters off it: opponents within 1500 px (fading with
  distance), golden crates, and the flags when carried or dropped. The camera is further out
  than in a race (×0.8) to see boats coming from every side.
- **Pace** (AI-only matches, six boats): about one sinking per boat per minute in deathmatch,
  a third of the matches won on points before the time limit; capture the flag lasts 3½ to
  4½ minutes with plenty of flags dropped and brought back. The measurement script is described
  in [AI](ai.md#battles).
- **AI**: see [AI](ai.md#battles).

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
4. **Single race, championship or battle**: three big cards after the boat.
   - **Battle**: the mode (Deathmatch, Team deathmatch, Capture the flag), the arena, the number
     of boats (3 to 8, at least 4 with teams), your team (Corsica or Brittany) and the
     opponents' level, then "Fight!".
   - **Track select** (single race): thumbnails of the track layout, the opponents' level.
   - **Championship**: one row per race: the track (‹ ›), its laps (− +) or, on the Reims canal,
     its stretch (✎ opens the stretch screen), ▲ ▼ to reorder, ✕ to take it out, "+ Add a race";
     then the opponents' level and "Start the championship". The races are remembered.
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
