# Real-world tracks

**Canal de Reims** is the real Canal de l'Aisne à la Marne, from boulevard Paul
Doumer (Reims) to the Écluse n°13 de Sillery, at true scale. It is built from
IGN open data: BD TOPO®, under the Licence Ouverte Etalab 2.0. The credit is
shown on the track select screen.

## Facts

| | |
| --- | --- |
| Race length | 9.9 km, point-to-point (one run, no laps) |
| Scale | 10 px per metre: boats are about 7–10 m long, like small motorboats |
| Canal width | 57 m at the start basin, 14–30 m elsewhere |
| Race time (AI, River) | about 4 min for the fastest boats, 4 min 50 s for the slowest |
| Locks removed | n°10 Fléchambault, n°11 Château d'Eau, n°12 Huon (and n°13, where the race ends) |
| Scenery | 1,423 buildings, 1,733 road segments, railways, vegetation, bridges, other water |
| Bridge names | 7 bridges over the canal are labelled (see below) |

## Importer

```bash
npm run import:reims
# behind a proxy (Node >= 22.21): NODE_USE_ENV_PROXY=1 npm run import:reims
```

`scripts/import-reims.mjs` downloads from IGN's Géoplateforme WFS
(`data.geopf.fr`, no key needed) and writes two files:

- `src/data/maps/reimsCanal.track.json`, about 20 KB, bundled with the game: the
  centre line, a width every 8 m, and the start and finish distances.
- `public/maps/reims-canal.json`, about 450 KB, loaded only when the race starts:
  the scenery.

The game never calls IGN while you play. What the importer does:

1. Chains the canal's centre-line sections (`troncon_hydrographique`) from north
   to south.
2. Puts the start line at the canal point nearest boulevard Paul Doumer. The
   geocoder only knows the street, not number 25, so `CONFIG.startShift` moves it
   along the canal. The finish is 25 m before lock n°13.
3. Measures the canal's real width every 4 m by walking out from the centre line
   until it leaves the water surfaces (`surface_hydrographique`), and re-centres
   the line between the banks.
4. Removes the locks: near a lock (`construction_surfacique`, nature `Ecluse`)
   the width is interpolated from the canal on either side. It also keeps the
   canal at least 11 m wide so boats can always pass.
5. Keeps only scenery within 230 m of the canal, since nothing further away can
   ever be seen: buildings (with heights for shadows), roads (bridges flagged,
   tunnels dropped), railways, vegetation, water and bridge decks. The aqueduct
   carrying the canal over the Vesle is left out, so it isn't drawn above the
   boats.

Everything is in game pixels, rounded, with outlines simplified to about 0.5 m.

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

## Adding another place

Copy `scripts/import-reims.mjs` and change `CONFIG`: the waterway name as written
in BD TOPO, a start point, an end lock or point, and the output file names. Then
add a track definition next to `reimsCanal` in `src/data/tracks.ts` and its name
and description in `src/i18n/*.ts`. A river works the same way as a canal.
BD TOPO covers all of France.
