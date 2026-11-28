/**
 * Championship: the lap tracks raced one after the other, points for each place, and the boat
 * with the most points at the end wins. Pure logic, shared by the single-player game and the
 * online room (where the server keeps the standings).
 */

/** The races of a championship, in order: every track with laps. */
export const CUP_TRACKS = ['lockAndLoad', 'industrialEstuary', 'bayouBends', 'champagneHills'] as const;

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
}

export const newCup = (): CupState => ({ done: 0, total: CUP_TRACKS.length, standings: [] });

/** The track of the next race (the last one once the championship is over). */
export const cupTrack = (cup: CupState): string => CUP_TRACKS[Math.min(cup.done, CUP_TRACKS.length - 1)];

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
  return { done: race + 1, total: cup.total, standings: sortStandings([...byKey.values()]) };
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
