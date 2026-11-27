import { clamp, turnTowards } from './math';
import { computeMods } from '../effects/effects';
import type { ControlIntent, Racer } from '../race/types';

/**
 * One fixed step of the boat model (docs/boats.md#physics-model):
 * steering, thrust, forward drag, lateral grip, integration.
 * `canDrive` is false during the countdown.
 */
export function stepBoat(r: Racer, intent: ControlIntent, dt: number, canDrive: boolean): void {
  const mods = computeMods(r);
  const s = r.stats;
  const control = canDrive ? mods.control : 0;
  const topSpeed = s.topSpeed * mods.topSpeed * r.pace;
  const accel = s.accel * mods.accel;

  const hx = Math.cos(r.heading);
  const hy = Math.sin(r.heading);
  let vf = r.vx * hx + r.vy * hy;
  let vl = -r.vx * hy + r.vy * hx;

  const throttle = clamp(intent.throttle, -1, 1) * control;

  // Steering: boats can't turn on the spot, so the turn rate fades in with speed.
  if (control > 0 && intent.desiredHeading !== null) {
    const target = throttle < 0 ? intent.desiredHeading + Math.PI : intent.desiredHeading;
    const speedFactor = clamp(Math.abs(vf) / (0.3 * s.topSpeed), 0.2, 1);
    r.heading = turnTowards(r.heading, target, s.turnRate * mods.turnRate * speedFactor * dt);
  }

  // Thrust and forward drag; drag is chosen so full throttle settles at topSpeed.
  const k = accel / Math.max(1, topSpeed);
  let thrust = throttle * accel;
  if (throttle < 0 && vf < -0.3 * topSpeed) thrust = 0;
  const coast = Math.abs(throttle) < 0.01 ? 1.6 : 1;
  vf += (thrust - k * vf * coast) * dt;

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
