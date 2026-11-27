import { Track, type TrackDef } from '../track/Track';
import reims from './maps/reimsCanal.track.json';

const pts = (list: [number, number, number][]) => list.map(([x, y, width]) => ({ x, y, width }));

/** Real-world tracks store their centre line as a flat [x, y, width, x, y, width, ...] list. */
const flatPts = (flat: number[]) => {
  const out = [];
  for (let i = 0; i + 2 < flat.length; i += 3) out.push({ x: flat[i], y: flat[i + 1], width: flat[i + 2] });
  return out;
};

/** Crate rows every `spacing` pixels along a race of `length` pixels. */
const crateRowsEvery = (length: number, spacing: number, count: number) => {
  const rows = [];
  for (let d = spacing; d < length - spacing / 2; d += spacing) rows.push({ at: d / length, count });
  return rows;
};

const reimsLength = reims.finishDist - reims.startDist;

export const TRACK_DEFS: TrackDef[] = [
  {
    id: 'lockAndLoad',
    laps: 3,
    theme: 'canal',
    centerLine: pts([
      [600, 400, 320], [1400, 300, 320], [2300, 380, 300], [3000, 700, 300],
      [3200, 1300, 300], [2900, 1900, 300], [2200, 2100, 320], [1600, 1800, 300],
      [1100, 1950, 300], [500, 1800, 300], [250, 1200, 320], [300, 700, 320],
    ]),
    checkpoints: [0.25, 0.5, 0.75],
    crateRows: [{ at: 0.1, count: 4 }, { at: 0.35, count: 3 }, { at: 0.6, count: 4 }, { at: 0.85, count: 3 }],
    colors: { land: 0x6b5b4b, shore: 0xc9b48a, water: 0x2f7fb5, waterDeep: 0x1f5f94 },
  },
  {
    id: 'industrialEstuary',
    laps: 3,
    theme: 'industrial',
    centerLine: pts([
      [500, 500, 280], [1500, 380, 270], [2500, 480, 260], [3200, 900, 250],
      [3000, 1400, 240], [2300, 1500, 230], [2200, 2000, 240], [2900, 2400, 260],
      [2400, 2900, 270], [1400, 2800, 260], [800, 2500, 250], [1200, 2000, 240],
      [700, 1600, 250], [300, 1100, 270],
    ]),
    checkpoints: [0.2, 0.4, 0.6, 0.8],
    crateRows: [{ at: 0.08, count: 4 }, { at: 0.3, count: 3 }, { at: 0.5, count: 4 }, { at: 0.72, count: 3 }, { at: 0.9, count: 4 }],
    colors: { land: 0x55595e, shore: 0x9a9a8f, water: 0x3b7a8c, waterDeep: 0x275e70 },
  },
  {
    id: 'bayouBends',
    laps: 3,
    theme: 'bayou',
    centerLine: pts([
      [500, 700, 220], [1100, 450, 210], [1700, 750, 200], [2300, 450, 200],
      [2900, 700, 210], [3400, 1150, 220], [3200, 1750, 210], [2700, 2050, 200],
      [2200, 1700, 190], [1600, 2050, 200], [1000, 1750, 200], [400, 1950, 210],
      [250, 1300, 220],
    ]),
    checkpoints: [0.25, 0.5, 0.75],
    crateRows: [{ at: 0.1, count: 3 }, { at: 0.3, count: 3 }, { at: 0.55, count: 3 }, { at: 0.8, count: 3 }],
    colors: { land: 0x2f4a2a, shore: 0x6e7a3a, water: 0x4d7a4a, waterDeep: 0x3a6140 },
  },
  {
    // Canal de l'Aisne à la Marne, boulevard Paul Doumer (Reims) to the Sillery lock, at true scale.
    // Generated from IGN open data by scripts/import-reims.mjs.
    id: 'reimsCanal',
    laps: 1,
    theme: 'city',
    closed: false,
    centerLine: flatPts(reims.centerLine),
    startDist: reims.startDist,
    finishDist: reims.finishDist,
    pxPerM: reims.pxPerM,
    scenery: 'maps/reims-canal.json',
    attribution: `${reims.source}, ${reims.generated}`,
    checkpoints: [0.25, 0.5, 0.75],
    crateRows: crateRowsEvery(reimsLength, 2500, 3),
    colors: { land: 0xd9d2b4, shore: 0xbdb5a2, water: 0x3f7fa8, waterDeep: 0x2f6a92 },
  },
];

export const getTrackDef = (id: string): TrackDef => TRACK_DEFS.find((t) => t.id === id) ?? TRACK_DEFS[0];
export const loadTrack = (id: string): Track => new Track(getTrackDef(id));
