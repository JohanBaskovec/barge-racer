import { TUNING } from '../data/items';
import { Rng, clamp } from '../physics/math';
import type { Track } from '../track/Track';

/** A working barge going up or down the canal. Moves at a steady speed, keeping to its side. */
export interface Barge {
  id: number;
  /** +1 goes the way the race goes, -1 comes the other way. */
  dir: 1 | -1;
  /** Where it is along the centre line at step 0. */
  a0: number;
  speed: number;
  /** Which drawing (0 cargo under tarpaulins, 1 sand, 2 tanker). */
  kind: number;
  /** Seconds until it may toss another crate (server and offline only). */
  dropT: number;
}

export interface BargePose {
  id: number;
  x: number;
  y: number;
  heading: number;
  vx: number;
  vy: number;
  along: number;
  /** Signed offset from the centre line. */
  lat: number;
  /** 0..1: barges fade out and in at the ends of an open track, where they turn back into view. */
  alpha: number;
  /** Collides (not while fading). */
  solid: boolean;
  /** Unit vector from the barge towards the middle of the canal: a boat met head-on is pushed that way. */
  mx: number;
  my: number;
}

/**
 * The traffic on a track. Where every barge is depends only on the time since the start of the
 * race (`poses(t)`), so every screen in an online race computes it for itself: nothing to send.
 */
export class Traffic {
  readonly barges: Barge[] = [];

  constructor(private track: Track, seed: number) {
    const T = TUNING.traffic;
    const rng = new Rng(seed);
    const L = track.length;
    const n = Math.max(1, Math.floor(L / (track.def.traffic ?? T.every)));
    let id = 1;
    for (const dir of [1, -1] as const) {
      // Evenly spaced, so barges going the same way (same speed) never meet; none on the starting grid.
      let offset = rng.next();
      for (let attempt = 0; attempt < 40 && !this.clearOfStart(n, offset); attempt++) offset = rng.next();
      for (let i = 0; i < n; i++) {
        this.barges.push({ id: id++, dir, a0: ((i + offset) / n) * L, speed: T.speed[dir === 1 ? 0 : 1], kind: rng.int(0, 2), dropT: rng.range(2, T.dropCooldown) });
      }
    }
  }

  /** No barge between 800 px behind the start line and 600 px past it at the start. */
  private clearOfStart(n: number, offset: number): boolean {
    const L = this.track.length;
    for (let i = 0; i < n; i++) {
      let d = ((i + offset) / n) * L - this.track.startDist;
      if (this.track.closed) d = ((d % L) + L * 1.5) % L - L / 2;
      if (d > -800 && d < 600) return false;
    }
    return true;
  }

  /** Where barge `b` is `t` seconds after the start of the race (countdown included). */
  pose(b: Barge, t: number): BargePose {
    const T = TUNING.traffic;
    const track = this.track;
    const L = track.length;
    const along = (((b.a0 + b.dir * b.speed * t) % L) + L) % L;
    let alpha = 1;
    if (!track.closed) alpha = clamp((Math.min(along, L - along) - 60) / T.fadeEnds, 0, 1);
    const hw = track.sampleAt(along).width / 2;
    const lat = b.dir * Math.max(0, hw - T.width / 2 - 14) * T.lane;
    const p = track.pointAt(along, lat);
    const heading = b.dir === 1 ? p.heading : p.heading + Math.PI;
    // The track's normal at this point (pointAt offsets along it), pointing away from the barge's side.
    const s = -Math.sign(lat || 1);
    const mx = -Math.sin(p.heading) * s, my = Math.cos(p.heading) * s;
    return { id: b.id, x: p.x, y: p.y, heading, vx: Math.cos(heading) * b.speed, vy: Math.sin(heading) * b.speed, along, lat, alpha, solid: alpha > 0.5, mx, my };
  }

  poses(t: number): BargePose[] {
    return this.barges.map((b) => this.pose(b, t));
  }
}

/** The hull of a barge as a capsule (segment ends and radius). */
export function bargeCapsule(p: BargePose): { ax: number; ay: number; bx: number; by: number; radius: number } {
  const T = TUNING.traffic;
  const h = T.length / 2 - T.width / 2;
  const hx = Math.cos(p.heading) * h, hy = Math.sin(p.heading) * h;
  return { ax: p.x - hx, ay: p.y - hy, bx: p.x + hx, by: p.y + hy, radius: T.width / 2 };
}
