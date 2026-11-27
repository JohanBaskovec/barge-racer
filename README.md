# Barge Racer

A top-down arcade racing game on water, built with **TypeScript** and **Phaser**.
Four barges and boats race each other down canals, rivers and harbours, picking
up crates full of questionable weaponry: volunteers you throw at opponents,
jigsaws, electric drills, glue and a mysterious white powder.

The whole game is played with **one pointer**: a mouse or a single finger.

> **Status:** design phase. This repository has documentation only so far; no
> game code yet. See the [roadmap](docs/roadmap.md).

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
| [Roadmap](docs/roadmap.md) | Milestones from first prototype to first release |

## Planned tech stack

- [Phaser 3](https://phaser.io/) for rendering, input, scenes, audio and tweens
- TypeScript in strict mode
- [Vite](https://vitejs.dev/) for the dev server and production build
- [Vitest](https://vitest.dev/) for unit tests of the pure game logic
- ESLint and Prettier

## Planned quick start

Once the code exists, this is how it will run:

```bash
npm install
npm run dev      # dev server on http://localhost:5173
npm run build    # static production build in dist/
npm test         # unit tests
```

The production build is a static site and can be served from any static host.
