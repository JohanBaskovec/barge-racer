import { computeMods } from '../effects/effects';
import type { Racer } from '../race/types';
import type { Track } from '../track/Track';
import { speedOf } from './BoatPhysics';

/** The hull as a capsule: the two ends of its segment and the radius around it. */
export function capsule(r: Racer, endScale = 1): { ax: number; ay: number; bx: number; by: number; radius: number } {
  const h = r.stats.halfLen * endScale;
  const hx = Math.cos(r.heading) * h;
  const hy = Math.sin(r.heading) * h;
  return { ax: r.x - hx, ay: r.y - hy, bx: r.x + hx, by: r.y + hy, radius: r.stats.capRadius };
}

/** Distance from a point to the segment a-b, and the nearest point on it. */
function pointSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): { d: number; x: number; y: number } {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  const x = ax + dx * t, y = ay + dy * t;
  return { d: Math.hypot(px - x, py - y), x, y };
}

/** Closest points between segments p1-q1 and p2-q2 (Ericson, Real-Time Collision Detection 5.1.9). */
function segmentSegment(
  p1x: number, p1y: number, q1x: number, q1y: number, p2x: number, p2y: number, q2x: number, q2y: number,
): { ax: number; ay: number; bx: number; by: number } {
  const d1x = q1x - p1x, d1y = q1y - p1y, d2x = q2x - p2x, d2y = q2y - p2y;
  const rx = p1x - p2x, ry = p1y - p2y;
  const a = d1x * d1x + d1y * d1y, e = d2x * d2x + d2y * d2y, f = d2x * rx + d2y * ry;
  let s = 0, t = 0;
  if (a <= 1e-9 && e <= 1e-9) return { ax: p1x, ay: p1y, bx: p2x, by: p2y };
  if (a <= 1e-9) t = Math.max(0, Math.min(1, f / e));
  else {
    const c = d1x * rx + d1y * ry;
    if (e <= 1e-9) s = Math.max(0, Math.min(1, -c / a));
    else {
      const b = d1x * d2x + d1y * d2y;
      const denom = a * e - b * b;
      s = denom > 1e-9 ? Math.max(0, Math.min(1, (b * f - c * e) / denom)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)); }
      else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)); }
    }
  }
  return { ax: p1x + d1x * s, ay: p1y + d1y * s, bx: p2x + d2x * t, by: p2y + d2y * t };
}

/**
 * Keep a boat inside the channel. Returns the speed with which it hit the bank (0 if it didn't).
 * The middle and both ends of the hull are checked, so a long boat's bow can't cut into the bank;
 * the ends are taken a little inside the hull so a long boat turning across a narrow canal isn't
 * wedged between both banks. Also updates r.nearestIndex.
 */
