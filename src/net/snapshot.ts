import type { ItemId } from '../data/items';
import type { EffectKind } from '../effects/effects';
import type { RaceSimulation } from '../race/RaceSimulation';
import type { Racer, Slot } from '../race/types';

/** Everything a screen needs to show a race, sent by the server about 20 times a second. */
export interface SimState {
  phase: RaceSimulation['phase'];
  cd: number;
  time: number;
  fc: number;
  racers: RacerState[];
  crates: number[];
  vols: [number, number, number | null, number, number, number, number, number][]; // id, owner, target, x, y, heading, age, near
  drills: [number, number, number, number, number, number, number, number, number][]; // id, owner, x, y, heading, travelled, stuck, age, near
  puddles: [number, number, number, number, number][]; // id, owner, x, y, age
  fakes: [number, number, number, number, number][]; // id, owner, x, y, age
  blobs: [number, number, number, number, number, number, number, number][]; // id, owner, x, y, heading, travelled, age, near
}

export interface RacerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  h: number;
  spin: number;
  hull: number;
  prog: number;
  laps: number;
  cp: number;
  pos: number;
  fin: boolean;
  ft: number;
  sink: number;
  ni: number;
  th: number;
  hit: number;
  glue: boolean;
  human: boolean;
  slots: [Slot, Slot];
  ri: ItemId | null;
  rt: number;
  fx: [EffectKind, number, number][];
  laptimes: number[];
}

const r1 = (v: number): number => Math.round(v * 10) / 10;
const r3 = (v: number): number => Math.round(v * 1000) / 1000;

export function encodeState(sim: RaceSimulation): SimState {
  const it = sim.items;
  return {
    phase: sim.phase,
    cd: r3(sim.countdownT),
    time: r3(sim.time),
    fc: r1(sim.finishCountdown),
    racers: sim.racers.map(encodeRacer),
    crates: it.crates.map((c) => r3(c.respawn)),
    vols: it.volunteers.map((v) => [v.id, v.owner, v.targetId, r1(v.x), r1(v.y), r3(v.heading), r3(v.age), v.near]),
    drills: it.drills.map((d) => [d.id, d.owner, r1(d.x), r1(d.y), r3(d.heading), r1(d.travelled), r3(d.stuckT), r3(d.age), d.near]),
    puddles: it.puddles.map((p) => [p.id, p.owner, r1(p.x), r1(p.y), r3(p.age)]),
    fakes: it.fakeCrates.map((f) => [f.id, f.owner, r1(f.x), r1(f.y), r3(f.age)]),
    blobs: it.blobs.map((b) => [b.id, b.owner, r1(b.x), r1(b.y), r3(b.heading), r1(b.travelled), r3(b.age), b.near]),
  };
}

function encodeRacer(r: Racer): RacerState {
  return {
    x: r1(r.x), y: r1(r.y), vx: r1(r.vx), vy: r1(r.vy), h: r3(r.heading), spin: r3(r.spin), hull: r1(r.hull),
    prog: r1(r.progress), laps: r.lapsDone, cp: r.nextCheckpoint, pos: r.position, fin: r.finished, ft: r3(r.finishTime),
    sink: r3(r.sinkTimer), ni: r.nearestIndex, th: r3(r.throttle), hit: r1(Math.min(r.sinceHit, 99)), glue: r.inGlue, human: r.human,
    slots: [r.slots[0] && { ...r.slots[0] }, r.slots[1] && { ...r.slots[1] }], ri: r.rouletteItem, rt: r3(r.rouletteT),
    fx: r.effects.map((e) => [e.kind, r3(e.remaining), r3(e.duration)]), laptimes: r.lapTimes.map(r3),
  };
}

/** Copy one racer's state from a snapshot into a local racer. */
export function applyRacer(r: Racer, s: RacerState): void {
  r.x = s.x; r.y = s.y; r.vx = s.vx; r.vy = s.vy; r.heading = s.h; r.spin = s.spin; r.hull = s.hull;
  r.progress = s.prog; r.lapsDone = s.laps; r.nextCheckpoint = s.cp; r.position = s.pos; r.finished = s.fin; r.finishTime = s.ft;
  r.sinkTimer = s.sink; r.nearestIndex = s.ni; r.throttle = s.th; r.sinceHit = s.hit; r.inGlue = s.glue; r.human = s.human;
  r.slots = [s.slots[0] && { ...s.slots[0] }, s.slots[1] && { ...s.slots[1] }];
  r.rouletteItem = s.ri; r.rouletteT = s.rt;
  r.effects = s.fx.map(([kind, remaining, duration]) => ({ kind, remaining, duration }));
  r.lapTimes = [...s.laptimes];
}

/**
 * Make a local copy of a race match a snapshot. `except` (the local player's racer, which this
 * screen predicts itself) is left alone.
 */
export function applyState(sim: RaceSimulation, s: SimState, except = -1): void {
  sim.phase = s.phase;
  sim.countdownT = s.cd;
  sim.time = s.time;
  sim.finishCountdown = s.fc;
  s.racers.forEach((rs, i) => {
    if (i !== except && sim.racers[i]) applyRacer(sim.racers[i], rs);
  });
  sim.updateRanking();
  const it = sim.items;
  s.crates.forEach((v, i) => {
    if (it.crates[i]) it.crates[i].respawn = v;
  });
  it.volunteers = s.vols.map(([id, owner, targetId, x, y, heading, age, near]) => ({ id, owner, targetId, x, y, heading, age, near, locked: false, dead: false }));
  it.drills = s.drills.map(([id, owner, x, y, heading, travelled, stuckT, age, near]) => ({ id, owner, x, y, heading, travelled, stuckT, age, near, dead: false }));
  it.puddles = s.puddles.map(([id, owner, x, y, age]) => ({ id, owner, x, y, age, boatsStuck: new Set<number>(), dead: false }));
  it.fakeCrates = s.fakes.map(([id, owner, x, y, age]) => ({ id, owner, x, y, age, dead: false }));
  it.blobs = s.blobs.map(([id, owner, x, y, heading, travelled, age, near]) => ({ id, owner, x, y, heading, travelled, age, near, dead: false }));
}
