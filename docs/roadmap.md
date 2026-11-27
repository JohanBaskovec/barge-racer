# Roadmap

Each milestone ends with something playable. Art and audio can start as
placeholders (coloured shapes, free sound effects) and be replaced later.

## M0: Project setup

- Vite + TypeScript + Phaser project, strict TS, ESLint, Prettier, Vitest.
- GitHub Actions: lint, type-check, test, build.
- Boot and Preload scenes, an empty Race scene with a camera.
- Debug query parameters wired up.

**Done when:** `npm run dev` shows a blank water scene; CI is green.

## M1: One boat on one track

- Track loader with centre line, banks and bank collisions.
- Boat physics model and one boat definition.
- Pointer steering (hold mode) on desktop and touch.
- Camera follow with look-ahead.
- Laps, checkpoints, lap timer.
- First track (Lock & Load) as placeholder art.

**Done when:** you can drive 3 laps with a mouse or a finger and it feels good.
This is the most important milestone: steering feel decides the game.

## M2: Racing

- 4 racers: AI controller with racing line, avoidance, stuck recovery.
- Boat-to-boat collisions.
- Countdown, start boost, ranking, finish, Results scene.
- HUD: position, lap, time, minimap.

**Done when:** a full race against 3 AI boats is fun without items.

## M3: Items

- Crates, roulette, item slot button, firing forward and backward.
- Hull, damage, spin-out, invulnerability, sinking and respawn.
- All five items: Volunteers, Jigsaw, White Powder, Electric Drill, Glue.
- Position-based odds.
- AI item use.

**Done when:** all items work for both player and AI and races are chaotic in a
good way.

## M4: Content

- All 7 boats with stats and placeholder sprites; Boat Select scene.
- All 8 tracks with their features and hazards; Track Select scene.
- Cup mode and points.
- Difficulty levels and rubber-banding.
- Save data: unlocks, best times, options.

**Done when:** both cups can be completed on all difficulties.

## M5: Polish

- Final art: boats, tracks, items, UI.
- Music and sound effects, engine sounds.
- Particles: wakes, splashes, sparks, smoke.
- Screen shake, hit pauses, pop-up texts.
- Options scene, left-handed layout, steering assist, auto-fire, reduced shake.
- Performance pass on mobile.
- Balancing using headless simulation runs and playtests.

**Done when:** it feels like a finished small game.

## M6: Release

- PWA manifest and offline caching so it can be installed on phones.
- Deploy the static build (e.g. GitHub Pages).
- Basic credits and version number on the title screen.

## Later / ideas

- Time Trial with ghost replays (the deterministic simulation makes this cheap).
- More items (see [Items](items.md#ideas-for-later)).
- Battle arena mode: last boat floating wins.
- AI personalities.
- Local split-screen or online multiplayer.
- Track editor in the browser.
- Boat customisation (colours, flags, horn sounds).
