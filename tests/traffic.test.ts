import { describe, expect, it } from 'vitest';
import { TUNING } from '../src/data/items';
import { TRACK_DEFS, loadTrack } from '../src/data/tracks';
import { addEffect, hasEffect } from '../src/effects/effects';
import { OnlineRace } from '../src/net/onlineRace';
import { applyState, encodeState } from '../src/net/snapshot';
import { capsule } from '../src/physics/collisions';
import { RaceSimulation, STEP } from '../src/race/RaceSimulation';
import { type BargePose, bargeCapsule } from '../src/race/traffic';
import type { Controller, ControlIntent, Racer } from '../src/race/types';

const idle: Controller = { update: () => ({ desiredHeading: null, throttle: 0, fire: null }) };
const straight = (heading: number, throttle = 1): Controller => ({ update: (): ControlIntent => ({ desiredHeading: heading, throttle, fire: null }) });

function race(trackId = 'lockAndLoad', seed = 5): RaceSimulation {
  return new RaceSimulation({ track: loadTrack(trackId), playerBoat: null, difficulty: 'river', seed });
}
/** Past the countdown, nobody driving, crates out of play, everyone but `keep` far away. */
function quiet(sim: RaceSimulation, keep: number[]): void {
  while (sim.phase === 'countdown') sim.step(STEP);
  for (const c of sim.items.crates) c.respawn = 1e9;
  for (const r of sim.racers) {
    r.slots = [null, null];
    sim.setController(r.id, idle);
    r.vx = r.vy = 0;
    if (!keep.includes(r.id)) {
      r.x += 60000;
      r.y += 60000;
    }
  }
}
const step = (sim: RaceSimulation, seconds: number, each?: () => void): void => {
  for (let i = 0; i < seconds / STEP; i++) {
    each?.();
    sim.step(STEP);
  }
};
/** Distance between a boat's hull and a barge's hull (negative if they overlap). */
function gap(r: Racer, p: BargePose): number {
  const a = capsule(r), b = bargeCapsule(p);
  let best = Infinity;
  for (let i = 0; i <= 20; i++) {
    const x = a.ax + ((a.bx - a.ax) * i) / 20, y = a.ay + ((a.by - a.ay) * i) / 20;
    const dx = b.bx - b.ax, dy = b.by - b.ay;
    const t = Math.max(0, Math.min(1, ((x - b.ax) * dx + (y - b.ay) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(x - (b.ax + dx * t), y - (b.ay + dy * t)) - a.radius - b.radius);
  }
  return best;
}

describe('traffic', () => {
  it('is the same on every screen (it only depends on the seed and the clock), different with another seed', () => {
    const a = race('lockAndLoad', 9), b = race('lockAndLoad', 9), c = race('lockAndLoad', 10);
    expect(a.traffic.poses(123.4)).toEqual(b.traffic.poses(123.4));
    expect(a.traffic.poses(0)).not.toEqual(c.traffic.poses(0));
  });

  it('every track has barges both ways; the long Reims canal has many', () => {
    for (const def of TRACK_DEFS) {
      const sim = race(def.id);
      expect(sim.traffic.barges.some((b) => b.dir === 1) && sim.traffic.barges.some((b) => b.dir === -1), def.id).toBe(true);
    }
    expect(race('reimsCanal').traffic.barges.length).toBeGreaterThan(30);
  });

  it('barges stay in the water, keep to their side and never run into each other, all race long', () => {
    for (const def of TRACK_DEFS) {
      const sim = race(def.id);
      const track = sim.track;
      for (let t = 0; t < 900; t += 7.3) {
        const poses = sim.traffic.poses(t);
        for (const p of poses) {
          if (!p.solid) continue;
          const n = track.nearest(p.x, p.y, -1);
          expect(Math.abs(n.lateral) + TUNING.traffic.width / 2, `${def.id} t=${t}`).toBeLessThanOrEqual(track.halfWidth(n.index) + 1);
        }
        for (let i = 0; i < poses.length; i++) {
          for (let j = i + 1; j < poses.length; j++) {
            if (!poses[i].solid || !poses[j].solid) continue;
            const a = bargeCapsule(poses[i]), b = bargeCapsule(poses[j]);
            const close = Math.hypot(poses[i].x - poses[j].x, poses[i].y - poses[j].y) < TUNING.traffic.length;
            if (close) expect(Math.min(Math.hypot(a.ax - b.ax, a.ay - b.ay), Math.hypot(a.bx - b.bx, a.by - b.by)), `${def.id} t=${t}`).toBeGreaterThan(TUNING.traffic.width - 4);
          }
        }
      }
    }
  });

  it('no barge sits on the starting grid', () => {
    for (const def of TRACK_DEFS) {
      const sim = race(def.id);
      for (const r of sim.racers) for (const p of sim.traffic.poses(0)) expect(gap(r, p), def.id).toBeGreaterThan(30);
    }
  });

  it('a boat cannot drive through a barge, and one met head-on is shoved aside, not bulldozed', () => {
    const sim = race();
    quiet(sim, [0]);
    const r = sim.racers[0];
    // Wait for an oncoming barge, then park the boat dead ahead of its bow.
    const oncoming = sim.traffic.barges.find((b) => b.dir === -1)!;
    let p = sim.trafficPoses.find((q) => q.id === oncoming.id)!;
    for (let i = 0; i < 600 && !p.solid; i++) {
      sim.step(STEP);
      p = sim.trafficPoses.find((q) => q.id === oncoming.id)!;
    }
    r.x = p.x + Math.cos(p.heading) * (TUNING.traffic.length / 2 + 60);
    r.y = p.y + Math.sin(p.heading) * (TUNING.traffic.length / 2 + 60);
    r.heading = p.heading + Math.PI;
    const start = { x: r.x, y: r.y };
    let worst = Infinity;
    step(sim, 3, () => {
      const q = sim.trafficPoses.find((k) => k.id === oncoming.id)!;
      worst = Math.min(worst, gap(r, q));
    });
    expect(worst).toBeGreaterThan(-2); // never inside it
    const moved = { x: r.x - start.x, y: r.y - start.y };
    const along = moved.x * Math.cos(p.heading) + moved.y * Math.sin(p.heading);
    expect(along).toBeLessThan(200); // the barge went by; it did not push the boat 300 px ahead of it
  });

  it('stops drills and raclette shots', () => {
    const sim = race();
    quiet(sim, [0]);
    const r = sim.racers[0];
    const p = sim.trafficPoses.find((q) => q.solid)!;
    r.x = p.x + Math.cos(p.heading + Math.PI / 2) * 220;
    r.y = p.y + Math.sin(p.heading + Math.PI / 2) * 220;
    r.heading = Math.atan2(p.y - r.y, p.x - r.x);
    sim.items.give(r, 'drill');
    sim.items.use(r, 0, 'forward');
    const d = sim.items.drills[0];
    step(sim, 0.5);
    expect(d.stuckT > 0 || d.dead).toBe(true);
    expect(d.travelled).toBeLessThan(400);
  });

  it('a boat a Kärcher pushes into a barge crashes, as into the bank', () => {
    const sim = race();
    quiet(sim, [0]);
    const r = sim.racers[0];
    const p = sim.trafficPoses.find((q) => q.solid)!;
    const nx = -Math.sin(p.heading), ny = Math.cos(p.heading);
    r.x = p.x + nx * 60;
    r.y = p.y + ny * 60;
    r.heading = p.heading;
    addEffect(r, 'soaked', 1);
    r.soakedBy = 2;
    r.vx = -nx * 250;
    r.vy = -ny * 250;
    sim.takeEvents();
    step(sim, 0.3);
    expect(sim.takeEvents().some((e) => e.type === 'hit' && e.source === 'karcher' && e.racer === r.id)).toBe(true);
  });
});

describe('barges toss crates to the boats behind', () => {
  /** A race where boat 1 (not leading) sits near a barge and the leader is far away. */
  function setup(): { sim: RaceSimulation; target: Racer; leader: Racer; pose: BargePose } {
    const sim = race();
    quiet(sim, [0, 1]);
    const [leader, target] = sim.racers;
    leader.progress = 5000;
    target.progress = 1000;
    sim.updateRanking();
    const pose = sim.trafficPoses.find((q) => q.solid && q.alpha === 1)!;
    const nx = -Math.sin(pose.heading), ny = Math.cos(pose.heading);
    const side = -Math.sign(pose.lat || 1);
    target.x = pose.x + nx * side * 110;
    target.y = pose.y + ny * side * 110;
    target.nearestIndex = sim.track.nearest(target.x, target.y, -1).index;
    target.progress = sim.track.nearest(target.x, target.y, -1).along;
    leader.x = target.x + 30000;
    leader.progress = target.progress + 5000;
    for (const b of sim.traffic.barges) b.dropT = b.id === pose.id ? 0.1 : 1e9;
    return { sim, target, leader, pose };
  }
  const hold = (sim: RaceSimulation, r: Racer) => {
    const { x, y } = r;
    return () => {
      r.x = x;
      r.y = y;
      r.vx = r.vy = 0;
      sim.updateRanking();
    };
  };

  it('to a boat that is not leading and has a free slot: ahead of it, in its line, in the water', () => {
    const { sim, target } = setup();
    sim.takeEvents();
    step(sim, 0.5, hold(sim, target));
    const ev = sim.takeEvents().find((e) => e.type === 'drop');
    expect(ev && ev.type === 'drop' && ev.racer).toBe(target.id);
    const d = sim.items.drops[0];
    const n = sim.track.nearest(d.x, d.y, -1);
    expect(Math.abs(n.lateral)).toBeLessThan(sim.track.halfWidth(n.index));
    const ahead = n.along - sim.track.nearest(target.x, target.y, -1).along;
    expect(ahead).toBeGreaterThan(TUNING.traffic.dropAhead * 0.7);
  });

  it('never to the leader, and the leader cannot pick one up; the boats behind can', () => {
    const { sim, target, leader } = setup();
    step(sim, 0.5, hold(sim, target));
    const d = sim.items.drops[0];
    step(sim, TUNING.traffic.tossTime);
    // The leader drives over it: nothing.
    leader.x = d.x;
    leader.y = d.y;
    sim.step(STEP);
    expect(leader.position).toBe(0);
    expect(leader.rouletteItem).toBeNull();
    expect(sim.items.drops.length).toBe(1);
    // The boat it was for takes it.
    target.x = d.x;
    target.y = d.y;
    leader.x += 30000;
    sim.step(STEP);
    expect(sim.items.drops.length).toBe(0);
    expect(target.rouletteItem).not.toBeNull();
  });

  it('is not thrown to the leader even when the leader is the only one near a barge', () => {
    const { sim, target, leader } = setup();
    // Swap: the boat by the barge is now leading.
    target.progress = leader.progress + 1000;
    sim.updateRanking();
    expect(target.position).toBe(0);
    step(sim, 3, () => sim.updateRanking());
    expect(sim.items.drops.length).toBe(0);
  });

  it('not to a boat whose slots are full, not too often, and sinks after a while', () => {
    const { sim, target } = setup();
    sim.items.give(target, 'glue');
    sim.items.give(target, 'drill');
    step(sim, 1, hold(sim, target));
    expect(sim.items.drops.length).toBe(0);
    target.slots = [null, null];
    step(sim, 1.2, hold(sim, target));
    expect(sim.items.drops.length).toBe(1);
    for (const b of sim.traffic.barges) b.dropT = 0; // every barge would like to, again
    step(sim, TUNING.traffic.dropEvery * 0.5, hold(sim, target));
    expect(sim.items.drops.length).toBe(1); // not again so soon
    step(sim, TUNING.traffic.dropLife);
    expect(sim.items.drops.some((d) => d.age > TUNING.traffic.dropLife)).toBe(false);
  });
});

describe('wakes and slipstream', () => {
  /** Two boats on open water, `back` placed relative to `front` (f px ahead of it, p px to its side), both driving straight. */
  function pair(frontBoat: string, backBoat: string, f: number, p: number) {
    const sim = new RaceSimulation({ track: loadTrack('lockAndLoad'), playerBoat: backBoat, difficulty: 'river', seed: 3 });
    quiet(sim, []);
    sim.traffic.barges.length = 0;
    sim.trafficPoses = [];
    const back = sim.player!;
    const front = sim.racers.find((r) => r !== back && r.boat.id === frontBoat) ?? sim.racers.find((r) => r !== back)!;
    for (const r of sim.racers) if (r !== back && r !== front) r.x += 60000;
    const along = sim.track.alongOf(back.progress + 1500);
    const a = sim.track.pointAt(along, 0);
    const h = a.heading, c = Math.cos(h), s = Math.sin(h);
    Object.assign(front, { x: a.x, y: a.y, heading: h, vx: c * 330, vy: s * 330 });
    Object.assign(back, { x: a.x + c * f - s * p, y: a.y + s * f + c * p, heading: h, vx: c * 330, vy: s * 330 });
    // (teleported boats must know where they are on the track, or the bank check pushes them)
    for (const r of [front, back]) {
      const n = sim.track.nearest(r.x, r.y, -1);
      r.nearestIndex = n.index;
      r.progress = n.along;
    }
    sim.setController(front.id, straight(h));
    sim.setController(back.id, straight(h));
    return { sim, front, back, h };
  }
  const sideways = (r: Racer, h: number): number => -r.vx * Math.sin(h) + r.vy * Math.cos(h);

  it('right behind a boat, a boat gets a slipstream after half a second, and goes faster', () => {
    const { sim, back, front } = pair('fireBoat', 'fireBoat', -150, 0);
    step(sim, TUNING.draft.charge * 0.6);
    expect(hasEffect(back, 'draft')).toBe(false);
    step(sim, TUNING.draft.charge);
    expect(hasEffect(back, 'draft')).toBe(true);
    expect(hasEffect(front, 'draft')).toBe(false);
    const gap0 = Math.hypot(front.x - back.x, front.y - back.y);
    step(sim, 1);
    expect(Math.hypot(front.x - back.x, front.y - back.y)).toBeLessThan(gap0 - 10); // catching up
  });

  it('no slipstream beside a boat, or behind a slow one', () => {
    expect(hasEffect((() => { const x = pair('fireBoat', 'fireBoat', -40, 120); step(x.sim, 1.2); return x.back; })(), 'draft')).toBe(false);
    const slow = pair('fireBoat', 'fireBoat', -280, 0);
    slow.sim.setController(slow.front.id, straight(slow.h, 0.1));
    slow.front.vx *= 0.2;
    slow.front.vy *= 0.2;
    step(slow.sim, 0.6); // (before it runs into the slow one)
    expect(hasEffect(slow.back, 'draft')).toBe(false);
  });

  it("a light boat on a heavy boat's wake is thrown sideways; a heavy one behind a light boat hardly moves", () => {
    const light = pair('cabourg', 'cigaretteSpeedboat', -260, 70);
    step(light.sim, 0.4);
    const heavy = pair('cigaretteSpeedboat', 'coalBarge', -230, 50);
    step(heavy.sim, 0.4);
    const pushLight = Math.abs(sideways(light.back, light.h));
    const pushHeavy = Math.abs(sideways(heavy.back, heavy.h));
    expect(pushLight).toBeGreaterThan(40);
    expect(pushLight).toBeGreaterThan(pushHeavy * 4);
    expect(hasEffect(light.back, 'rocked')).toBe(true);
    expect(sideways(light.back, light.h) * 70).toBeGreaterThan(0); // pushed outward, away from the wake's middle
  });

  it('a hovercraft floats over wakes', () => {
    const hover = pair('cabourg', 'hovercraft', -260, 70);
    step(hover.sim, 0.4);
    expect(Math.abs(sideways(hover.back, hover.h))).toBeLessThan(10);
  });
});

describe('traffic online', () => {
  it('drops cross the network, and each screen puts the barges where the server has them', () => {
    const server = race('bayouBends', 4);
    const screen = race('bayouBends', 4);
    step(server, 9);
    server.items.drops.push({ id: 77, x: 10, y: 20, fromX: 30, fromY: 40, age: 0.2, target: 1, dead: false });
    applyState(screen, JSON.parse(JSON.stringify(encodeState(server))));
    expect(screen.steps).toBe(server.steps);
    expect(screen.items.drops).toEqual([{ id: 77, x: 10, y: 20, fromX: 30, fromY: 40, age: 0.2, target: 1, dead: false }]);
    expect(screen.traffic.poses(screen.steps * STEP)).toEqual(server.trafficPoses);
  });

  it('your boat cannot go through a barge on your own screen either (prediction knows the barges)', () => {
    const server = new RaceSimulation({ track: loadTrack('lockAndLoad'), difficulty: 'river', seed: 7, roster: [
      { name: 'A', boatId: 'tugboat', human: true }, { name: 'B', boatId: 'narrowboat', human: false },
      { name: 'C', boatId: 'cabourg', human: false }, { name: 'D', boatId: 'cigaretteSpeedboat', human: false },
    ], localRacer: 0 });
    const screen = new RaceSimulation({ track: server.track, difficulty: 'river', seed: 7, roster: [
      { name: 'A', boatId: 'tugboat', human: true }, { name: 'B', boatId: 'narrowboat', human: false },
      { name: 'C', boatId: 'cabourg', human: false }, { name: 'D', boatId: 'cigaretteSpeedboat', human: false },
    ], localRacer: 0 });
    step(server, 5);
    const me = server.racers[0];
    const p = server.trafficPoses.find((q) => q.solid)!;
    // Park our boat beside the barge, aimed straight at it.
    const nx = -Math.sin(p.heading), ny = Math.cos(p.heading);
    me.x = p.x + nx * 90;
    me.y = p.y + ny * 90;
    me.heading = Math.atan2(-ny, -nx);
    me.vx = me.vy = 0;
    screen.phase = 'racing';
    const online = new OnlineRace(screen, screen.player);
    online.onSnap({ t: 'snap', s: server.steps, ack: 0, state: JSON.parse(JSON.stringify(encodeState(server))), ev: [] }, 0);
    for (let i = 0; i < 60; i++) online.local({ desiredHeading: me.heading, throttle: 1, fire: null });
    const at = screen.traffic.poses(online.trafficTime).find((q) => q.id === p.id)!;
    expect(gap(screen.player!, at)).toBeGreaterThan(-2);
  });
});
