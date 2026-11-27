# Real-world tracks

**Canal de Reims** is the real Canal de l'Aisne à la Marne, from Passage Marx
Dormoy (la Neuvillette, north of Reims) to the Écluse n°13 de Sillery, at true
scale. Any stretch of it can be raced (see [Picking the stretch](#picking-the-stretch));
the usual race runs from boulevard Paul Doumer to the lock. It is built from IGN
open data: BD TOPO®, under the Licence Ouverte Etalab 2.0. The credit is shown on
the track select screen.

## Facts

| | |
| --- | --- |
| Map length | 15.9 km of canal, Passage Marx Dormoy to the Sillery lock |
| Race length | 9.9 km for the usual race (boulevard Paul Doumer to the lock); any stretch of 1 km or more can be picked. Point-to-point (one run, no laps) |
| Scale | 10 px per metre: boats are about 7–10 m long, like small motorboats |
| Canal width | 57 m at the start basin, 14–30 m elsewhere |
| Race time (AI, River) | usual race: about 4 min for the fastest boats, 4 min 50 s for the slowest (about 25 s per km) |
| Locks removed | n°10 Fléchambault, n°11 Château d'Eau, n°12 Huon (and n°13, where the race ends) |
| Scenery | 2,448 buildings, 2,787 road segments, railways, vegetation, 18 sports grounds, 1 cemetery, bridges, other water |
| Street names | 117 labels for 115 streets, written along the streets (see below) |
| Bridge names | 14 bridges over the canal are labelled (see below) |

## Importer

```bash
npm run import:reims
# behind a proxy (Node >= 22.21): NODE_USE_ENV_PROXY=1 npm run import:reims
```

`scripts/import-reims.mjs` downloads from IGN's Géoplateforme WFS
(`data.geopf.fr`, no key needed) and writes two files:

- `src/data/maps/reimsCanal.track.json`, about 34 KB, bundled with the game: the
  centre line, a width every 8 m, the usual start and finish, the range a stretch
  can be picked in, and the named places along the canal (the ends, the bridges,
  the removed locks) for the stretch picker.
- `public/maps/reims-canal.json`, about 700 KB, loaded only when the race starts:
  the scenery.

The game never calls IGN while you play. What the importer does:

1. Chains the canal's centre-line sections (`troncon_hydrographique`) from north
   to south.
2. Starts the map at the canal point nearest Passage Marx Dormoy (`CONFIG.north`)
   and ends it at lock n°13. The usual race starts at the canal point nearest
   boulevard Paul Doumer (`CONFIG.start`; the geocoder only knows the street, not
   number 25, so `CONFIG.startShift` moves it along the canal) and finishes 25 m
   before the lock.
3. Measures the canal's real width every 4 m by walking out from the centre line
   until it leaves the water surfaces (`surface_hydrographique`), and re-centres
   the line between the banks.
4. Removes the locks: near a lock (`construction_surfacique`, nature `Ecluse`)
   the width is interpolated from the canal on either side. It also keeps the
   canal at least 11 m wide so boats can always pass.
5. Keeps only scenery within 230 m of the canal, since nothing further away can
   ever be seen: buildings (with heights for shadows), roads (bridges flagged,
   tunnels dropped), railways, vegetation, sports grounds (`terrain_de_sport`:
   football, tennis, running track, pool or other court), cemeteries, water and
   bridge decks. The aqueduct
   carrying the canal over the Vesle is left out, so it isn't drawn above the
   boats.

Everything is in game pixels, rounded, with outlines simplified to about 0.5 m.

## Street names

Streets are named like on a printed map: the name is written **along the street**,
upright (never upside down), in bold dark text with a white halo, sitting on the
road. There is **one name per street** near the canal, not one per block: IGN cuts
streets into a piece per block, so the importer first joins the pieces of a street
into one line, then:

1. takes the longest text that fits the road width (font 13 to 26 px, 1.3 to 2.6 m
   tall letters at 10 px per metre);
2. finds a stretch of that street straight enough to hold it (it must not stick out
   of the road), on dry land and at least 8 m from the water;
3. prefers the stretch nearest the canal, and only within 150 m of it, since nothing
   further is ever on screen.

A street that runs beside the canal for a long way repeats its name every 1.5 km at
most (`streetRepeat` in the importer), because a name seen once in 3 km would never
be read; change it to 100000 for strictly one label per street. The current data has
64 labels for 63 streets. Footpaths, bridges and roads with no name in IGN's data
get none. Names come from the BAN street names (with "R", "Bd" and "Av" expanded)
and are French in every language.

In the game the names are text objects, created only while a tile that shows them
is on screen and destroyed after (so a 10 km race never holds more than a handful).

## Bridge names

Each bridge that really crosses the canal gets a name on the map, written on the
bank beside it. The importer picks the best name IGN has, in this order:

1. The bridge's own name, from the bridge structures (`construction_lineaire`,
   `construction_surfacique`): **Pont de Venise, Pont de Fléchambault, Pont Huon,
   Pont de Vrilly, Pont Saint-Léonard**.
2. Otherwise the street it carries, from the road on top (BAN street name): shown
   as **"Pont · Avenue de Champagne"** ("Bridge · …" in English) and "Pont ·
   Avenue Nicéphore Niépce".
3. Otherwise, for a railway bridge, "Pont ferroviaire" / "Railway bridge".

Bridges that run side by side (road, footpath, parapets within 30 m of the canal)
count as one. A bridge with no name in IGN's data, such as a footbridge, gets no
label rather than an invented one. IGN's "collaborative" names are in capitals
without accents, so the importer restores the few that are on this route
(Fléchambault, Nicéphore Niépce, Saint-Léonard); a new route may need more entries
in `ACCENTS`. Run `DEBUG_BRIDGES=1 npm run import:reims` to see every crossing and
the names it considered.

## Picking the stretch

On the track select screen, the Reims canal has a **Choose the stretch** button
(online, the host clicks the stretch shown in the lobby). The screen has:

- **one slider** for the whole canal, Neuvillette (north) on the left, Sillery
  (south) on the right, with a **start handle** (green) and a **finish handle**
  (chequered). Drag a handle, or press on the bar to move the nearer one there.
  The race always goes north to south.
- a **tick for each named place**: bridges, the old locks, the ends. A handle
  dropped near one snaps onto it, so "from Pont de Venise to Pont Huon" is easy.
- a **map** of the canal with the stretch highlighted, and for each end its
  kilometre and where it is ("Pont de Venise", "300 m past Pont Huon"), plus the
  length and a rough race time.
- **Usual race** (Paul Doumer to the lock) and **Whole canal** buttons.

A stretch is at least 1 km. It is remembered per track (with the other menu
choices); online it is part of the room's settings, and the server checks it.
Crates are spread over whatever stretch is raced (a row of three every 250 m), and
the minimap highlights it.

## In the game

- **Point-to-point tracks** (`closed: false` in the track definition): the race
  runs from `startDist` to `finishDist` along an open centre line. Both ends are
  walls. The HUD shows the distance left instead of laps. Boats that have
  finished coast to a stop and stop colliding, so they never block the line.
- **`MapRenderer`** draws only what the camera sees. The world is cut into
  512 px tiles. Each tile is rendered into a texture when it comes into view (at
  most two per frame) and recycled when it leaves. Water is erased from the tiles
  so the animated water layer shows through. Bridges are drawn on separate tiles:
  a shadow below the boats and a deck above them.

## How the city is drawn

The drawing code is in `src/view/mapArt.ts`; everything is generated from IGN's
shapes, no image files. The aim is that you recognise things at a glance, like on
an aerial photo but cleaner:

| Thing | Drawn as |
| --- | --- |
| Woods, hedges, orchards | Individual round tree crowns with a shadow and a sunlit side, in a few greens; small bushes for hedges, a regular grid for orchards |
| Vineyards | Rows of vines along the parcel's long side |
| Roads | Grey asphalt with a light pavement on each side. Wide roads (5 m and more) get a dashed centre line; motorways get verges, edge lines and dashed lanes |
| Railways | Ballast, sleepers and two rails per track |
| Buildings | A shadow (longer for taller buildings), then a roof: pitched roofs in slate or tiles, split along the ridge with a lit and a shaded side; big or industrial buildings get a flat roof with a parapet and rooftop units; churches are darker |
| Canal | A stone quay edge between the water and the towpath |
| Sports grounds | Football pitches with mowing stripes and markings, clay tennis courts with a net, blue courts, red running tracks with lanes, pools with lanes |
| Cemeteries | Rows of graves on the cemetery's own grid, with paths |

Small details (tree positions and colours, roof colours) come from a hash of the
position, so the city looks the same in every race and on every screen.

Speed matters because a tile is drawn while you race. Phaser draws every circle as a
100-point polygon, which made tiles with woods take up to 90 ms. So tree crowns are
two small textures (the crown in greys, and its shadow) stamped and tinted, and road
joints use 10-sided shapes. A tile takes about 5 ms in a software-rendered test
browser, as before the new art.

## Adding another place

Copy `scripts/import-reims.mjs` and change `CONFIG`: the waterway name as written
in BD TOPO, a start point, an end lock or point, and the output file names. Then
add a track definition next to `reimsCanal` in `src/data/tracks.ts` and its name
and description in `src/i18n/*.ts`. A river works the same way as a canal.
BD TOPO covers all of France.
