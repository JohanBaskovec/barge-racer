# Online multiplayer

Up to eight people race together in a **room** identified by a 4-letter code; AI boats fill
the seats nobody has taken. The server runs the race; each screen shows it and sends its player's
controls.

## How it works

The usual model for real-time games: an **authoritative server**, with **prediction** of your
own boat and **interpolation** of everyone else.

```
 screen A ──controls (30/s)──▶ ┌──────────────────────────┐ ──snapshots (20/s)──▶ screen A
 screen B ──controls (30/s)──▶ │ room ABCD                │ ──snapshots (20/s)──▶ screen B
                               │ the real race, 60 steps/s│
                               │ + AI boats in free seats │
                               └──────────────────────────┘
```

- **The server** runs the same race simulation as the single-player game (`src/race/`,
  `src/physics/`, `src/items/`). That code never touches Phaser or the browser, so it runs on
  the server unchanged. What the server says happens, happens: hits, items, finishing order.
  Different browsers computing slightly different numbers doesn't matter.
- **Your controls** (heading, throttle, fire) are sent for every simulation step, two steps per
  message. The server uses one per step, in order, and tells each screen the last one it used
  (`ack`).
- **Your boat is predicted.** Each step your controls move your boat on your screen at once. When
  a snapshot arrives your boat is reset to the server's version, and the controls the server
  hasn't used yet are replayed on top. Usually nothing visible happens; after a bump or a hit
  your boat is corrected, and the correction is **smoothed**: the boat is drawn where it was and
  glides to the corrected place over about a fifth of a second instead of jumping. (A jump of
  more than 25 m, such as a respawn after sinking, is shown as it is.)
- **Other boats are interpolated.** They are shown 100 ms in the past, blended between the two
  snapshots around that moment, so they move smoothly even though updates come 20 times a second.
  Volunteers, drills and glue balls are blended the same way.
- **Events** (hits, items used, laps, sinking, countdown) travel in the snapshots, so sounds,
  pop-ups and particles play on every screen.
- **Finishing**: when every person has finished, the race ends 3 s later. Once the first person
  finishes, the others have **30 s** (shown on screen), then the race ends and their times are
  estimated. The server sends the results to everyone, and the room goes back to its lobby.
- **Leaving**: if someone leaves mid-race, the AI takes over their boat and the race goes on.

## Connection trouble

- **Reconnecting**: when the connection drops (a phone changing network, a tunnel), the game
  reconnects by itself: right away, then a few more times over about 30 seconds, showing
  "Connection lost. Reconnecting…". A connection can also die without closing: if nothing has
  arrived for 6 seconds, the game gives up on it and reconnects.
- **Your seat is kept** until the race ends. Meanwhile the AI drives your boat (the lobby shows
  you as reconnecting) and the race doesn't wait for you at the finish. When you're back you take
  the helm again where your boat is. The server gave your screen a secret **key** when you
  joined; reconnecting with it gets you the same seat, and nobody else can take it. If the old
  connection hasn't been noticed as dead yet, the new one replaces it.
- **Controls stop arriving** but the connection is still open (a frozen phone, the game in the
  background, a stalled network): after 1 second the AI stands in, so your boat doesn't drift
  into the bank, and you take over again as soon as your controls arrive. Your boat still counts
  as yours at the finish.
- If the race ended while you were away, you come back to the room's lobby (you miss the results).
- A race everyone has dropped out of waits a minute for someone to come back, then is dropped.
- **Reloading the page keeps your seat too**, and so does a phone reloading the tab after the
  browser was in the background. The room's code and your key are kept in the tab's session
  storage (`sessionStorage`, for 15 minutes); on starting, the game goes straight back into the
  room ("Back to room ABCD…") with that key, so you are back in the race in your own boat, or in
  the lobby. Leaving the room forgets it. Another tab is another player.

## Rooms and lobby

- **Create a room**: the screen picks a random code (letters without I and O) and connects.
  The first person in is the **host**.
- **Invite**: the lobby has a "copy the invite link" button: `https://…/?room=ABCD`. Opening it
  goes straight to the online screen with the code filled in. Or type the code by hand.
- In the lobby everyone picks a boat. The host picks the race (and, on the Reims canal, the
  stretch) and the AI difficulty, and starts
  once everyone else is ready. Alone, the host races the AI.
- **Room size**: how many boats race, 1 to 8 (4 by default: the host and three AI boats,
  like a single-player race). The host sets it with − and +; the header shows "Boats n/size".
  Every seat people don't take is an **AI boat**, with a name and a boat nobody has taken yet.
  - **Bigger**: AI boats are added at the end of the list.
  - **Someone joins**: they take the **first** AI boat's seat. With no AI boat left, every
    seat is a person's and the room refuses the next person (watchers count).
  - **Smaller**: the **last** AI boat goes. It can't go below the number of people in the
    room (− is greyed out then, and the server refuses it).
  - **The ✕ on an AI boat's row** removes that boat and its seat: the room gets one smaller.
  - **Someone leaves** the lobby (or never comes back during a race): a new AI boat takes their
    seat, so the size stays the same. A player who loses the connection mid-race keeps theirs
    until the race ends.
- The race has exactly the people and the AI boats in the list, in that order on the grid (two
  abreast, four rows) and in those colours.
- **Championship**: the host turns it on (the button beside "Race"; it starts from the host's own
  single-player championship) and "✎ Races" opens the same championship screen as in single
  player: which races, their order, their laps, the Reims stretch; every change goes to the
  room, which checks it (`cleanPlan`). The races can be changed until the first one is run. The
  room then races them in turn (the track arrows go away; "Race 2/4 · 3 laps" shows which one), the
  server keeps the points (people by player id, AI boats by their id) and each race's grid is
  set by the standings, the leader at the back. The lobby shows everyone's points; after a race
  the results show the points of each place and lead to the standings. After the last race the
  champion is shown and the room starts a new championship; turning it off forgets the points.
  Someone who joins in the middle starts with no points; someone who leaves keeps theirs in the
  standings.
