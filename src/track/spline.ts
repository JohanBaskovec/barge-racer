export interface ControlPoint {
  x: number;
  y: number;
  width: number;
}

export interface Sample {
  x: number;
  y: number;
  /** Unit tangent. */
  tx: number;
  ty: number;
  /** Unit normal (tangent rotated +90 degrees). */
  nx: number;
  ny: number;
  width: number;
  /** Distance along the centre line from sample 0. */
  dist: number;
  /** Signed curvature (radians of heading change per px). */
  curvature: number;
}

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/**
 * Sample a Catmull-Rom spline through the control points at roughly even spacing.
 * For closed tracks the sampled list wraps; for open tracks it does not.
 */
export function sampleSpline(points: ControlPoint[], closed: boolean, spacing: number): Sample[] {
  const n = points.length;
  const segs = closed ? n : n - 1;
  const at = (i: number): ControlPoint => (closed ? points[((i % n) + n) % n] : points[Math.max(0, Math.min(n - 1, i))]);

  // Dense sampling first, then resample by arc length.
  const dense: { x: number; y: number; w: number }[] = [];
  const steps = 64;
  for (let s = 0; s < segs; s++) {
    const [p0, p1, p2, p3] = [at(s - 1), at(s), at(s + 1), at(s + 2)];
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      dense.push({
        x: catmull(p0.x, p1.x, p2.x, p3.x, t),
        y: catmull(p0.y, p1.y, p2.y, p3.y, t),
        w: catmull(p0.width, p1.width, p2.width, p3.width, t),
      });
    }
  }
  if (!closed) dense.push({ x: points[n - 1].x, y: points[n - 1].y, w: points[n - 1].width });

  const cum: number[] = [0];
  const count = closed ? dense.length : dense.length - 1;
  for (let i = 1; i <= count; i++) {
    const a = dense[i - 1];
    const b = dense[i % dense.length];
    cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const total = cum[count];
  const num = Math.max(8, Math.round(total / spacing));
  const step = total / (closed ? num : num);

  const out: Sample[] = [];
  let j = 0;
  const total_samples = closed ? num : num + 1;
  for (let i = 0; i < total_samples; i++) {
    const d = i * step;
    while (j < count - 1 && cum[j + 1] < d) j++;
    const a = dense[j];
    const b = dense[(j + 1) % dense.length];
    const segLen = cum[j + 1] - cum[j] || 1;
    const f = (d - cum[j]) / segLen;
    out.push({
      x: a.x + (b.x - a.x) * f,
      y: a.y + (b.y - a.y) * f,
      width: a.w + (b.w - a.w) * f,
      tx: 0, ty: 0, nx: 0, ny: 0, dist: d, curvature: 0,
    });
  }

  const m = out.length;
  const idx = (i: number): number => (closed ? ((i % m) + m) % m : Math.max(0, Math.min(m - 1, i)));
  for (let i = 0; i < m; i++) {
    const a = out[idx(i - 1)];
    const b = out[idx(i + 1)];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    out[i].tx = dx / len;
    out[i].ty = dy / len;
    out[i].nx = -out[i].ty;
    out[i].ny = out[i].tx;
  }
  for (let i = 0; i < m; i++) {
    const a = out[idx(i - 2)];
    const b = out[idx(i + 2)];
    const h0 = Math.atan2(a.ty, a.tx);
    const h1 = Math.atan2(b.ty, b.tx);
    let d = h1 - h0;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    out[i].curvature = d / (step * 4);
  }
  return out;
}
