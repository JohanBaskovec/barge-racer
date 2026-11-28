import { type Section, TRACK_DEFS, clampSection, getTrackDef, hasSections } from '../data/tracks';

/**
 * Championship: races one after the other, points for each place, and the boat with the most
 * points at the end wins. The player (online, the host) picks the races: which tracks, in which
 * order, how many laps each, and for the Reims canal which stretch. Pure logic, shared by the
 * single-player game and the online room (where the server keeps the standings).
 */

/** One race of a championship: a track, its laps (tracks with laps), its stretch (the Reims canal). */
export interface CupRace {
  trackId: string;
  laps?: number;
  section?: Section;
}

export const MAX_CUP_RACES = 8;
export const MAX_LAPS = 9;

/** The championship you get unless you change it: four tracks with laps, three laps each. */
export const CUP_TRACKS = ['lockAndLoad', 'industrialEstuary', 'bayouBends', 'champagneHills'] as const;
export const defaultPlan = (): CupRace[] => CUP_TRACKS.map((trackId) => ({ trackId, laps: getTrackDef(trackId).laps }));

/**
 * Make a list of races valid (it may come from another screen over the network): 1 to
 * MAX_CUP_RACES races of real tracks, 1 to MAX_LAPS laps on tracks with laps, a valid stretch on
 * the Reims canal. Anything unusable gives the default championship.
 */
export function cleanPlan(raw: unknown): CupRace[] {
  if (!Array.isArray(raw)) return defaultPlan();
  const out: CupRace[] = [];
  for (const r of raw.slice(0, MAX_CUP_RACES)) {
    if (!r || typeof r !== 'object' || !TRACK_DEFS.some((d) => d.id === (r as CupRace).trackId)) continue;
    const def = getTrackDef((r as CupRace).trackId);
    if (hasSections(def)) out.push({ trackId: def.id, section: clampSection(def, (r as CupRace).section) });
    else {
      const laps = Math.round(Number((r as CupRace).laps));
      out.push({ trackId: def.id, laps: Number.isFinite(laps) ? Math.max(1, Math.min(MAX_LAPS, laps)) : def.laps });
    }
  }
  return out.length ? out : defaultPlan();
}

/** Points by place, 1st to 8th. */
export const POINTS = [10, 8, 6, 5, 4, 3, 2, 1];

export const pointsFor = (place: number): number => POINTS[place] ?? 0;

export interface CupEntry {
  /** Who: a player id online, a fixed id offline ('you', 'ai1', ...); AI boats online use their bot id. */
  key: string;
  name: string;
  boatId: string;
  human: boolean;
  points: number;
  /** Points in each race so far (null: not in that race). */
  races: (number | null)[];
}

export interface CupState {
  /** Races finished. */
  done: number;
  total: number;
  standings: CupEntry[];
  /** The races, in order. */
  plan: CupRace[];
}

export const newCup = (plan: CupRace[] = defaultPlan()): CupState => ({ done: 0, total: plan.length, standings: [], plan: plan.map((r) => ({ ...r })) });

/** The next race (the last one once the championship is over). */
export const cupRace = (cup: CupState): CupRace => cup.plan[Math.min(cup.done, cup.plan.length - 1)];

/** The track of the next race. */
export const cupTrack = (cup: CupState): string => cupRace(cup).trackId;

export const cupOver = (cup: CupState): boolean => cup.done >= cup.total;

/** Most points first; level on points, the better place in the latest race shared first. */
export function sortStandings(list: CupEntry[]): CupEntry[] {
  const lastPts = (e: CupEntry): number => {
    for (let k = e.races.length - 1; k >= 0; k--) if (e.races[k] !== null) return e.races[k]!;
    return -1;
  };
  return [...list].sort((a, b) => b.points - a.points || lastPts(b) - lastPts(a));
}

/**
 * Score a race: `order` is everyone in the race, first to last. Newcomers join the standings with
 * no points from the earlier races; anyone absent scores nothing this time. Returns a new state.
 */
export function scoreRace(cup: CupState, order: { key: string; name: string; boatId: string; human: boolean }[]): CupState {
  const race = cup.done;
  const byKey = new Map(cup.standings.map((e) => [e.key, { ...e, races: [...e.races] }]));
  order.forEach((r, place) => {
    let e = byKey.get(r.key);
    if (!e) {
      e = { key: r.key, name: r.name, boatId: r.boatId, human: r.human, points: 0, races: Array(race).fill(null) };
      byKey.set(r.key, e);
    }
    e.name = r.name;
    e.boatId = r.boatId;
    e.races[race] = pointsFor(place);
    e.points += pointsFor(place);
  });
  for (const e of byKey.values()) while (e.races.length <= race) e.races.push(null);
  return { done: race + 1, total: cup.total, standings: sortStandings([...byKey.values()]), plan: cup.plan };
}

/**
 * The starting grid of a championship race: fewest points at the front, the leader at the back
 * (a fair shot for everyone, and the leader has to fight through). Those not in the standings yet
 * start in front. Ties keep their order in `keys`.
 */
export function cupGrid<T>(cup: CupState, items: T[], key: (item: T) => string): T[] {
  const pts = new Map(cup.standings.map((e) => [e.key, e.points]));
  return items.map((it, i) => ({ it, i, p: pts.get(key(it)) ?? -1 })).sort((a, b) => a.p - b.p || a.i - b.i).map((x) => x.it);
}
