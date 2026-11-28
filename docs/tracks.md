# Tracks

## Track list

Eight tracks in two cups for the first release. Each has a different setting
and at least one feature that changes how you race.

### Canal Cup

| # | Track | Setting | Feature | Laps |
| --- | --- | --- | --- | --- |
| 1 | **Lock & Load** | City canal with brick walls and moored boats | Tutorial track: wide, gentle turns. A canal lock gate that opens and closes on a timer in the shortcut lane. | 3 |
| 2 | **Industrial Estuary** | Factories, cranes, cargo ships | A crane drops containers into the water at fixed spots (shadow shows where). | 3 |
| 3 | **Bayou Bends** | Swamp with mangroves and fog | Tight S-bends, floating logs that can be pushed, shallow mud patches that slow boats. | 3 |
| 4 | **Harbour Rush** | Busy port at sunset | A ferry crosses the track on a fixed route. Getting hit by it sinks you. | 3 |

### Open Water Cup

| # | Track | Setting | Feature | Laps |
| --- | --- | --- | --- | --- |
| 5 | **Frozen Fjord** | Cliffs, snow, ice floes | Ice floes drift and block lines; lower lateral grip for everyone. | 3 |
| 6 | **Rapids Run** | Mountain river | A current that pushes boats downstream; one-way with a waterfall drop into the lower section. Point-to-point, no laps. | 1 |
| 7 | **Night Market** | Floating market under lanterns | Narrow alleys between stalls, many branching paths, dark areas lit by lanterns. | 3 |
| 8 | **Storm Surge** | Open sea in a storm | Big waves roll across the track and push boats sideways; lightning flashes. | 2 |

Unlocks: Canal Cup tracks 1 and 2 are unlocked at the start. Finishing a race
unlocks the next track for Single Race. Winning the Canal Cup unlocks the Open
Water Cup.

## Real-world tracks

Canal de Reims is built from map data rather than drawn by hand; see
[Real-world tracks](real-world-tracks.md).

## Track format

Tracks are data, not code. **Current state:** the three implemented tracks are
plain `TrackDef` objects in `src/data/tracks.ts` (centre line control points with
widths, checkpoints, crate rows and colours), turned into a `Track` by
`src/track/Track.ts`. The JSON/Tiled format below is the plan for when there are
more tracks and obstacles, hazards and branches.

### The centre line

The heart of a track is its **centre line**: a closed (or, for point-to-point,
open) Catmull-Rom spline through a list of control points. Each control point
also has a **width**. Together they describe the water channel.

From the centre line the game derives:

- **Banks**: the left and right edges, used for collision.
- **Progress**: how far along the track a boat is, used for ranking.
- **AI racing lines** and the **Volunteers' path**.
- **Respawn points** after sinking.
- The **minimap** outline.

The spline is sampled once at load time into evenly spaced points (every 16 px)
with precomputed tangents, normals, left and right edge points and cumulative
distance. All run-time queries use this sampled list.

### Track JSON

```jsonc
{
  "id": "lockAndLoad",
  "name": "Lock & Load",
  "laps": 3,
  "closed": true,
  "music": "music_canal",
  "theme": "canal",              // tile set and colours
  "centerLine": [
    { "x": 400, "y": 1200, "width": 320 },
    { "x": 900, "y": 1100, "width": 280 }
    // ...
  ],
  "startLine": { "index": 0 },   // sample index on the centre line
  "grid": [                       // 4 start slots, relative to the start line
    { "along": -80,  "across": -60 },
    { "along": -80,  "across":  60 },
    { "along": -200, "across": -60 },
    { "along": -200, "across":  60 }
  ],
  "checkpoints": [0.0, 0.2, 0.4, 0.6, 0.8], // fractions of the lap length
  "crateRows": [
    { "at": 0.15, "count": 4 },
    { "at": 0.55, "count": 3 }
  ],
  "branches": [],                 // alternative paths, see below
  "obstacles": [
    { "type": "buoy", "x": 1500, "y": 900 },
    { "type": "log", "x": 2100, "y": 650, "angle": 0.6, "pushable": true }
  ],
  "zones": [
    { "type": "shallow", "polygon": [[0,0],[100,0],[100,80],[0,80]] },
    { "type": "current", "polygon": [/* ... */], "force": { "x": 0, "y": 80 } }
  ],
  "hazards": [
    { "type": "ferry", "path": [[300, 400], [300, 1600]], "period": 14 }
  ],
  "decorations": "lockAndLoad_deco" // Tiled layer or sprite list, visual only
}
```

### Branches and shortcuts

A branch is a second, shorter spline that leaves the main centre line at one
progress value and joins again at another. Progress on a branch is mapped
linearly onto the main line's progress between those two points, so ranking
and checkpoints still work. Banks of the main line are opened where a branch
leaves and joins.

### Progress and ranking

For each boat, every frame:

1. Find the nearest sample on the centre line (search only a window around the
   previous nearest sample, so it is cheap and can't jump across a hairpin).
2. `progress = laps * lapLength + distanceAlongLine(nearestSample)`.
3. Sort racers by `progress`. Checkpoints guard against cheating: a lap only
   counts if all checkpoints were crossed in order.

### Collision with banks

A boat is inside the water if its distance from the centre line (measured
along the normal at the nearest sample) is less than half the local width
minus the boat's radius. When it is outside, it is pushed back inside along
the normal, and the velocity component into the bank is removed (with a small
bounce). This avoids needing polygon collision for banks.

Islands and piers inside the channel are separate static obstacles
(circles, capsules or convex polygons).

## Zones and hazards

**Traffic** is on every track: barges going both ways along the centre line, keeping to
their side (`src/race/traffic.ts`). Where each one is depends only on the time since the
race was set up, so every screen of an online race works them out for itself. A track
can set how far apart barges going the same way are (`traffic` in the track definition,
in pixels; 4000 by default, 6000 on the Reims canal). None is on the starting grid at the
start; on a point-to-point track they fade out at one end of the canal and back in at the
other. See [Game design](game-design.md#traffic-wakes-and-slipstream).

Planned, not built yet:

| Type | Effect |
| --- | --- |
| `shallow` | Top speed x 0.6 (not for Hovercraft or boosted boats) |
| `current` | Adds a constant force to boats and floating projectiles |
| `ice` | Lateral grip x 0.4 |
| `wave` | Moving band that pushes boats sideways as it passes |
| `ferry`, `container` | Moving or timed hazards; touching them sinks the boat or deals 40 damage |
| `lockGate` | Solid while closed, open/close on a timer |

## Visual design

Every track is drawn by the same renderer (`MapRenderer`, see
[Real-world tracks](real-world-tracks.md#in-the-game)): streets with pavements and
markings, roofs with shadows, single trees, a towpath and quay along the banks,
animated water with a pale band of shallows along each bank. Only what the camera
sees is drawn, in 512 px tiles (`src/view/MapRenderer.ts`), and drawing must never
make the game stutter on a phone:

- A tile is drawn **a layer at a time** (ground, roads, buildings, plants, tree
  shadows and crowns in batches, water, bridges), a few milliseconds of it per
  frame, and only shown once complete. Tiles up to 384 px beyond the view are
  prepared ahead, nearest first, so they are ready before they come into view; one
  already in view is finished at once whatever it costs.
- Tiles are kept until 576 px beyond the view, and the last dozen to go out of range
  are kept hidden, ready to show again (the next lap, or turning back).
- While a tile is drawn, lines skip the segments that can't reach it (dashes still
  line up across tiles) and big areas (woods, fields, water) are clipped to it
  first: Reims has roads and woods kilometres long.
- Street names (text, slow to make) appear one per frame and are kept hidden for a
  while after they go.

- The Reims canal's surroundings come from IGN's map.
- The **invented tracks have theirs generated** by rules (`src/view/sceneryGen.ts`),
  with a fixed random seed per track so a track always looks the same:

| Theme | Track | What is laid out round the channel |
| --- | --- | --- |
| `canal` | Lock & Load | A brick town: a quay street on each bank with plane trees, cross streets and a back street forming blocks, terraces of houses (mostly tiled roofs, a few slate, the odd church) with gardens, more houses and trees further out, a football pitch where there is room |
| `industrial` | Industrial Estuary | A dock road on one bank and a two-track railway on the other, then warehouses with rooftop units, groups of round storage tanks and yards of stacked shipping containers, scrub on the waste ground |
| `bayou` | Bayou Bends | Swamp forest down to the water: bushes crowding both banks, a canopy of big crowns everywhere else, a dirt trail along one bank, a few tin-roofed shacks in clearings, lily pads in the slack water |

  Rules that keep it tidy: nothing is built on the towpath or in the water; a line
  along a bank (a street, a row of houses) is left out where the land is too narrow
  or where it would bunch up inside a tight bend; cross streets stop at the first
  street they meet; nothing overlaps anything already placed. Laying out a track
  takes about a tenth of a second, once, when it is first raced.
- Wakes: each boat leaves a fading wake trail of particles.
- Things on the water (crates, volunteers, the drill, glue, the saw) are drawn in
  `src/view/worldArt.ts`, also with the 2D canvas.
- **Street life**, decoration only (`src/view/streetLife.ts`, drawings in
  `src/view/streetArt.ts`): cars drive on the right along the roads (faster on
  motorways), carry on at junctions or turn round at dead ends, brake behind each
  other and cross the bridges above the deck. People walk the towpaths (some with a
  dog), the pavements and the footpaths, never a motorway, a railway or a roof;
  joggers and cyclists go faster along the towpaths; anglers sit on the quays with
  their rods over the water. About seventy of them live in a ring round the camera:
  one that drifts too far away is put back somewhere just out of sight. Each screen
  animates its own with plain random numbers: nothing is simulated or sent online,
  and none of it gets in the boats' way.

## Making a new track

1. Draw the centre line as a polyline object called `centerLine` in Tiled, with
   a custom `width` property on each point (or a default width on the object).
2. Add point objects for start, crate rows, obstacles; polygons for zones.
3. Export to JSON in `public/assets/tracks/`.
4. Register the track in `src/data/tracks.ts` (id, cup, unlock rule, thumbnail).
5. Run the game with `?track=<id>&debug=1` to see the centre line, banks,
   checkpoints and AI lines drawn on top.
