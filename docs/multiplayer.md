# Online multiplayer

Up to four people race together in a **room** identified by a 4-letter code. Empty seats are
filled with AI boats. The server runs the race; each screen shows it and sends its player's
controls.

## How it works

The usual model for real-time games: an **authoritative server**, with **prediction** of your
own boat and **interpolation** of everyone else.

```
 screen A ──controls (30/s)──▶ ┌──────────────────────────┐ ──snapshots (20/s)──▶ screen A
 screen B ──controls (30/s)──▶ │ room ABCD                │ ──snapshots (20/s)──▶ screen B
                               │ the real race, 60 steps/s│
                               │ AI boats in empty seats  │
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
  your boat is corrected.
- **Other boats are interpolated.** They are shown 100 ms in the past, blended between the two
  snapshots around that moment, so they move smoothly even though updates come 20 times a second.
  Volunteers, drills and glue balls are blended the same way.
- **Events** (hits, items used, laps, sinking, countdown) travel in the snapshots, so sounds,
  pop-ups and particles play on every screen.
- **Finishing**: when every person has finished, the race ends 3 s later. Once the first person
  finishes, the others have **30 s** (shown on screen), then the race ends and their times are
  estimated. The server sends the results to everyone, and the room goes back to its lobby.
- **Leaving**: if someone leaves or loses their connection mid-race, the AI takes over their boat
  and the race goes on.

## Rooms and lobby

- **Create a room**: the screen picks a random code (letters without I and O) and connects.
  The first person in is the **host**.
- **Invite**: the lobby has a "copy the invite link" button: `https://…/?room=ABCD`. Opening it
  goes straight to the online screen with the code filled in. Or type the code by hand.
- In the lobby everyone picks a boat. The host picks the race and the AI difficulty, and starts
  once everyone else is ready. Alone, the host races the AI.
- A room is full at 4 people, and can't be joined while a race is on.
- The pause button doesn't pause an online race; its menu has Options and "Leave the race".

## Hosting

Everything runs on the same **Cloudflare Worker** that serves the game, so there is still one
deploy (Cloudflare builds from `main` as before):

- `server/worker.ts`: requests to `/api/room/ABCD` (WebSocket) go to the room; everything else
  is the game's static files (`dist/`).
- **One Durable Object per room** (`RaceRoom`, found with `idFromName(code)`). It holds the
  WebSockets and runs a 20 Hz timer while anyone is connected. Each tick catches the simulation up
  with the clock (60 steps a second) and sends a snapshot. An empty room is forgotten.
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
| `src/net/room.ts` | `RoomCore`: lobby, start, the authoritative race, snapshots, results, leaving. Plain TypeScript, tested without a server |
| `src/net/remote.ts` | `RemoteController`: a person's boat on the server, fed by their controls |
| `src/net/snapshot.ts` | Encode the race state (rounded, compact) and apply it to a local copy |
| `src/net/client.ts` | The browser side of the connection, shared by the online screens |
| `src/net/onlineRace.ts` | Prediction of your boat, interpolation of the others, events |
| `src/scenes/OnlineScene.ts`, `LobbyScene.ts` | Name and room code; the lobby |
| `server/worker.ts` | The Cloudflare Worker and the `RaceRoom` Durable Object |

Messages are JSON. A snapshot is about 1.2 KB, so about 24 KB/s per player. That could be made
much smaller with a binary format if ever needed.

## Developing

```bash
npm run dev:server   # builds the game, runs the Worker + rooms locally on :8787 (wrangler dev)
npm run dev          # the game with hot reload on :5173; /api is forwarded to :8787
```

Open two browser windows on the dev server to race yourself. `tests/room.test.ts` drives a room
with fake connections and a fake clock (joining, the lobby, a full race, someone leaving), and
checks that a snapshot recreates the race on another screen.

## Not done yet

- **Reconnecting** to a race after losing the connection (you rejoin the room's lobby after it).
- **Smoothing corrections** of your own boat: after a bump it jumps to the corrected position.
- **Joining a race in progress** (as a spectator).
- **Matchmaking** with strangers: rooms are for people who share a code.
- **Cheat protection** beyond the server being in charge: controls are clamped, but a modified
  client could still steer perfectly.
