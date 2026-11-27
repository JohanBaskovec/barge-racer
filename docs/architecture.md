# Architecture

## Tech stack

| Concern | Choice | Why |
| --- | --- | --- |
| Language | TypeScript, `strict: true` | Safety for game state and data files |
| Engine | Phaser 3 (latest 3.x, pinned in `package.json`) | Mature 2D engine with WebGL/Canvas, scenes, input, audio, tweens, particles, cameras |
| Physics | Custom boat model and collisions (no Arcade/Matter for boats) | Arcade only does boxes and circles; Matter is heavier than needed. Boats need custom drag and drift anyway, and banks are handled via the centre line |
| Bundler | Vite | Fast dev server, simple static build |
| Tests | Vitest | Same config as Vite, fast, runs in Node |
| Lint / format | ESLint (typescript-eslint) + Prettier | Consistency |
| Maps | Tiled JSON (optional) | Visual track editing |
| CI | GitHub Actions: lint, type-check, test, build | Catch breakage on every push |

## Project layout

```
barge-racer/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── public/
│   └── assets/
│       ├── sprites/          # texture atlases (boats, items, effects, UI)
│       ├── tiles/            # water and shore tile sets per theme
│       ├── tracks/           # track JSON files
│       ├── audio/            # music (ogg + m4a) and sound effects
│       └── fonts/
├── src/
│   ├── main.ts               # Phaser.Game config and scene list
│   ├── config.ts             # global constants (fixed step, debug flags)
│   ├── scenes/
│   │   ├── BootScene.ts      # minimal assets for the loading screen
│   │   ├── PreloadScene.ts   # loads everything else, shows progress
│   │   ├── TitleScene.ts
│   │   ├── MenuScene.ts
│   │   ├── BoatSelectScene.ts
│   │   ├── TrackSelectScene.ts
│   │   ├── RaceScene.ts      # the race world
│   │   ├── HudScene.ts       # runs on top of RaceScene
│   │   ├── PauseScene.ts
│   │   └── ResultsScene.ts
│   ├── data/
│   │   ├── boats.ts          # BoatDef[] (see boats.md)
│   │   ├── items.ts          # item tuning values and odds table
│   │   ├── tracks.ts         # track registry, cups, unlocks
│   │   └── difficulty.ts
│   ├── race/
│   │   ├── RaceState.ts      # racers, laps, positions, timer, phase
│   │   ├── RaceManager.ts    # countdown, checkpoints, finish, results
│   │   ├── Racer.ts          # one boat + its controller + held item
│   │   └── CupState.ts
│   ├── physics/
│   │   ├── BoatPhysics.ts    # the boat model (pure functions)
│   │   ├── collisions.ts     # circle/capsule/polygon tests, impulses
│   │   └── math.ts           # vectors, angles
│   ├── track/
│   │   ├── TrackLoader.ts    # JSON -> Track
│   │   ├── Track.ts          # sampled centre line, queries
│   │   ├── spline.ts         # Catmull-Rom sampling
│   │   └── TrackRenderer.ts  # water, banks, decorations
│   ├── control/
│   │   ├── ControlIntent.ts
│   │   ├── PointerController.ts
│   │   ├── KeyboardController.ts  # optional, later
│   │   └── AIController.ts
│   ├── items/
│   │   ├── ItemSystem.ts     # crates, roulette, firing, entity updates
│   │   ├── itemOdds.ts       # weighted draw (pure, tested)
│   │   ├── Volunteer.ts
│   │   ├── Jigsaw.ts
│   │   ├── WhitePowder.ts
│   │   ├── Drill.ts
│   │   └── Glue.ts
│   ├── effects/
│   │   └── Effects.ts        # timed modifiers on a boat (boost, sticky, spin-out, invulnerable)
│   ├── view/
│   │   ├── BoatView.ts       # sprite, wake, damage overlays
│   │   ├── CameraController.ts
│   │   └── Minimap.ts
│   ├── audio/
│   │   └── AudioManager.ts
│   └── save/
│       └── SaveData.ts       # localStorage wrapper with a version number
└── tests/
    ├── physics.test.ts
    ├── track.test.ts
    ├── itemOdds.test.ts
    └── raceState.test.ts
```

## Separation of logic and view

The rule: **game logic does not import Phaser**.

- `physics/`, `track/` (except `TrackRenderer`), `race/`, `items/` logic,
  `effects/` and `control/AIController` are plain TypeScript working on plain
  data. They can be unit-tested in Node without a browser.
- `scenes/` and `view/` read the game state and draw it with Phaser. They never
  change game state directly; they send intents or commands.
- `PointerController` is the only control class that touches Phaser input, and
  it only produces a `ControlIntent`.

This keeps the simulation deterministic for a given seed and input sequence,
which makes bugs reproducible and leaves the door open for replays, ghosts and
online play later.

## Game loop

`RaceScene.update(time, delta)` uses a **fixed-step accumulator**:

```ts
const STEP = 1 / 60;
accumulator += Math.min(delta / 1000, 0.25); // avoid a spiral after a tab switch
while (accumulator >= STEP) {
  simulation.step(STEP); // inputs -> AI -> physics -> collisions -> items -> race rules
  accumulator -= STEP;
}
view.render(accumulator / STEP); // interpolate sprite positions
```

Order inside `simulation.step`:

1. Read a `ControlIntent` for each racer (pointer for the player, AI for others).
2. Update effects timers.
3. Boat physics for each racer.
4. Collisions: boat vs banks, obstacles, boats.
5. Item system: crate pickups, item activation, projectile and puddle updates,
   hits.
