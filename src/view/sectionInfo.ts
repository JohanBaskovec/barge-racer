import { type Section, clampSection, getTrackDef, loadTrack } from '../data/tracks';
import { formatNumber, t } from '../i18n';
import type { Track } from '../track/Track';

export interface Place {
  /** Distance along the centre line (pixels). */
  along: number;
  kind: number;
  name: string;
  /** For tight spaces: bridges named after their street are just the street. */
  short: string;
}

const cache = new Map<string, { track: Track; places: Place[] }>();

/** A track with a pickable stretch, and its named places in order along the canal (cached). */
export function sectionTrack(trackId: string): { track: Track; places: Place[] } {
  let c = cache.get(trackId);
  if (!c) {
    const track = loadTrack(trackId);
    const places = (track.def.places ?? [])
      .map(([x, y, kind, raw]) => ({ along: track.nearest(x, y).along, kind, name: placeName(kind, raw), short: kind === 3 ? raw : placeName(kind, raw) }))
      .sort((a, b) => a.along - b.along);
    c = { track, places };
    cache.set(trackId, c);
  }
  return c;
}

/** Place names are French in every language, apart from "bridge" for bridges named after their street. */
function placeName(kind: number, raw: string): string {
  if (kind === 3) return `${t('map.bridge')} · ${raw}`;
  if (kind === 4) return t('map.railBridge');
  return raw;
}

/**
 * Where a point along the canal is, for people: "Pont de Venise", or "300 m past Pont de Venise".
 * `short`: just the nearest place's name.
 */
export function describeAlong(trackId: string, along: number, short = false): string {
  const { track, places } = sectionTrack(trackId);
  const pxPerM = track.def.pxPerM ?? 10;
  let best: Place | null = null;
  for (const p of places) if (!best || Math.abs(p.along - along) < Math.abs(best.along - along)) best = p;
  if (!best) return '';
  if (short) return best.short;
  const m = Math.round(Math.abs(along - best.along) / pxPerM / 50) * 50;
  if (m < 100) return best.name;
  return t(along > best.along ? 'section.past' : 'section.before', { m: formatNumber(m, 0), place: best.name });
}

/** "Boulevard Paul Doumer → Écluse n°13 Sillery · 9.9 km" (`short`: nearest place names only). */
export function describeSection(trackId: string, s: Section | null | undefined, short = false): string {
  const def = getTrackDef(trackId);
  const { start, finish } = clampSection(def, s);
  const km = (finish - start) / (def.pxPerM ?? 10) / 1000;
  return `${describeAlong(trackId, start, short)} → ${describeAlong(trackId, finish, short)} · ${formatNumber(km)} km`;
}
