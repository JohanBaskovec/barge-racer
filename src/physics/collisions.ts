import { computeMods } from '../effects/effects';
import type { Racer } from '../race/types';
import type { Track } from '../track/Track';
import { speedOf } from './BoatPhysics';

/**
 * Keep a boat inside the channel. Returns the speed with which it hit the bank (0 if it didn't).
 * Also updates r.nearestIndex.
 */
export function resolveBank(r: Racer, track: Track): number {
  const n = track.nearest(r.x, r.y, r.nearestIndex, 30);
  r.nearestIndex = n.index;
  const limit = track.halfWidth(n.index) - r.stats.radius * 0.85;
  if (Math.abs(n.lateral) <= limit) return 0;

  const s = track.samples[n.index];
  const sign = Math.sign(n.lateral);
  const excess = Math.abs(n.lateral) - limit;
  r.x -= s.nx * sign * excess;
  r.y -= s.ny * sign * excess;

  const vn = (r.vx * s.nx + r.vy * s.ny) * sign; // outward speed
  if (vn <= 0) return 0;
  const bounce = 1.3;
  r.vx -= s.nx * sign * vn * bounce;
  r.vy -= s.ny * sign * vn * bounce;
  // Scraping along the bank costs some speed too.
  const scrape = Math.min(0.4, vn / 600);
  r.vx *= 1 - scrape;
  r.vy *= 1 - scrape;
  return vn;
}

/** Circle-circle boat collision with mass-weighted separation and impulse. Returns impact strength. */
export function resolveBoatPair(a: Racer, b: Racer): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const minD = a.stats.radius + b.stats.radius;
  const d2 = dx * dx + dy * dy;
  if (d2 >= minD * minD) return 0;
  const d = Math.sqrt(d2) || 0.001;
  const nx = dx / d;
  const ny = dy / d;
  const ma = a.stats.mass * computeMods(a).mass;
  const mb = b.stats.mass * computeMods(b).mass;
  const total = ma + mb;
  const overlap = minD - d;
  a.x -= nx * overlap * (mb / total);
  a.y -= ny * overlap * (mb / total);
  b.x += nx * overlap * (ma / total);
  b.y += ny * overlap * (ma / total);

  const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny; // closing speed is negative
  if (rel >= 0) return 0;
  const restitution = 0.5;
  const j = (-(1 + restitution) * rel) / (1 / ma + 1 / mb);
  a.vx -= (j / ma) * nx;
  a.vy -= (j / ma) * ny;
  b.vx += (j / mb) * nx;
  b.vy += (j / mb) * ny;
  return -rel;
}

export const isTouching = (r: Racer, x: number, y: number, radius: number): boolean => {
  const rr = r.stats.radius + radius;
  return (r.x - x) ** 2 + (r.y - y) ** 2 < rr * rr;
};

export { speedOf };
