import { TUNING } from '../data/items';
import { addEffect } from '../effects/effects';
import type { RaceSimulation } from './RaceSimulation';

/** Something that makes waves: a racer or a barge. */
interface Maker {
  id: number;
  x: number;
  y: number;
  heading: number;
  speed: number;
  mass: number;
  length: number;
  width: number;
}

/**
 * The water between the boats, once per step:
 * - **Wakes**: a moving boat (or barge) leaves a V behind it. A boat on one of its arms is pushed
 *   outward, sideways: harder the heavier and faster the maker and the lighter the receiver, so a
 *   speedboat gets thrown about behind Cabourg while a coal barge hardly notices a speedboat.
 *   Hovercraft float above it all.
 * - **Slipstream**: straight behind a boat, in line with it and both going fast, a boat gets a
 *   little faster after half a second there.
 */
export function applyWater(sim: RaceSimulation, dt: number): void {
  const W = TUNING.wake, D = TUNING.draft, T = TUNING.traffic;
  const racers = sim.racers.filter((r) => r.sinkTimer <= 0 && !sim.isGhost(r));
  const makers: Maker[] = racers.map((r) => ({
    id: r.id, x: r.x, y: r.y, heading: r.heading, speed: Math.hypot(r.vx, r.vy), mass: r.stats.mass,
    length: r.boat.size.length * r.size, width: r.boat.size.width * r.size,
  }));
  for (const p of sim.trafficPoses) {
    if (p.solid) makers.push({ id: -p.id, x: p.x, y: p.y, heading: p.heading, speed: Math.hypot(p.vx, p.vy), mass: T.mass, length: T.length, width: T.width });
  }
  const tan = Math.tan(W.angle);

  for (const b of racers) {
    let drafting = false;
    const bSpeed = Math.hypot(b.vx, b.vy);
    for (const a of makers) {
      if (a.id === b.id || a.speed < W.minSpeed) continue;
      const hx = Math.cos(a.heading), hy = Math.sin(a.heading);
      const nx = -hy, ny = hx;
      const dx = b.x - a.x, dy = b.y - a.y;
      const tail = -(dx * hx + dy * hy) - a.length / 2; // how far behind the maker's stern
      if (tail <= 0 || tail > W.length) continue;
      const p = dx * nx + dy * ny;
      const ap = Math.abs(p);

      // Slipstream: racers only, close, in line, both going fast the same way.
      if (a.id >= 0 && tail < D.reach && ap < a.width / 2 + D.width / 2 && Math.cos(a.heading - b.heading) > 0.85
        && bSpeed > b.stats.topSpeed * D.minSpeed && a.speed > b.stats.topSpeed * D.minSpeed) drafting = true;

      // Wake: on one of the V's arms.
      if (b.boat.specials?.hover) continue;
      const arm = tail * tan + a.width / 2 + 10;
      if (ap < Math.max(a.width / 2, arm - W.band) || ap > arm + W.band * 0.7) continue;
      const ratio = Math.min(W.maxRatio, (a.mass / b.stats.mass) ** 1.5);
      const push = W.push * ratio * Math.min(1, a.speed / 360) * (1 - tail / W.length);
      const side = p >= 0 ? 1 : -1;
      const away = (b.vx * nx + b.vy * ny) * side;
      if (away < W.maxSide) {
        b.vx += nx * side * push * dt;
        b.vy += ny * side * push * dt;
      }
      if (push > W.rock) addEffect(b, 'rocked', 0.35);
    }
    if (drafting) {
      b.draftT += dt;
      if (b.draftT >= D.charge) addEffect(b, 'draft', D.hold);
    } else b.draftT = Math.max(0, b.draftT - dt * 2);
  }
}