6. Hazards and zones.
7. Race rules: progress, checkpoints, laps, ranking, finish.
8. Emit events (`hit`, `sunk`, `lap`, `finish`, `itemPickup`, ...) for the view
   and audio.

Randomness comes from a seeded PRNG (e.g. mulberry32) stored in the race state,
never `Math.random()` in logic code.

## Events

The simulation pushes events into a queue each step; `RaceScene` drains it
after the steps and forwards them on a Phaser `EventEmitter` to the HUD, audio
and visual effects. This keeps logic free of Phaser while letting the view
react to things like hits and laps.

```ts
type RaceEvent =
  | { type: 'countdown'; value: 3 | 2 | 1 | 0 }
  | { type: 'itemPickup'; racer: number; item: ItemId }
  | { type: 'itemUsed'; racer: number; item: ItemId }
  | { type: 'hit'; racer: number; by: number | null; source: ItemId | 'bank' | 'hazard'; damage: number }
  | { type: 'sunk'; racer: number }
  | { type: 'lap'; racer: number; lap: number }
  | { type: 'finish'; racer: number; position: number; time: number };
```

## Items and effects

- **Entities**: things items spawn into the world (`VolunteerEntity`,
  `DrillEntity`, `GluePuddle`). They live in the `ItemSystem` with a position,
  a collision shape, a lifetime and an owner. Updated every step.
- **Effects**: timed modifiers on a racer: `boost`, `jigsaw`, `sticky`,
  `spinOut`, `invulnerable`, `sinking`. Each effect has a duration and a set of
  multipliers (`topSpeed`, `accel`, `turnRate`, `lateralGrip`, `mass`). The
  physics multiplies all active effects together.
- Adding a new item = one data entry in `data/items.ts` + one file in `items/`
  + art and sounds. No changes to the physics.

## Scenes and flow

```
Boot -> Preload -> Title -> Menu -+-> BoatSelect -> TrackSelect -> Race (+ Hud) -> Results -+
                                  |                                   |  ^                  |
                                  +-> Options                         v  |                  |
                                                                    Pause                   |
                                  ^-----------------------------------------------------------+
```

- The selected boat, track/cup, difficulty and cup progress are passed between
  scenes as scene data (`this.scene.start('Race', { ... })`), not as globals.
- `HudScene` is launched in parallel with `RaceScene` so the HUD is not affected
  by the race camera's zoom and scroll.

## Rendering and scaling

- Phaser `Scale.FIT` with a base resolution of **1280 x 720**, centred, with
  the game resolution multiplied by `devicePixelRatio` (capped at 2) for crisp
  sprites.
- Sprites packed into texture atlases (TexturePacker or free-tex-packer).
- Track water and shores drawn into a few large static layers, not per frame.
- Particles (wake, sparks, splashes) pooled; capped per emitter on mobile.
- Object pools for projectiles and puddles.

## Performance budget

- 60 fps on a mid-range phone, logic < 4 ms per frame.
- Initial download < 10 MB, first screen visible in < 3 s on 4G (show the title
  while the rest loads).
- Audio: compressed music, sound effects in one audio sprite.

## Save data

`localStorage` key `barge-racer-save`:

```ts
interface SaveData {
  version: 1;
  unlockedBoats: string[];
  unlockedTracks: string[];
  cupWins: Record<string, Difficulty[]>;
  bestTimes: Record<string, { lap: number; total: number }>;
  options: {
    musicVolume: number;
    sfxVolume: number;
    steeringMode: 'hold' | 'tapTarget';
    leftHanded: boolean;
    reducedShake: boolean;
    steeringAssist: boolean;
    autoFire: boolean;
  };
}
```

A `version` field and migration function handle future changes. Corrupt or
missing data falls back to defaults.

## Debug flags

URL query parameters, read in `config.ts`:

| Parameter | Effect |
| --- | --- |
| `debug=1` | Draw centre line, banks, checkpoints, hitboxes, AI overlays, FPS |
| `track=<id>` | Skip menus and start this track |
| `boat=<id>` | Player boat for `track=` |
| `item=<id>` | Every crate gives this item |
| `seed=<n>` | Fixed random seed |
| `ai=0` | No AI racers (practice) |
| `laps=<n>` | Override the number of laps |
| `difficulty=<pond\|river\|ocean>` | Difficulty for `track=` |

## Testing

- **Unit tests (Vitest)** for the pure logic:
  - Boat physics: reaches top speed, stops when coasting, turn rate limits,
    effect multipliers.
  - Track: spline sampling, nearest-sample search, progress across the
    start line, bank push-back.
  - Item odds: distributions match the table over many draws, the "no three in
    a row" and "max 2 volunteers" rules.
  - Race state: lap counting with checkpoints, ranking ties, finish order,
    cup points.
- **Simulation tests**: run a full race headless with 4 AI racers and a fixed
  seed; check it finishes, nobody gets stuck forever, and lap times are within
  expected ranges per boat. Used for balancing.
- **Manual playtests** on at least one phone and one desktop browser before each
  milestone.

## Coding conventions

- One class per file, file name = class name; pure helpers in `camelCase.ts`.
- Units: pixels, seconds, radians everywhere in logic. Degrees only in data
  files where noted and converted on load.
- No magic numbers in logic: tuning values live in `src/data/`.
- Keep Phaser types out of `physics/`, `track/` logic, `race/`, `items/` logic
  and `effects/` (enforced with an ESLint `no-restricted-imports` rule).