export function resolveBank(r: Racer, track: Track): number {
  const n = track.nearest(r.x, r.y, r.nearestIndex, 30);
  r.nearestIndex = n.index;
  if (!track.closed) resolveEnds(r, track, n.index, n.along);

  const c = capsule(r, 0.7);
  let worst: { index: number; lateral: number; excess: number } | null = null;
  for (const [px, py] of [[r.x, r.y], [c.ax, c.ay], [c.bx, c.by]]) {
    const m = px === r.x && py === r.y ? n : track.nearest(px, py, n.index, 12);
    const excess = Math.abs(m.lateral) - (track.halfWidth(m.index) - c.radius);
    if (excess > 0 && (!worst || excess > worst.excess)) worst = { index: m.index, lateral: m.lateral, excess };
  }
  if (!worst) return 0;

  const s = track.samples[worst.index];
  const sign = Math.sign(worst.lateral);
  r.x -= s.nx * sign * worst.excess;
  r.y -= s.ny * sign * worst.excess;

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

/** Point-to-point tracks end in a wall of land at both ends of the centre line. */
function resolveEnds(r: Racer, track: Track, index: number, along: number): void {
  const margin = r.stats.radius;
  const over = along < margin ? along - margin : along > track.length - margin ? along - (track.length - margin) : 0;
  if (over === 0) return;
  const s = track.samples[index];
  r.x -= s.tx * over;
  r.y -= s.ty * over;
  const vt = r.vx * s.tx + r.vy * s.ty;
  if (Math.sign(vt) === Math.sign(over)) {
    r.vx -= s.tx * vt * 1.3;
    r.vy -= s.ty * vt * 1.3;
  }
}

/** Capsule-capsule boat collision with mass-weighted separation and impulse. Returns impact strength. */
export function resolveBoatPair(a: Racer, b: Racer): number {
  const A = capsule(a), B = capsule(b);
  const minD = A.radius + B.radius;
  // Quick reject on the bounding circles
  const reach = a.stats.halfLen + b.stats.halfLen + minD;
  if ((b.x - a.x) ** 2 + (b.y - a.y) ** 2 >= reach * reach) return 0;
  const cp = segmentSegment(A.ax, A.ay, A.bx, A.by, B.ax, B.ay, B.bx, B.by);
  let dx = cp.bx - cp.ax;
  let dy = cp.by - cp.ay;
  const d2 = dx * dx + dy * dy;
  if (d2 >= minD * minD) return 0;
  let d = Math.sqrt(d2);
  if (d < 1e-6) {
    // Segments cross: push apart along the line between the centres (or sideways if they coincide).
    dx = b.x - a.x || -Math.sin(a.heading);
    dy = b.y - a.y || Math.cos(a.heading);
    d = Math.hypot(dx, dy) || 1;
  }
  const nx = dx / d;
  const ny = dy / d;
  const ma = a.stats.mass * computeMods(a).mass;
  const mb = b.stats.mass * computeMods(b).mass;
  const total = ma + mb;
  const overlap = minD - Math.min(d, minD);
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

/**
 * Push a boat out of an immovable capsule moving at (vx, vy) (a traffic barge). Returns the
 * speed with which they came together (0 if they didn't touch).
 */
export function resolveStatic(
  r: Racer, c: { ax: number; ay: number; bx: number; by: number; radius: number }, vx: number, vy: number,
  /** Met head-on by the moving end (b), the boat is shoved this way (a unit vector) rather than bulldozed along. */
  aside: { x: number; y: number } | null = null,
): number {
  const A = capsule(r);
  const minD = A.radius + c.radius;
  const cx = (c.ax + c.bx) / 2, cy = (c.ay + c.by) / 2;
  const reach = r.stats.halfLen + Math.hypot(c.bx - c.ax, c.by - c.ay) / 2 + minD;
  if ((r.x - cx) ** 2 + (r.y - cy) ** 2 >= reach * reach) return 0;
  const cp = segmentSegment(c.ax, c.ay, c.bx, c.by, A.ax, A.ay, A.bx, A.by); // a on the barge, b on the boat
  let dx = cp.bx - cp.ax, dy = cp.by - cp.ay;
  const d2 = dx * dx + dy * dy;
  if (d2 >= minD * minD) return 0;
  let d = Math.sqrt(d2);
  if (d < 1e-6) {
    dx = r.x - cx || 1;
    dy = r.y - cy;
    d = Math.hypot(dx, dy) || 1;
  }
  let nx = dx / d, ny = dy / d;
  const overlap = minD - Math.min(d, minD);
  r.x += nx * overlap;
  r.y += ny * overlap;
  if (aside) {
    const len = Math.hypot(c.bx - c.ax, c.by - c.ay) || 1;
    if ((nx * (c.bx - c.ax) + ny * (c.by - c.ay)) / len > 0.6) {
      const sx = aside.x + nx * 0.3, sy = aside.y + ny * 0.3;
      const sl = Math.hypot(sx, sy) || 1;
      nx = sx / sl;
      ny = sy / sl;
    }
  }
  const rel = (r.vx - vx) * nx + (r.vy - vy) * ny; // negative: closing
  if (rel >= 0) return 0;
  r.vx -= nx * rel * 1.4;
  r.vy -= ny * rel * 1.4;
  const scrape = Math.min(0.35, -rel / 700);
  r.vx = vx + (r.vx - vx) * (1 - scrape);
  r.vy = vy + (r.vy - vy) * (1 - scrape);
  return -rel;
}

/** True if a circle at (x, y) touches a capsule. */
export const touchesCapsule = (x: number, y: number, radius: number, c: { ax: number; ay: number; bx: number; by: number; radius: number }): boolean =>
  pointSegment(x, y, c.ax, c.ay, c.bx, c.by).d < c.radius + radius;

/** True if a circle at (x, y) touches the boat's hull (its capsule). */
export const isTouching = (r: Racer, x: number, y: number, radius: number): boolean => {
  const c = capsule(r);
  return pointSegment(x, y, c.ax, c.ay, c.bx, c.by).d < c.radius + radius;
};

export { speedOf };
