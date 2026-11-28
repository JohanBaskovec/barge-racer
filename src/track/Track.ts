import { type ControlPoint, type Sample, sampleSpline } from './spline';

export interface CrateRowDef {
  /** Fraction of the lap (or, for point-to-point tracks, of the race) length. */
  at: number;
  count: number;
}

export interface TrackDef {
  id: string;
  laps: number;
  theme: 'canal' | 'industrial' | 'bayou' | 'city' | 'vineyard' | 'harbour' | 'fjord' | 'canyon' | 'lagoon';
  centerLine: ControlPoint[];
  checkpoints: number[];
  crateRows: CrateRowDef[];
  colors: { land: number; shore: number; water: number; waterDeep: number };
  /** false = point-to-point: the race runs from startDist to finishDist along an open centre line. */
  closed?: boolean;
  startDist?: number;
  finishDist?: number;
  /**
   * Point-to-point tracks whose stretch can be picked (see `Section`): the start and finish must
   * stay within [range[0], range[1]] along the centre line; crate rows are then placed every
   * `crateSpacing.every` pixels of the race.
   */
  range?: [number, number];
  crateSpacing?: { every: number; count: number };
  /** Named places along the canal for the stretch picker: [x, y, kind, name], kind 0 end, 1 named bridge, 2 lock, 3 bridge named by its street, 4 railway bridge. */
  places?: [number, number, number, string][];
  /** Distance between traffic barges going the same way (px); default TUNING.traffic.every. */
  traffic?: number;
  /** Real-world tracks: pixels per metre, scenery file (in public/) and data attribution. */
  pxPerM?: number;
  scenery?: string;
  attribution?: string;
}

export interface NearestResult {
  index: number;
  /** Signed offset from the centre line along the normal. */
  lateral: number;
  /**
   * Distance along the centre line. Closed tracks: 0..length.
   * Open tracks: not wrapped, so it is below 0 or above length past the ends.
   */
  along: number;
  distSq: number;
}

export const SAMPLE_SPACING = 16;

/**
 * Sampling a long centre line is slow (the 16 km Reims canal takes tens of ms), and the menus load
 * the same track several times with different stretches. The samples and racing line only depend
 * on the centre line, so they are computed once per centre line. Nothing changes them afterwards.
 */
const geometryCache = new WeakMap<ControlPoint[], { samples: Sample[]; racingOffset: number[] }>();

/** A loaded track: the sampled centre line plus queries used by the simulation. */
export class Track {
  readonly samples: Sample[];
  readonly length: number;
  readonly spacing: number;
  /** Racing-line lateral offset per sample, as a fraction of the half width (-1..1). */
  readonly racingOffset: number[];

  readonly closed: boolean;
  /** Where the start line is, along the centre line (0 for closed tracks). */
  readonly startDist: number;
  /** Length of one lap; for point-to-point tracks, start line to finish line. */
  readonly lapLength: number;

  constructor(readonly def: TrackDef) {
    this.closed = def.closed !== false;
    const cached = geometryCache.get(def.centerLine);
    this.samples = cached?.samples ?? sampleSpline(def.centerLine, this.closed, SAMPLE_SPACING);
    const n = this.samples.length;
    const last = this.samples[n - 1];
    const first = this.samples[0];
    this.spacing = last.dist / (n - 1);
    this.length = this.closed ? last.dist + Math.hypot(first.x - last.x, first.y - last.y) : last.dist;
    this.startDist = this.closed ? 0 : (def.startDist ?? 0);
    this.lapLength = this.closed ? this.length : (def.finishDist ?? this.length) - this.startDist;
    this.racingOffset = cached?.racingOffset ?? this.buildRacingLine();
    if (!cached) geometryCache.set(def.centerLine, { samples: this.samples, racingOffset: this.racingOffset });
  }

  get laps(): number {
    return this.closed ? this.def.laps : 1;
  }

  /** Total race distance from the start line to the finish. */
  get raceDistance(): number {
    return this.laps * this.lapLength;
  }

  /** Position along the centre line for a race progress (progress 0 = start line). */
  alongOf(progress: number): number {
    const d = this.startDist + progress;
    return this.closed ? ((d % this.length) + this.length) % this.length : d;
  }

  /** New race progress given the previous one and the current position along the centre line. */
  advance(progress: number, along: number): number {
    if (!this.closed) return along - this.startDist;
    const L = this.length;
    let d = along - this.alongOf(progress);
    if (d > L / 2) d -= L;
    else if (d < -L / 2) d += L;
    return progress + d;
  }

  /** Sample index: wraps around on closed tracks, clamps at the ends of open ones. */
  wrap(i: number): number {
    const n = this.samples.length;
    return this.closed ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i));
  }

  /** Sample at a distance along the lap (wraps). */
  sampleAt(dist: number): Sample {
    return this.samples[this.wrap(Math.round(dist / this.spacing))];
  }

  /** Position on the centre line (interpolated) at a distance along the lap. */
  pointAt(dist: number, lateral = 0): { x: number; y: number; heading: number } {
    if (!this.closed) dist = Math.max(0, Math.min(this.length - 0.001, dist));
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
    const raw = best * this.spacing + along;
    const dist = this.closed ? (raw + this.length) % this.length : raw;
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
