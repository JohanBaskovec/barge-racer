import { type ControlPoint, type Sample, sampleSpline } from './spline';

export interface CrateRowDef {
  /** Fraction of the lap length. */
  at: number;
  count: number;
}

export interface TrackDef {
  id: string;
  name: string;
  description: string;
  laps: number;
  theme: 'canal' | 'industrial' | 'bayou';
  centerLine: ControlPoint[];
  checkpoints: number[];
  crateRows: CrateRowDef[];
  colors: { land: number; shore: number; water: number; waterDeep: number };
}

export interface NearestResult {
  index: number;
  /** Signed offset from the centre line along the normal. */
  lateral: number;
  /** Distance along the lap, 0..length. */
  along: number;
  distSq: number;
}

export const SAMPLE_SPACING = 16;

/** A loaded track: the sampled centre line plus queries used by the simulation. */
export class Track {
  readonly samples: Sample[];
  readonly length: number;
  readonly spacing: number;
  /** Racing-line lateral offset per sample, as a fraction of the half width (-1..1). */
  readonly racingOffset: number[];

  constructor(readonly def: TrackDef) {
    this.samples = sampleSpline(def.centerLine, true, SAMPLE_SPACING);
    const n = this.samples.length;
    const last = this.samples[n - 1];
    const first = this.samples[0];
    this.spacing = last.dist / (n - 1);
    this.length = last.dist + Math.hypot(first.x - last.x, first.y - last.y);
    this.racingOffset = this.buildRacingLine();
  }

  get laps(): number {
    return this.def.laps;
  }

  wrap(i: number): number {
    const n = this.samples.length;
    return ((i % n) + n) % n;
  }

  /** Sample at a distance along the lap (wraps). */
  sampleAt(dist: number): Sample {
    return this.samples[this.wrap(Math.round(dist / this.spacing))];
  }

  /** Position on the centre line (interpolated) at a distance along the lap. */
  pointAt(dist: number, lateral = 0): { x: number; y: number; heading: number } {
    const f = dist / this.spacing;
    const i0 = Math.floor(f);
    const t = f - i0;
    const a = this.samples[this.wrap(i0)];
    const b = this.samples[this.wrap(i0 + 1)];
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    const tx = a.tx + (b.tx - a.tx) * t;
    const ty = a.ty + (b.ty - a.ty) * t;
    const l = Math.hypot(tx, ty) || 1;
    return { x: x - (ty / l) * lateral, y: y + (tx / l) * lateral, heading: Math.atan2(ty, tx) };
  }

  /**
   * Find the nearest centre-line sample. With a hint only a window around it is searched,
   * so the result can't jump across a hairpin; without one the whole loop is searched.
   */
  nearest(x: number, y: number, hint = -1, window = 40): NearestResult {
    const n = this.samples.length;
    let best = -1;
    let bestD = Infinity;
    const test = (i: number): void => {
      const s = this.samples[i];
      const d = (s.x - x) ** 2 + (s.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    };
    if (hint < 0) for (let i = 0; i < n; i++) test(i);
    else for (let k = -window; k <= window; k++) test(this.wrap(hint + k));
    const s = this.samples[best];
    const lateral = (x - s.x) * s.nx + (y - s.y) * s.ny;
    const along = (x - s.x) * s.tx + (y - s.y) * s.ty;
    const dist = (best * this.spacing + along + this.length) % this.length;
    return { index: best, lateral, along: dist, distSq: bestD };
  }

  /** Half width of usable water at a sample. */
  halfWidth(index: number): number {
    return this.samples[this.wrap(index)].width / 2;
  }

  /** True if (x, y) is within the channel at the given nearest result, given a margin. */
  isInWater(n: NearestResult, margin = 0): boolean {
    return Math.abs(n.lateral) <= this.halfWidth(n.index) - margin;
  }

  private buildRacingLine(): number[] {
    const n = this.samples.length;
    const raw: number[] = this.samples.map((s) => Math.max(-1, Math.min(1, s.curvature / 0.0035)) * 0.55);
    const out: number[] = new Array(n).fill(0);
    const win = 10;
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let k = -win; k <= win; k++) sum += raw[this.wrap(i + k)];
      out[i] = sum / (2 * win + 1);
    }
    return out;
  }
}