- **Battle**: the host picks the mode with ‹ › above the track: Normal race, Deathmatch, Team
  deathmatch or Capture the flag. A battle swaps the track for an arena (‹ › then go through the
  arenas) and turns the championship off. In team modes each row shows its team's flag; people
  start on the side with fewer people and change with "Join Corsica / Brittany", and AI boats fill
  in for the side with fewer boats. The server checks the arena goes with the mode (a battle on a
  race track, or a race on an arena, is refused), passes the mode and teams (`team` in each
  `StartEntry`) to the race, sends the battle state in every snapshot (`bt`: time left, team
  scores, each boat's kills, deaths and captures, the flags, over, winner) and the tally in the
  results (`battle` and per-row `team`, `kills`, `deaths`, `captures`).
- **Taunts**: "Taunt…" under the list, or the taunt button in a race. The server sends the taunt
  to everyone (at most one per player every 1.2 s); it appears beside the name in the lobby and
  over the boat in a race.
- With more than four boats the position-based rules (item odds, better versions, birds
  and swimmers) spread the places over their four columns: in a race of eight, 1st and
  2nd use the first column, 7th and 8th the last.
- **Joining during a race**: you watch it. The camera follows a boat with its HUD (position,
  items); tap to watch the next one. You race in the next race. The lobby shows you as watching.
- The pause button doesn't pause an online race; its menu has Options and "Leave the race".

## Hosting

Everything runs on the same **Cloudflare Worker** that serves the game, so there is still one
deploy (Cloudflare builds from `main` as before):

- `server/worker.ts`: requests to `/api/room/ABCD` (WebSocket) go to the room; everything else
  is the game's static files (`dist/`).
- **One Durable Object per room** (`RaceRoom`, found with `idFromName(code)`). It holds the
  WebSockets and runs a 20 Hz timer while anyone is in the room, including seats kept for people
  reconnecting. Each tick catches the simulation up with the clock (60 steps a second) and sends
  a snapshot. An empty room is forgotten.
- `wrangler.jsonc` declares the Durable Object (`ROOMS`, SQLite-backed class, which the free
  plan requires) and the assets binding. Check the current Durable Objects pricing and free-plan
  limits on Cloudflare's site. A race uses very little CPU: the whole 4-boat simulation is about
  half a second of CPU per race.
- A room lives in one Cloudflare data centre, near whoever created it. Fine for players in the
  same country; far-away players get more lag.

## Code

| File | What it does |
| --- | --- |
| `src/net/protocol.ts` | Message types, room codes, timing constants |
| `src/net/room.ts` | `RoomCore`: lobby, start, the authoritative race, snapshots, results, leaving, the championship's points, taunts. Plain TypeScript, tested without a server |
| `src/cup/championship.ts` | The championship's tracks, points, standings and grid order, shared with the single-player game |
| `src/net/remote.ts` | `RemoteController`: a person's boat on the server, fed by their controls |
| `src/net/snapshot.ts` | Encode the race state (rounded, compact) and apply it to a local copy |
| `src/net/client.ts` | The browser side of the connection, shared by the online screens |
| `src/net/onlineRace.ts` | Prediction of your boat, interpolation of the others, events |
| `src/scenes/OnlineScene.ts`, `LobbyScene.ts` | Name and room code; the lobby |
| `server/worker.ts` | The Cloudflare Worker and the `RaceRoom` Durable Object |

**Traffic costs nothing to send**: where every barge is depends only on the seed and the
step count, and the snapshot carries the step count (`k`), so each screen works the barges
out. Your boat's prediction knows them too: it collides with them at the step it is
predicted for, and the barges are drawn at that same moment, so you see a barge exactly
where you bump into it. The crates barges toss are sent like the other entities.

A snapshot also carries the raclette's shots, the cheese and smoke clouds, each boat's
size (mushrooms) and the crates a mushroom has pulled away from home (only those: the
others sit at home on every screen). Moving shots and pulled crates glide between
snapshots like the other projectiles.

Messages are JSON. A snapshot is about 2 KB with four boats and 3.3 KB with eight (40 to 67 KB/s
per player as JSON), but the WebSocket compresses them (`permessage-deflate`, which Cloudflare
negotiates and browsers handle by themselves). The compression keeps its dictionary from one
message to the next, and snapshots are much alike, so what travels is about **5 KB/s with four
boats and 8 KB/s with eight**: some 0.3 to 0.5 MB a minute, about 1 MB a race. A binary format
would save little more. The server simulates an eight-boat race in about 0.25 ms a step, some
15 ms of CPU a second.

## Developing

```bash
npm run dev:server   # builds the game, runs the Worker + rooms locally on :8787 (wrangler dev)
npm run dev          # the game with hot reload on :5173; /api is forwarded to :8787
```

Open two browser windows on the dev server to race yourself. `tests/room.test.ts` drives a room
with fake connections and a fake clock (joining, the lobby, a full race, someone leaving), and
checks that a snapshot recreates the race on another screen. It also covers connection trouble:
a seat kept and given back with the key, a reconnection replacing a connection not yet noticed
as dead, someone joining mid-race to watch, the AI standing in when controls stop, and a race
everyone left. A whole four-race championship runs there too, and taunts.

## Not done yet

- **Matchmaking** with strangers: rooms are for people who share a code.
- **Cheat protection** beyond the server being in charge: controls are clamped, but a modified
  client could still steer perfectly.
