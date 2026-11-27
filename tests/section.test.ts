import { describe, expect, it } from 'vitest';
import { MIN_SECTION_M, clampSection, defaultSection, getTrackDef, hasSections, loadTrack } from '../src/data/tracks';
import { RaceSimulation, STEP } from '../src/race/RaceSimulation';
import { RoomCore } from '../src/net/room';
import type { ServerMsg } from '../src/net/protocol';

const reims = getTrackDef('reimsCanal');
const [lo, hi] = reims.range!;
const M = reims.pxPerM ?? 10;

describe('stretches of the Reims canal', () => {
  it('the map runs from Passage Marx Dormoy to the Sillery lock; the usual race is a part of it', () => {
    expect(hasSections(reims)).toBe(true);
    expect(hasSections(getTrackDef('lockAndLoad'))).toBe(false);
    expect((hi - lo) / M).toBeGreaterThan(15000);
    const d = defaultSection(reims);
    expect(d.start).toBeGreaterThan(lo + 4000 * M); // Paul Doumer is several km south of Neuvillette
    expect(d.finish).toBe(hi);
    expect(reims.places!.map((p) => p[3])).toEqual(expect.arrayContaining(['Passage Marx Dormoy', 'Boulevard Paul Doumer', 'Pont de Venise']));
  });

  it('keeps any stretch valid: inside the range, in order, at least 1 km', () => {
    expect(clampSection(reims, { start: -1e9, finish: 1e9 })).toEqual({ start: lo, finish: hi });
    const short = clampSection(reims, { start: 50000, finish: 50010 });
    expect(short.finish - short.start).toBe(MIN_SECTION_M * M);
    const backwards = clampSection(reims, { start: 80000, finish: 60000 });
    expect(backwards.finish - backwards.start).toBeGreaterThanOrEqual(MIN_SECTION_M * M);
    expect(clampSection(reims, 'garbage')).toEqual(defaultSection(reims));
    expect(clampSection(reims, { start: NaN, finish: 3 })).toEqual(defaultSection(reims));
  });

  it('a stretch moves the start and finish and spreads the crates over it', () => {
    const t = loadTrack('reimsCanal', { start: 20000, finish: 60000 });
    expect(t.startDist).toBe(20000);
    expect(t.lapLength).toBe(40000);
    expect(t.def.crateRows.length).toBe(15); // every 250 m
    expect(loadTrack('reimsCanal').lapLength).toBe(defaultSection(reims).finish - defaultSection(reims).start);
  });

  it('AI boats race the whole canal and a short stretch to the finish', { timeout: 120000 }, () => {
    for (const section of [{ start: lo, finish: hi }, { start: lo, finish: lo + 1500 * M }]) {
      const sim = new RaceSimulation({ track: loadTrack('reimsCanal', section), playerBoat: null, difficulty: 'river', seed: 3 });
      for (let i = 0; i < 1200 / STEP && sim.phase !== 'over'; i++) sim.step(STEP);
      expect(sim.results().every((r) => r.finished)).toBe(true);
    }
  });

  it('online: the host picks the stretch, the server checks it, and the race uses it', () => {
    let now = 0;
    const room = new RoomCore('ABCD', () => now, 1);
    const got: ServerMsg[] = [];
    const a = { id: 'a', send: (d: string) => got.push(JSON.parse(d)) };
    room.message(a, JSON.stringify({ t: 'join', name: 'A', boatId: 'tugboat' }));
    room.message(a, JSON.stringify({ t: 'settings', settings: { trackId: 'reimsCanal', difficulty: 'river', section: { start: 30000, finish: 1e12 } } }));
    expect(room.settings.section).toEqual({ start: 30000, finish: hi });
    room.message(a, JSON.stringify({ t: 'settings', settings: { trackId: 'lockAndLoad', difficulty: 'river', section: { start: 1, finish: 2 } } }));
    expect(room.settings.section).toBeUndefined();
    room.message(a, JSON.stringify({ t: 'settings', settings: { trackId: 'reimsCanal', difficulty: 'river' } }));
    expect(room.settings.section).toEqual(defaultSection(reims));
    room.message(a, JSON.stringify({ t: 'settings', settings: { trackId: 'reimsCanal', difficulty: 'river', section: { start: 30000, finish: 70000 } } }));
    room.message(a, JSON.stringify({ t: 'start' }));
    expect(room.sim!.track.startDist).toBe(30000);
    expect([...got].reverse().find((m) => m.t === 'start')).toMatchObject({ settings: { section: { start: 30000, finish: 70000 } } });
    now += 1;
  });
});
