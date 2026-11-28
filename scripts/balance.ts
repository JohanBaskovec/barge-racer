/**
 * Balance check: AI-only races, every boat driven by the same AI at the same skill, so differences
 * come from the boats and the race rules alone. Prints each boat's wins and average place, how often
 * the lead changes hands, and the gaps at the finish.
 *
 *   npx vite-node scripts/balance.ts [races=120] [track=lockAndLoad] [difficulty=river] [items=1]
 */
import { BOATS } from '../src/data/boats';
import { loadTrack } from '../src/data/tracks';
import { DIFFICULTIES, type Difficulty } from '../src/data/difficulty';
import { AIController } from '../src/control/AIController';
import { Rng } from '../src/physics/math';
import { RaceSimulation } from '../src/race/RaceSimulation';
import { STEP } from '../src/race/RaceSimulation';

const races = Number(process.argv[2] ?? 120);
const trackId = process.argv[3] ?? 'lockAndLoad';
const difficulty = (process.argv[4] ?? 'river') as Difficulty;
const useItems = process.argv[5] !== '0';

const track = loadTrack(trackId);
const stats = new Map(BOATS.map((b) => [b.id, { races: 0, wins: 0, placeSum: 0 }]));
const hitsByPos = [0, 0, 0, 0], firedByPos = [0, 0, 0, 0], sunkByPos = [0, 0, 0, 0];
let leadChanges = 0, gapSum = 0, gapN = 0, lastGapSum = 0, timeSum = 0;
const rng = new Rng(12345);

for (let n = 0; n < races; n++) {
  // Four boats drawn at random, in a random grid order.
  const pool = BOATS.map((b) => b.id);
  const ids: string[] = [];
  for (let k = 0; k < 4; k++) ids.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
  const ai = new Rng(n + 1);
  const sim = new RaceSimulation({
    track, difficulty, seed: 1000 + n,
    roster: ids.map((id, i) => ({ name: `ai${i}`, boatId: id, human: false, controller: new AIController(ai, DIFFICULTIES[difficulty], 0) })),
  });
  if (!useItems) sim.items.crates.length = 0;
  let leader = -1, t = 0, cand = -1, candT = 0;
  while (sim.phase !== 'over' && t < 600) {
    sim.step(STEP);
    t += STEP;
    for (const e of sim.takeEvents()) {
      if (e.type === 'hit' && e.source !== 'bank') hitsByPos[sim.racers[e.racer].position]++;
      if (e.type === 'itemUsed') firedByPos[sim.racers[e.racer].position]++;
      if (e.type === 'sunk') sunkByPos[sim.racers[e.racer].position]++;
    }
    if (sim.phase !== 'racing') continue;
    const lead = sim.racers.find((r) => r.position === 0)!;
    // A lead change counts once the new leader has held it for a second (no flicker in a duel).
    if (lead.id === leader || sim.time < 3) { cand = -1; if (leader < 0) leader = lead.id; continue; }
    if (lead.id !== cand) { cand = lead.id; candT = 0; }
    candT += STEP;
    if (candT >= 1) {
      leadChanges++;
      leader = lead.id;
      cand = -1;
    }
  }
  const order = [...sim.racers].sort((a, b) => a.position - b.position);
  order.forEach((r, place) => {
    const s = stats.get(r.boat.id)!;
    s.races++;
    s.placeSum += place + 1;
    if (place === 0) s.wins++;
  });
  const done = order.filter((r) => r.finished);
  if (done.length >= 2) { gapSum += done[1].finishTime - done[0].finishTime; gapN++; }
  if (done.length === order.length) lastGapSum += done[done.length - 1].finishTime - done[0].finishTime;
  timeSum += done[0]?.finishTime ?? t;
}

console.log(`${races} races on ${trackId} (${difficulty}, items ${useItems ? 'on' : 'off'}): winner's time ${(timeSum / races).toFixed(1)} s`);
console.log(`lead changes per race ${(leadChanges / races).toFixed(2)}, gap 1st-2nd ${(gapSum / Math.max(1, gapN)).toFixed(2)} s, 1st-last ${(lastGapSum / races).toFixed(2)} s`);
const per = (a: number[]): string => a.map((v) => (v / races).toFixed(1)).join(' / ');
console.log(`per race, by place 1st/2nd/3rd/4th: hits taken ${per(hitsByPos)}, items fired ${per(firedByPos)}, sunk ${per(sunkByPos)}`);
for (const [id, s] of [...stats].sort((a, b) => b[1].wins / Math.max(1, b[1].races) - a[1].wins / Math.max(1, a[1].races))) {
  console.log(`  ${id.padEnd(20)} wins ${((100 * s.wins) / Math.max(1, s.races)).toFixed(0).padStart(3)}%  avg place ${(s.placeSum / Math.max(1, s.races)).toFixed(2)}  (${s.races} races)`);
}
