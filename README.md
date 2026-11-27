# Barge Racer

A top-down arcade racing game on water, built with **TypeScript** and **Phaser**.
Four barges and boats race each other down canals, rivers and harbours, picking
up crates full of questionable weaponry: volunteers you throw at opponents,
jigsaws, electric drills, glue and a mysterious white powder.

The whole game is played with **one pointer**: a mouse or a single finger.

> **Status:** playable prototype (milestones M0 to M3 of the [roadmap](docs/roadmap.md)).
> You can pick one of 7 boats, race 3 AI opponents on 3 tracks at 3 difficulty
> levels, and use all five items. Art is placeholder (drawn in code) and there
> is no sound yet. See [what is implemented](#implemented-so-far).

## Pitch

- **4 racers per race**: you against 3 AI opponents.
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
| [Localization](docs/localization.md) | English and French; how to add a language |
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
- 7 boats with different stats; boat select with stat bars.
- 3 tracks (Lock & Load, Industrial Estuary, Bayou Bends) and track select.
- 4-boat races with countdown, start boost, laps, ranking, results screen.
- AI opponents (racing line, avoidance, stuck recovery, item use, rubber-banding,
  3 difficulty levels).
- Crates, item roulette and all five items; hull, spin-outs, sinking, respawn.
- HUD: position, lap, time, minimap, item slot, pause menu.
- English and French (auto-detected, switchable on the title screen).
- Fullscreen button, landscape lock on Android, home-screen install (web app
  manifest and icons) for full screen on iPhone.

Not done yet: sound, cups and unlocks, options screen, the remaining tracks and
their hazards, the "tap to set a target" steering mode, final art. See the
[roadmap](docs/roadmap.md).
