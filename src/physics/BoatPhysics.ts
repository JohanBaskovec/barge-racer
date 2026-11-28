import { clamp, turnTowards } from './math';
import { scaleStats } from '../data/boats';
import { computeMods, hasEffect } from '../effects/effects';
import type { ControlIntent, Racer } from '../race/types';
import { TUNING } from '../data/items';

/** Make a racer bigger or smaller (mushrooms): its collision shape and mass follow. */
export function setRacerSize(r: Racer, size: number): void {
  if (r.size === size) return;
  r.size = size;
  r.stats = scaleStats(r.baseStats, size);
}

/**
 * One fixed step of the boat model (docs/boats.md#physics-model):
 * steering, thrust, forward drag, lateral grip, integration.
 * `canDrive` is false during the countdown.
 */
export function stepBoat(r: Racer, intent: ControlIntent, dt: number, canDrive: boolean): void {
  const mods = computeMods(r);
  const s = r.stats;
  const control = canDrive ? mods.control : 0;
  // A damaged boat is slower (down to TUNING.damageSlow off with no hull left): a tough hull pays.
  const damaged = 1 - TUNING.damageSlow * Math.max(0, Math.min(1, 1 - r.hull / s.maxHull));
  const topSpeed = s.topSpeed * mods.topSpeed * r.pace * r.catchUp * damaged;
  const accel = s.accel * mods.accel;

  const hx = Math.cos(r.heading);
  const hy = Math.sin(r.heading);
  let vf = r.vx * hx + r.vy * hy;
  let vl = -r.vx * hy + r.vy * hx;

  // Electrical failure: the controls are stuck, so the boat keeps its last throttle and heading.
  const stuck = hasEffect(r, 'blackout');
  const desiredHeading = stuck ? null : intent.desiredHeading;
  const throttle = clamp(stuck ? r.throttle : intent.throttle, -1, 1) * control;

  // Steering: boats can't turn on the spot, so the turn rate fades in with speed.
  if (control > 0 && desiredHeading !== null) {
    const target = throttle < 0 ? desiredHeading + Math.PI : desiredHeading;
    const speedFactor = clamp(Math.abs(vf) / (0.3 * s.topSpeed), 0.2, 1);
    r.heading = turnTowards(r.heading, target, s.turnRate * mods.turnRate * speedFactor * dt);
  }

  // Thrust and forward drag; drag is chosen so full throttle settles at topSpeed.
  const k = accel / Math.max(1, topSpeed);
  let thrust = throttle * accel;
  if (throttle < 0 && vf < -0.3 * topSpeed) thrust = 0;
  const coast = Math.abs(throttle) < 0.01 ? 1.6 : 1;
  vf += (thrust - k * vf * coast - vf * mods.drag) * dt;

  // Sideways drag: high grip carves through turns, low grip drifts.
  vl -= vl * Math.min(1, s.lateralGrip * dt);

  const nx = Math.cos(r.heading);
  const ny = Math.sin(r.heading);
  // Re-project: velocity keeps its forward/lateral split relative to the (possibly turned) heading.
  r.vx = vf * nx - vl * ny;
  r.vy = vf * ny + vl * nx;
  r.x += r.vx * dt;
  r.y += r.vy * dt;
}

export const speedOf = (r: Racer): number => Math.hypot(r.vx, r.vy);
