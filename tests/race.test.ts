import { describe, expect, it } from 'vitest';
import { TRACK_DEFS, loadTrack } from '../src/data/tracks';
import { RaceSimulation, STEP } from '../src/race/RaceSimulation';
import { hasEffect } from '../src/effects/effects';

function run(sim: RaceSimulation, seconds: number): void {
  for (let i = 0; i < seconds / STEP && sim.phase !== 'over'; i++) sim.step(STEP);
}

describe('headless races', () => {
  for (const def of TRACK_DEFS) {
    it(`${def.id}: 4 AI boats finish the race`, () => {
      const sim = new RaceSimulation({ track: loadTrack(def.id), playerBoat: null, difficulty: 'river', seed: 7 });
      run(sim, 400);
      const res = sim.results();
      expect(res.every((r) => r.finished)).toBe(true);
      const lap = res.map((r) => Math.min(...r.racer.lapTimes));
      // eslint-disable-next-line no-console
      console.log(def.id, res.map((r) => `${r.racer.boat.name} ${r.time.toFixed(1)}s (best lap ${Math.min(...r.racer.lapTimes).toFixed(1)}, hull ${r.racer.hull.toFixed(0)})`).join(' | '));
      expect(Math.min(...lap)).toBeGreaterThan(10);
    });
  }

  it('a player-less race is deterministic for a seed', () => {
    const a = new RaceSimulation({ track: loadTrack('lockAndLoad'), playerBoat: null, difficulty: 'river', seed: 3 });
    const b = new RaceSimulation({ track: loadTrack('lockAndLoad'), playerBoat: null, difficulty: 'river', seed: 3 });
    run(a, 60);
    run(b, 60);
    expect(a.racers.map((r) => r.progress)).toEqual(b.racers.map((r) => r.progress));
  });

  it('counts laps in order and ranks by progress', () => {
    const sim = new RaceSimulation({ track: loadTrack('lockAndLoad'), playerBoat: null, difficulty: 'river', seed: 5 });
    run(sim, 30);
    const sorted = [...sim.racers].sort((x, y) => x.position - y.position);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i - 1].progress).toBeGreaterThanOrEqual(sorted[i].progress);
  });

  it('a volunteer hits the racer ahead and spins it out', () => {
    const sim = new RaceSimulation({ track: loadTrack('lockAndLoad'), playerBoat: null, difficulty: 'river', seed: 11, forcedItem: 'volunteer' });
    run(sim, 8);
    const [first, second] = [...sim.racers].sort((a, b) => a.position - b.position);
    for (const r of sim.racers) r.item = null;
    sim.items.volunteers.length = 0;
    second.item = 'volunteer';
    second.itemUses = 1;
    first.hull = first.stats.maxHull;
    const hullBefore = first.hull;
    sim.items.use(second, 'forward');
    expect(sim.items.volunteers.length).toBe(1);
    for (let i = 0; i < 60 * 6 && sim.items.volunteers.length; i++) {
      for (const r of sim.racers) r.item = null;
      sim.step(STEP);
    }
    expect(first.hull).toBeLessThan(hullBefore);
  });

  it('sinking respawns the boat on the track', () => {
    const sim = new RaceSimulation({ track: loadTrack('lockAndLoad'), playerBoat: null, difficulty: 'river', seed: 2 });
    run(sim, 10);
    const r = sim.racers[0];
    sim.hit(r, 9999, null, 'drill');
    expect(r.sinkTimer).toBeGreaterThan(0);
    run(sim, 2.5);
    expect(r.sinkTimer).toBeLessThanOrEqual(0);
    expect(r.hull).toBe(r.stats.maxHull);
    expect(hasEffect(r, 'invulnerable')).toBe(true);
  });
});
