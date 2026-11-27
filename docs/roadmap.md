# Roadmap

Each milestone ends with something playable. Art and audio can start as
placeholders (coloured shapes, free sound effects) and be replaced later.

## M0: Project setup (done, except ESLint/Prettier)

- Vite + TypeScript + Phaser project, strict TS, ESLint, Prettier, Vitest.
- GitHub Actions: lint, type-check, test, build.
- Boot and Preload scenes, an empty Race scene with a camera.
- Debug query parameters wired up.

**Done when:** `npm run dev` shows a blank water scene; CI is green.

## M1: One boat on one track (done)

- Track loader with centre line, banks and bank collisions.
- Boat physics model and one boat definition.
- Pointer steering (hold mode) on desktop and touch.
- Camera follow with look-ahead.
- Laps, checkpoints, lap timer.
- First track (Lock & Load) as placeholder art.

**Done when:** you can drive 3 laps with a mouse or a finger and it feels good.
This is the most important milestone: steering feel decides the game.

## M2: Racing (done)

- 4 racers: AI controller with racing line, avoidance, stuck recovery.
- Boat-to-boat collisions.
- Countdown, start boost, ranking, finish, Results scene.
- HUD: position, lap, time, minimap.

**Done when:** a full race against 3 AI boats is fun without items.

## M3: Items (done)

- Crates, roulette, item slot button, firing forward and backward.
- Hull, damage, spin-out, invulnerability, sinking and respawn.
- The items: Volunteers, Jigsaw, White Powder, Electric Drill, Glue, then Silicone
  Gun, Fake Crate, Beer Crate and Magic Mushrooms, held two at a time.
- Position-based odds.
- AI item use.

**Done when:** all items work for both player and AI and races are chaotic in a
good way.

## M4: Content (partly done)

Done: all 8 boats (including Cabourg, a real péniche) and Boat Select, 3 of 8
drawn tracks plus the real Canal de Reims, Track Select, difficulty levels and
rubber-banding, nine items in two slots. Still to do: the other 5 tracks and their
hazards, cup mode, save data (unlocks, best times, options).

- All boats with stats and placeholder sprites; Boat Select scene.
- All 8 tracks with their features and hazards; Track Select scene.
- Cup mode and points.
- Difficulty levels and rubber-banding.
- Save data: unlocks, best times, options.

**Done when:** both cups can be completed on all difficulties.

## M5: Polish (done, except final art)

- Music, sound effects and engine sounds, all synthesised (done).
- Particles: wakes, sparks, splashes, ripples, splinters, bubbles, dust, glue
  (done).
- Screen shake, hit pauses, pop-up texts (done).
- Options scene: volumes, left-handed layout, auto-fire, reduced shake (done).
  Steering assist dropped on purpose.
- UI: rounded buttons with shadows and a pressed state (done).
- Final art: still code-drawn placeholders, apart from Cabourg; real art needs an
  artist.
- Performance on phones and balancing: done by the owner through playtests.

**Done when:** it feels like a finished small game.

## M6: Release (mostly done)

- Deployed to Cloudflare on every update of `main` (done).
- Web app manifest and icons, fullscreen, home-screen install (done); offline
  caching (not yet).
- Version number on the title screen (done). Credits (not yet; the IGN map credit
  is on the track select screen).

## Later / ideas

- Time Trial with ghost replays (the deterministic simulation makes this cheap).
- More items (see [Items](items.md#ideas-for-later)).
- Battle arena mode: last boat floating wins.
- AI personalities.
- Local split-screen.
- Online multiplayer: **done** (rooms with codes, lobby, server-run races, prediction and
  interpolation, reconnecting, smoothed corrections, watching a race in progress; see
  [Multiplayer](multiplayer.md)). Next: keeping your seat across a page reload, matchmaking.
- Track editor in the browser.
- Boat customisation (colours, flags, horn sounds).
