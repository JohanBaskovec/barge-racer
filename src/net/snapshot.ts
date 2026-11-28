import type { ItemId } from '../data/items';
import type { EffectKind } from '../effects/effects';
import type { RaceSimulation } from '../race/RaceSimulation';
import { setRacerSize } from '../physics/BoatPhysics';
import type { Racer, Slot } from '../race/types';

/** Everything a screen needs to show a race, sent by the server about 20 times a second. */
export interface SimState {
  phase: RaceSimulation['phase'];
  /** Steps since the start (the traffic's clock: barges are computed from it on every screen). */
  k: number;
  cd: number;
  time: number;
  fc: number;
  racers: RacerState[];
  crates: number[];
  /** Crates a mushroom has pulled away from home: id, x, y (the others sit at home). */
  cpos: [number, number, number][];
  vols: [number, number, number | null, number, number, number, number, number][]; // id, owner, target, x, y, heading, age, near
  drills: [number, number, number, number, number, number, number, number, number][]; // id, owner, x, y, heading, travelled, stuck, age, near
  puddles: [number, number, number, number, number][]; // id, owner, x, y, age
  fakes: [number, number, number, number, number][]; // id, owner, x, y, age
  blobs: [number, number, number, number, number, number, number, number][]; // id, owner, x, y, heading, travelled, age, near
  shots: [number, number, number, number, number, number, number, number, number, number][]; // id, owner, kind, x, y, heading, travelled, age, near, wait
  boobs: [number, number, number, number, number, number, number, number[]][]; // id, owner, target, x, y, heading, age, hit
  clouds: [number, number, number, number, number, number][]; // id, owner, kind, x, y, age
  drops: [number, number, number, number, number, number, number][]; // id, x, y, fromX, fromY, age, target
}

export interface RacerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  h: number;
  spin: number;
  hull: number;
  cu: number;
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
  /** Size: 1, or smaller while shrunk by a mushroom. */
  sz: number;
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
    k: sim.steps,
    cd: r3(sim.countdownT),
    time: r3(sim.time),
    fc: r1(sim.finishCountdown),
    racers: sim.racers.map(encodeRacer),
    crates: it.crates.map((c) => r3(c.respawn)),
    cpos: it.crates.filter((c) => c.x !== c.homeX || c.y !== c.homeY).map((c) => [c.id, r1(c.x), r1(c.y)]),
    vols: it.volunteers.map((v) => [v.id, v.owner, v.targetId, r1(v.x), r1(v.y), r3(v.heading), r3(v.age), v.near]),
    drills: it.drills.map((d) => [d.id, d.owner, r1(d.x), r1(d.y), r3(d.heading), r1(d.travelled), r3(d.stuckT), r3(d.age), d.near]),
    puddles: it.puddles.map((p) => [p.id, p.owner, r1(p.x), r1(p.y), r3(p.age)]),
    fakes: it.fakeCrates.map((f) => [f.id, f.owner, r1(f.x), r1(f.y), r3(f.age)]),
    blobs: it.blobs.map((b) => [b.id, b.owner, r1(b.x), r1(b.y), r3(b.heading), r1(b.travelled), r3(b.age), b.near]),
    shots: it.shots.map((s) => [s.id, s.owner, s.kind, r1(s.x), r1(s.y), r3(s.heading), r1(s.travelled), r3(s.age), s.near, r3(s.wait)]),
    boobs: it.boobs.map((b) => [b.id, b.owner, b.target, r1(b.x), r1(b.y), r3(b.heading), r3(b.age), [...b.hit]]),
    clouds: it.clouds.map((c) => [c.id, c.owner, c.kind, r1(c.x), r1(c.y), r3(c.age)]),
    drops: it.drops.map((d) => [d.id, r1(d.x), r1(d.y), r1(d.fromX), r1(d.fromY), r3(d.age), d.target]),
  };
}

function encodeRacer(r: Racer): RacerState {
  return {
    x: r1(r.x), y: r1(r.y), vx: r1(r.vx), vy: r1(r.vy), h: r3(r.heading), spin: r3(r.spin), hull: r1(r.hull), cu: r3(r.catchUp),
    prog: r1(r.progress), laps: r.lapsDone, cp: r.nextCheckpoint, pos: r.position, fin: r.finished, ft: r3(r.finishTime),
    sink: r3(r.sinkTimer), ni: r.nearestIndex, th: r3(r.throttle), hit: r1(Math.min(r.sinceHit, 99)), sz: r3(r.size), glue: r.inGlue, human: r.human,
    slots: [r.slots[0] && { ...r.slots[0] }, r.slots[1] && { ...r.slots[1] }], ri: r.rouletteItem, rt: r3(r.rouletteT),
    fx: r.effects.map((e) => [e.kind, r3(e.remaining), r3(e.duration)]), laptimes: r.lapTimes.map(r3),
  };
}

/** Copy one racer's state from a snapshot into a local racer. */
export function applyRacer(r: Racer, s: RacerState): void {
  r.x = s.x; r.y = s.y; r.vx = s.vx; r.vy = s.vy; r.heading = s.h; r.spin = s.spin; r.hull = s.hull; r.catchUp = s.cu ?? 1;
  r.progress = s.prog; r.lapsDone = s.laps; r.nextCheckpoint = s.cp; r.position = s.pos; r.finished = s.fin; r.finishTime = s.ft;
  r.sinkTimer = s.sink; r.nearestIndex = s.ni; r.throttle = s.th; r.sinceHit = s.hit; r.inGlue = s.glue; r.human = s.human;
  setRacerSize(r, s.sz);
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
  sim.steps = s.k;
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
  for (const c of it.crates) {
    c.x = c.homeX;
    c.y = c.homeY;
  }
  for (const [id, x, y] of s.cpos) {
    const c = it.crates.find((k) => k.id === id);
    if (c) {
      c.x = x;
      c.y = y;
    }
  }
  it.volunteers = s.vols.map(([id, owner, targetId, x, y, heading, age, near]) => ({ id, owner, targetId, x, y, heading, age, near, locked: false, dead: false }));
  it.drills = s.drills.map(([id, owner, x, y, heading, travelled, stuckT, age, near]) => ({ id, owner, x, y, heading, travelled, stuckT, age, near, dead: false }));
  it.puddles = s.puddles.map(([id, owner, x, y, age]) => ({ id, owner, x, y, age, boatsStuck: new Set<number>(), dead: false }));
  it.fakeCrates = s.fakes.map(([id, owner, x, y, age]) => ({ id, owner, x, y, age, dead: false }));
  it.blobs = s.blobs.map(([id, owner, x, y, heading, travelled, age, near]) => ({ id, owner, x, y, heading, travelled, age, near, dead: false }));
  it.shots = s.shots.map(([id, owner, kind, x, y, heading, travelled, age, near, wait]) => ({ id, owner, kind: kind as 0 | 1 | 2, x, y, heading, travelled, age, near, wait: wait ?? 0, dead: false }));
  it.boobs = (s.boobs ?? []).map(([id, owner, target, x, y, heading, age, hit]) => ({ id, owner, target, x, y, heading, age, hit: [...hit], dead: false }));
  it.clouds = s.clouds.map(([id, owner, kind, x, y, age]) => ({ id, owner, kind: kind as 0 | 1, x, y, age, dead: false }));
  it.drops = s.drops.map(([id, x, y, fromX, fromY, age, target]) => ({ id, x, y, fromX, fromY, age, target, dead: false }));
}
