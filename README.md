# Fast & Fluvial

A top-down arcade racing game on water, built with **TypeScript** and **Phaser**.
Four barges and boats race each other down canals, rivers and harbours, picking
up crates full of questionable weaponry: volunteers you throw at opponents,
jigsaws, electric drills, glue and a mysterious white powder.

The whole game is played with **one pointer**: a mouse or a single finger.

> **Status:** playable prototype (milestones M0 to M3 of the [roadmap](docs/roadmap.md)).
> You can pick one of 8 boats, race 3 AI opponents on 5 tracks (or all the lap tracks in a championship) at 3 difficulty
> levels, and use twenty-four items (two at a time). Art is placeholder (drawn in code) and there
> is no sound yet. See [what is implemented](#implemented-so-far).

## Pitch

- **4 racers per race**: you against 3 AI opponents, or **online with up to 3
  friends** in a room you share with a 4-letter code.
- **Mouse or touch only.** Point where you want to go; the further you point,
  the more throttle you give.
- **Crates** float along the track. Drive through one to get a random item and
  use it on your rivals.
- **Several boats** with their own stats, from the tough Coal Barge to the
  fragile Cigarette Speedboat.
- **Several tracks**, raced one at a time or chained together into a cup.

## Documentation

| Document | Contents |
| --- | --- |
| [Game design](docs/game-design.md) | Concept, core loop, race rules, damage, race modes |
| [Controls](docs/controls.md) | Mouse and touch steering, firing items, accessibility |
| [Items](docs/items.md) | The five crate items, how they behave, how they are handed out |
| [Boats](docs/boats.md) | The boats you can pick, their stats and how the stats feed the physics |
| [Tracks](docs/tracks.md) | The races, track format, hazards, cups |
| [AI](docs/ai.md) | How the opponents drive and use items |
| [Architecture](docs/architecture.md) | Tech stack, project layout, scenes, systems, data formats, testing |
| [Real-world tracks](docs/real-world-tracks.md) | Canal de Reims from IGN open data: importer, scale, rendering |
| [Localization](docs/localization.md) | English and French; how to add a language |
| [Multiplayer](docs/multiplayer.md) | Online rooms: authoritative server, prediction, interpolation, Cloudflare Durable Objects |
| [Deployment](docs/deployment.md) | Deploying to Cloudflare |
| [Roadmap](docs/roadmap.md) | Milestones from first prototype to first release |

## Planned tech stack

- [Phaser 3](https://phaser.io/) for rendering, input, scenes, audio and tweens
- TypeScript in strict mode
- [Vite](https://vitejs.dev/) for the dev server and production build
- [Vitest](https://vitest.dev/) for unit tests of the pure game logic
- ESLint and Prettier

## Quick start

```bash
npm install
npm run dev      # dev server on http://localhost:5173
npm run dev:server  # multiplayer server locally on :8787 (needed for online play in dev)
npm run build    # static production build in dist/
npm test         # unit tests (physics, tracks, item odds, headless AI races)
npm run typecheck
```

The production build is a static site and can be served from any static host.

Debug URL parameters (see [Architecture](docs/architecture.md#debug-flags)):
`?track=lockAndLoad&boat=tugboat&item=glue&laps=1&seed=1&ai=0&difficulty=pond&debug=1`.

## Implemented so far

- Pointer steering (hold and point), item button, right click / second finger /
  `Space` to fire, swipe down on the item button to fire backwards.
- 8 boats with different stats, starting with **Cabourg**, a real péniche
  from the canal drawn from an aerial photo; boat select with stat bars.
- 4 tracks (Lock & Load, Industrial Estuary, Bayou Bends, Champagne Hills) and track select.
- **Championship**: the four lap tracks in a row, points by place, the leader starting at the
  back; offline against the same three AI boats, or online with the room keeping the points.
- **Taunts**: six phrases in a speech bubble over your boat (AI boats taunt back).
- **Canal de Reims**: the real canal from boulevard Paul Doumer to the Sillery
  lock at true scale (9.9 km, point-to-point), built from IGN open data
  (BD TOPO®, Licence Ouverte Etalab 2.0).
- 4-boat races with countdown, start boost, laps, ranking, results screen.
- AI opponents (racing line, avoidance, stuck recovery, item use, rubber-banding,
  3 difficulty levels).
- Crates, item roulette and **twenty-four items** in **two slots** (right click and middle
  click, or two on-screen buttons): Volunteers, Jigsaw, Flour, Electric
  Drill, Glue, Silicone Gun, Fake Crate, Beer Crate, Magic Mushrooms, Electrical
  Failure, Ultimate Raclette, Clogged Toilet, Kärcher, Dicke Titten, Giant Black Dildo,
  Nail Gun, Gas Siphoning, Tugboat, Beer Dispenser, Vacuum Cleaner, Sauna, Noise
  Complaint, Lazy Volunteers and Painting Workshop (see [Items](docs/items.md)). Leaders get weaker items
  than the boats behind. Hull, spin-outs,
  sinking, respawn; blinking boats pass through other boats.
- HUD: position, lap, time, minimap, item slot, pause menu.
- English and French (auto-detected, switchable on the title screen).
- Fullscreen button, landscape lock on Android, home-screen install (web app
  manifest and icons) for full screen on iPhone.

- Sound: synthesised music for menus and each kind of track (an accordion waltz
  on the Reims canal), engine sounds that follow each boat, effects for every
  item and event.
- Options: music and effects volume, left-handed layout, auto-fire, reduced shake.

- **Online multiplayer**: rooms of up to 8 boats (AI boats fill the seats people leave free), invite
  links, a lobby where the host picks the race, server-run races with your boat
  predicted and the others smoothed. Hosted on the same Cloudflare Worker, one
  Durable Object per room.

Not done yet: cups and unlocks, the remaining tracks and their hazards, final
art, reconnecting to a race in progress. See the [roadmap](docs/roadmap.md).
