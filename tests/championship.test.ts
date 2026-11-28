import { describe, expect, it } from 'vitest';
import { CUP_TRACKS, MAX_CUP_RACES, cleanPlan, cupGrid, cupOver, cupRace, cupTrack, defaultPlan, newCup, pointsFor, scoreRace } from '../src/cup/championship';
import { loadTrack } from '../src/data/tracks';
import { TRACK_DEFS } from '../src/data/tracks';
import { TAUNTS, isTaunt } from '../src/data/taunts';

const r = (key: string) => ({ key, name: key.toUpperCase(), boatId: 'tugboat', human: key === 'you' });

describe('championship', () => {
  it('races every track with laps, one after the other', () => {
    // By default four tracks with laps (any track can be added on the championship screen).
    const lapTracks = TRACK_DEFS.filter((d) => d.laps > 1).map((d) => d.id);
    expect(CUP_TRACKS).toHaveLength(4);
    for (const id of CUP_TRACKS) expect(lapTracks).toContain(id);
    let cup = newCup();
    const seen: string[] = [];
    while (!cupOver(cup)) {
      seen.push(cupTrack(cup));
      cup = scoreRace(cup, [r('you'), r('ai1')]);
    }
    expect(seen).toEqual([...CUP_TRACKS]);
  });

  it('gives points by place, adds them up and sorts the standings', () => {
    expect([0, 1, 2, 3, 7, 8].map(pointsFor)).toEqual([10, 8, 6, 5, 1, 0]);
    let cup = newCup();
    cup = scoreRace(cup, [r('a'), r('b'), r('c'), r('d')]);
    cup = scoreRace(cup, [r('d'), r('c'), r('b'), r('a')]);
    // a: 10+5, b: 8+6, c: 6+8, d: 5+10
    expect(cup.standings.map((e) => [e.key, e.points])).toEqual([['d', 15], ['a', 15], ['c', 14], ['b', 14]]); // ties: better last race first
    expect(cup.standings.find((e) => e.key === 'a')!.races).toEqual([10, 5]);
    expect(cup.done).toBe(2);
  });

  it('newcomers start with nothing, the absent score nothing', () => {
    let cup = scoreRace(newCup(), [r('a'), r('b')]);
    cup = scoreRace(cup, [r('c'), r('a')]);
    const by = Object.fromEntries(cup.standings.map((e) => [e.key, e]));
    expect(by.c.races).toEqual([null, 10]);
    expect(by.b.races).toEqual([8, null]);
    expect(by.a.points).toBe(18);
  });

  it('the leader starts at the back', () => {
    const cup = scoreRace(newCup(), [r('a'), r('b'), r('c')]);
    expect(cupGrid(cup, ['a', 'b', 'c', 'new'], (k) => k)).toEqual(['new', 'c', 'b', 'a']);
  });
});

describe('the races of a championship', () => {
  it('any tracks, in any order, with their laps or stretch; nonsense is cleaned up', () => {
    expect(cleanPlan('garbage')).toEqual(defaultPlan());
    expect(cleanPlan([])).toEqual(defaultPlan());
    const plan = cleanPlan([{ trackId: 'champagneHills', laps: 0 }, { trackId: 'reimsCanal' }, { trackId: 'champagneHills', laps: 5 }, { foo: 1 }]);
    expect(plan[0]).toEqual({ trackId: 'champagneHills', laps: 1 });
    expect(plan[1].section).toBeDefined();
    expect(plan[2]).toEqual({ trackId: 'champagneHills', laps: 5 });
    expect(plan).toHaveLength(3);
    expect(cleanPlan(Array(20).fill({ trackId: 'bayouBends', laps: 2 }))).toHaveLength(MAX_CUP_RACES);
    const cup = newCup(plan);
    expect(cup.total).toBe(3);
    expect(cupRace(cup)).toEqual({ trackId: 'champagneHills', laps: 1 });
    expect(loadTrack('champagneHills', null, 5).laps).toBe(5);
    expect(loadTrack('champagneHills').laps).toBe(3);
  });
});

describe('taunts', () => {
  it('knows its taunts', () => {
    expect(TAUNTS.length).toBeGreaterThanOrEqual(5);
    expect(isTaunt('honk')).toBe(true);
    expect(isTaunt('rm -rf')).toBe(false);
    expect(isTaunt(3)).toBe(false);
  });
});
