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
    colors: { land: 0xcfc4a2, shore: 0xddcfa6, water: 0x2f7fb5, waterDeep: 0x1f5f94 },
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
    colors: { land: 0xa7a59c, shore: 0xbdb9ad, water: 0x3b7a8c, waterDeep: 0x275e70 },
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
    colors: { land: 0x35542e, shore: 0x65703a, water: 0x4d7a4a, waterDeep: 0x3a6140 },
  },
  {
    // Canal de l'Aisne à la Marne, from Passage Marx Dormoy (la Neuvillette) to the Sillery lock, at
    // true scale. Any stretch can be raced; by default boulevard Paul Doumer to the lock.
    // Generated from IGN open data by scripts/import-reims.mjs.
    id: 'reimsCanal',
    laps: 1,
    theme: 'city',
    closed: false,
    centerLine: flatPts(reims.centerLine),
    startDist: reims.startDist,
    finishDist: reims.finishDist,
    range: reims.range as [number, number],
    places: reims.places as [number, number, number, string][],
    crateSpacing: { every: 2500, count: 3 },
    pxPerM: reims.pxPerM,
    scenery: 'maps/reims-canal.json',
    attribution: `${reims.source}, ${reims.generated}`,
    checkpoints: [0.25, 0.5, 0.75],
    crateRows: [], // from crateSpacing, for the stretch raced
    colors: { land: 0xd9d2b4, shore: 0xbdb5a2, water: 0x3f7fa8, waterDeep: 0x2f6a92 },
  },
];

export const getTrackDef = (id: string): TrackDef => TRACK_DEFS.find((t) => t.id === id) ?? TRACK_DEFS[0];

/** A stretch of a point-to-point track to race, as distances along its centre line (pixels). */
export interface Section {
  start: number;
  finish: number;
}

/** The shortest stretch that can be picked, in metres. */
export const MIN_SECTION_M = 1000;

/** Whether this track's stretch can be picked. */
export const hasSections = (def: TrackDef): boolean => !!def.range;

/** The default stretch of a track whose stretch can be picked. */
export const defaultSection = (def: TrackDef): Section => ({ start: def.startDist ?? 0, finish: def.finishDist ?? 0 });

/**
 * Make a stretch valid for a track: inside its range, start before finish, at least MIN_SECTION_M
 * long, whole pixels. Anything unusable (missing, not numbers) gives the default stretch.
 */
export function clampSection(def: TrackDef, s: unknown): Section {
  const fallback = defaultSection(def);
  const range = def.range;
  if (!range || !s || typeof s !== 'object') return fallback;
  const { start, finish } = s as Record<string, unknown>;
  if (typeof start !== 'number' || typeof finish !== 'number' || !Number.isFinite(start) || !Number.isFinite(finish)) return fallback;
  const min = MIN_SECTION_M * (def.pxPerM ?? 10);
  const a = Math.round(Math.max(range[0], Math.min(range[1] - min, start)));
  const b = Math.round(Math.max(a + min, Math.min(range[1], finish)));
  return { start: a, finish: b };
}

/** Load a track; for a track whose stretch can be picked, race `section` (default: its default stretch). */
export function loadTrack(id: string, section?: Section | null): Track {
  const def = getTrackDef(id);
  if (!hasSections(def)) return new Track(def);
  const { start, finish } = clampSection(def, section ?? undefined);
  const crateRows = def.crateSpacing ? crateRowsEvery(finish - start, def.crateSpacing.every, def.crateSpacing.count) : def.crateRows;
  return new Track({ ...def, startDist: start, finishDist: finish, crateRows });
}
