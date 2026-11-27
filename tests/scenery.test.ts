import { describe, expect, it } from 'vitest';
import { TRACK_DEFS, loadTrack } from '../src/data/tracks';
import { generateScenery } from '../src/view/sceneryGen';

/** Distance from a point to the water's edge (negative in the channel). */
function clearance(track: ReturnType<typeof loadTrack>, x: number, y: number): number {
  let best = Infinity;
  for (const s of track.samples) best = Math.min(best, Math.hypot(s.x - x, s.y - y) - s.width / 2);
  return best;
}

describe('generated scenery of the invented tracks', () => {
  for (const def of TRACK_DEFS.filter((d) => !d.scenery)) {
    it(`${def.id}: plenty to look at, nothing built in the water, the same every time`, () => {
      const track = loadTrack(def.id);
      const t0 = performance.now();
      const data = generateScenery(track);
      const ms = performance.now() - t0;
      // eslint-disable-next-line no-console
      console.log(def.id, `${ms.toFixed(0)} ms`, `${data.buildings.length} buildings, ${data.roads.length} road pieces, ${data.trees!.length} trees, ${data.pads!.length} lily pads`);
      expect(ms).toBeLessThan(3000);
      expect(data.trees!.length).toBeGreaterThan(200);
      if (def.theme !== 'bayou') expect(data.buildings.length).toBeGreaterThan(100);
      // Buildings and road points keep clear of the channel.
      for (const [, , ring] of data.buildings) {
        for (let k = 0; k < ring.length; k += 2) expect(clearance(track, ring[k], ring[k + 1])).toBeGreaterThan(20);
      }
      for (const [, w, , line] of data.roads) {
        for (let k = 0; k < line.length; k += 2) expect(clearance(track, line[k], line[k + 1])).toBeGreaterThan(w / 2);
      }
      // Lily pads float inside it.
      for (const [x, y] of data.pads!) expect(clearance(track, x, y)).toBeLessThan(0);
      // Cached, and the same if generated again from scratch.
      expect(generateScenery(track)).toBe(data);
    });
  }
});
