import { Rng } from '../physics/math';
import type { Track } from '../track/Track';
import { BUILDING, type SceneryData, TOWPATH } from './scenery';

/**
 * Scenery for the invented tracks, laid out by rules around the channel and drawn by the same
 * renderer as the real Reims map (MapRenderer): streets, houses, trees.
 *
 * - **canal**: a brick town. A quay street along each bank, cross streets and a back street
 *   forming blocks, terraced houses with gardens, street trees on the quay, a football pitch.
 * - **industrial**: a road on one bank and a railway on the other, warehouses, storage tanks and
 *   container yards.
 * - **bayou**: swamp forest right down to the water, bushes on the banks, a dirt trail, a few
 *   tin-roofed shacks, lily pads.
 * - **vineyard**: parcels of vines on both banks, a country road along one of them, a village
 *   with its church, champagne cellars, poplars on the banks, woods further out.
 * - **harbour**: stone quays with a road on both sides, warehouses, container yards and tanks,
 *   a quarter of tall town houses, dinghies tied up along the quays.
 * - **fjord**: snow; pine forest on the slopes, red cabins by the water, snowy boulders, ice floes.
 * - **canyon**: red sand and rock: boulders everywhere, cacti, a dirt track, a few adobe houses,
 *   rocks in the shallows.
 * - **lagoon**: a sand beach along the water, palm trees, beach huts, jungle further back.
 *
 * Everything is placed with a seeded random generator, so a track always looks the same.
 */

type Pt = { x: number; y: number };
interface Obb {
  cx: number;
  cy: number;
  ux: number;
  uy: number;
  hu: number;
  hv: number;
}

/** How far from the channel anything is placed: a little more than the camera can ever see. */
const REACH = 1150;
const GREENS = [0x4f7a32, 0x5d8a3a, 0x3f6a2a, 0x6a9442, 0x557f36];
const SWAMP = [0x2f5f2c, 0x3b6e33, 0x27522a, 0x47783a, 0x335f3f, 0x2a5a36];
/** Vegetation kinds, as in mapArt.ts (VEG), which can't be imported here (it needs Phaser). */
const VEG = { forest: 1, vineyard: 2, orchard: 3, meadow: 5 } as const;

const cache = new Map<string, SceneryData>();

/** The generated scenery of an invented track (computed once per track). */
export function generateScenery(track: Track): SceneryData {
  const key = track.def.id;
  let data = cache.get(key);
  if (!data) {
    data = new Generator(track).run();
    cache.set(key, data);
  }
  return data;
}

class Generator {
  private s: Track['samples'];
  private n: number;
  private rng: Rng;
  private data: SceneryData = { source: 'generated', water: [], vegetation: [], roads: [], rails: [], buildings: [], bridges: [], sports: [], trees: [], pads: [] };
  /** Samples by grid cell, for fast distance-to-channel queries. */
  private grid = new Map<string, number[]>();
  private readonly CELL = 256;
  private maxHalf = 0;
  /** Things already placed, which later things must not overlap. */
  private boxes: Obb[] = [];
  private boxGrid = new Map<string, number[]>();
  private roadPts: { x: number; y: number; r: number; back: boolean }[] = [];
  private roadGrid = new Map<string, number[]>();
  private bounds = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };

  constructor(private track: Track) {
    this.s = track.samples;
    this.n = this.s.length;
    let seed = 0;
    for (const ch of track.def.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    this.rng = new Rng(seed || 1);
    this.s.forEach((p, i) => {
      const k = `${Math.floor(p.x / this.CELL)},${Math.floor(p.y / this.CELL)}`;
      (this.grid.get(k) ?? this.grid.set(k, []).get(k)!).push(i);
      this.maxHalf = Math.max(this.maxHalf, p.width / 2);
      this.bounds.x0 = Math.min(this.bounds.x0, p.x - REACH);
      this.bounds.y0 = Math.min(this.bounds.y0, p.y - REACH);
      this.bounds.x1 = Math.max(this.bounds.x1, p.x + REACH);
      this.bounds.y1 = Math.max(this.bounds.y1, p.y + REACH);
    });
  }

  run(): SceneryData {
    const theme = this.track.def.theme;
    if (theme === 'bayou') this.bayou();
    else if (theme === 'industrial') this.industrial();
    else if (theme === 'vineyard') this.vineyard();
    else if (theme === 'harbour') this.harbour();
    else if (theme === 'fjord') this.fjord();
    else if (theme === 'canyon') this.canyon();
    else if (theme === 'lagoon') this.lagoon();
    else this.town();
    return this.data;
  }

  // ---- geometry helpers ------------------------------------------------------------------

  /**
   * Distance from (x, y) to the water's edge (negative inside the channel), and the nearest
   * sample. Far from the channel (beyond about 1200 px) the distance is just "far".
   */
  private clear(x: number, y: number): { d: number; i: number } {
    const cx = Math.floor(x / this.CELL), cy = Math.floor(y / this.CELL);
    let best = 1e9, bi = -1;
    // Search outwards ring by ring, and stop once nothing further out could be nearer.
    for (let ring = 0; ring <= 5; ring++) {
      for (let gx = cx - ring; gx <= cx + ring; gx++) {
        for (let gy = cy - ring; gy <= cy + ring; gy++) {
          if (Math.max(Math.abs(gx - cx), Math.abs(gy - cy)) !== ring) continue; // only the new ring
          for (const i of this.grid.get(`${gx},${gy}`) ?? []) {
            const p = this.s[i];
            const d = Math.hypot(p.x - x, p.y - y) - p.width / 2;
            if (d < best) {
              best = d;
              bi = i;
            }
          }
        }
      }
      if (best + this.maxHalf < ring * this.CELL) break;
    }
    return { d: best, i: bi };
  }

  /** The point `off` px beyond the bank at sample i, on side +1 or -1. */
  private at(i: number, side: number, off: number): Pt {
    const p = this.s[((i % this.n) + this.n) % this.n];
    const d = (p.width / 2 + off) * side;
    return { x: p.x + p.nx * d, y: p.y + p.ny * d };
  }

  /**
   * Lines running along one bank, `off` px from it. Where the land is too narrow for that (the
   * line would come nearer to another stretch of the channel) the line is interrupted.
   */
  private along(side: number, off: number, step = 3): { p: Pt; i: number }[][] {
    const runs: { p: Pt; i: number }[][] = [];
    let run: { p: Pt; i: number }[] = [];
    const last = this.track.closed ? this.n : this.n - 1;
    const stride = step * this.track.spacing;
    for (let i = 0; i <= last; i += step) {
      const p = this.at(i, side, off);
      const prev = this.at(i - step, side, off);
      // On the inside of a tight bend a line this far from the bank bunches up into a knot: leave it out there.
      const bunched = Math.hypot(p.x - prev.x, p.y - prev.y) < stride * 0.45;
      if (!bunched && this.clear(p.x, p.y).d >= off - 6) run.push({ p, i });
      else {
        if (run.length > 1) runs.push(run);
        run = [];
      }
    }
    if (run.length > 1) runs.push(run);
    return runs;
  }

  private key(x: number, y: number, cell: number): string {
    return `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
  }

  /** Add a road (or path) and remember where it is. */
  private road(cls: number, w: number, line: Pt[], back = false): void {
    if (line.length < 2) return;
    for (let k = 0; k < line.length - 1; k += 9) {
      const piece = line.slice(k, k + 10);
      if (piece.length > 1) this.data.roads.push([cls, w, 0, piece.flatMap((p) => [Math.round(p.x), Math.round(p.y)])]);
    }
    this.mark(line, w / 2 + (cls === 1 ? 14 : cls === 0 ? 8 : 2), back);
  }

  /** Remember a line (road, railway) as something not to build on, `r` px either side. */
  private mark(line: Pt[], r: number, back = false): void {
    for (let k = 0; k < line.length - 1; k++) {
      const a = line[k], b = line[k + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      for (let t = 0; t <= len; t += 16) {
        const x = a.x + ((b.x - a.x) * t) / (len || 1), y = a.y + ((b.y - a.y) * t) / (len || 1);
        const key = this.key(x, y, 128);
        (this.roadGrid.get(key) ?? this.roadGrid.set(key, []).get(key)!).push(this.roadPts.length);
        this.roadPts.push({ x, y, r, back });
      }
    }
  }

  /** Whether (x, y) is on a road or railway (with `pad` px to spare). `through`: back streets don't count. */
  private onRoad(x: number, y: number, pad = 0, through = false): boolean {
    const cx = Math.floor(x / 128), cy = Math.floor(y / 128);
    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        for (const i of this.roadGrid.get(`${gx},${gy}`) ?? []) {
          const p = this.roadPts[i];
          if (through && p.back) continue;
          if ((p.x - x) ** 2 + (p.y - y) ** 2 < (p.r + pad + 2) ** 2) return true;
        }
      }
    }
    return false;
  }

  private corners(b: Obb, grow = 0): Pt[] {
    const hu = b.hu + grow, hv = b.hv + grow, vx = -b.uy, vy = b.ux;
    return [
      { x: b.cx - b.ux * hu - vx * hv, y: b.cy - b.uy * hu - vy * hv },
      { x: b.cx + b.ux * hu - vx * hv, y: b.cy + b.uy * hu - vy * hv },
      { x: b.cx + b.ux * hu + vx * hv, y: b.cy + b.uy * hu + vy * hv },
      { x: b.cx - b.ux * hu + vx * hv, y: b.cy - b.uy * hu + vy * hv },
    ];
  }

  /** Two rotated rectangles overlap (separating-axis test), with `gap` px kept between them. */
  private overlap(a: Obb, b: Obb, gap: number): boolean {
    const ca = this.corners(a, gap), cb = this.corners(b);
    for (const [ax, ay] of [[a.ux, a.uy], [-a.uy, a.ux], [b.ux, b.uy], [-b.uy, b.ux]]) {
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const p of ca) {
        const d = p.x * ax + p.y * ay;
        a0 = Math.min(a0, d);
        a1 = Math.max(a1, d);
      }
      for (const p of cb) {
        const d = p.x * ax + p.y * ay;
        b0 = Math.min(b0, d);
        b1 = Math.max(b1, d);
      }
      if (a1 < b0 || b1 < a0) return false;
    }
    return true;
  }

  /** Whether a rectangle is free: on dry land clear of the towpath, off the roads, not on anything placed. */
  private free(b: Obb, gap = 6, bank = TOWPATH + 8): boolean {
    const pts = [...this.corners(b), { x: b.cx, y: b.cy }];
    const c = this.corners(b);
    for (let k = 0; k < 4; k++) pts.push({ x: (c[k].x + c[(k + 1) % 4].x) / 2, y: (c[k].y + c[(k + 1) % 4].y) / 2 });
    for (const p of pts) {
      if (this.clear(p.x, p.y).d < bank) return false;
      if (this.onRoad(p.x, p.y)) return false;
    }
    const reach = Math.hypot(b.hu, b.hv);
    const cx = Math.floor(b.cx / 256), cy = Math.floor(b.cy / 256), span = Math.ceil((reach + 400) / 256);
    for (let gx = cx - span; gx <= cx + span; gx++) {
      for (let gy = cy - span; gy <= cy + span; gy++) {
        for (const i of this.boxGrid.get(`${gx},${gy}`) ?? []) if (this.overlap(b, this.boxes[i], gap)) return false;
      }
    }
    return true;
  }

  /** Whether a circle touches anything placed (cheaper than `free`: no check of the banks or roads). */
  private hitsBox(x: number, y: number, r: number): boolean {
    const probe: Obb = { cx: x, cy: y, ux: 1, uy: 0, hu: r, hv: r };
    const cx = Math.floor(x / 256), cy = Math.floor(y / 256);
    for (let gx = cx - 2; gx <= cx + 2; gx++) {
      for (let gy = cy - 2; gy <= cy + 2; gy++) {
        for (const i of this.boxGrid.get(`${gx},${gy}`) ?? []) if (this.overlap(probe, this.boxes[i], 0)) return true;
      }
    }
    return false;
  }

  private reserve(b: Obb): void {
    const key = this.key(b.cx, b.cy, 256);
    (this.boxGrid.get(key) ?? this.boxGrid.set(key, []).get(key)!).push(this.boxes.length);
    this.boxes.push(b);
  }

  /** Whether a circle is clear of everything placed so far. */
  private freeSpot(x: number, y: number, r: number): boolean {
    return this.free({ cx: x, cy: y, ux: 1, uy: 0, hu: r, hv: r }, 0, r + 4);
  }

  private ring(b: Obb): number[] {
    return this.corners(b).flatMap((p) => [Math.round(p.x), Math.round(p.y)]);
  }

  /** Place a building if its spot is free. Heights are in metres (they set the shadow). */
  private building(b: Obb, kind: number, height: number, gap = 6): boolean {
    if (!this.free(b, gap)) return false;
    this.reserve(b);
    this.data.buildings.push([height, kind, this.ring(b)]);
    return true;
  }

  private tree(x: number, y: number, r: number, palette: number[] = GREENS): void {
    this.data.trees!.push([Math.round(x), Math.round(y), Math.round(r), palette[this.rng.int(0, palette.length - 1)]]);
  }

  /** A round building (a storage tank) as a 20-sided ring. */
  private tank(x: number, y: number, r: number): boolean {
    const b: Obb = { cx: x, cy: y, ux: 1, uy: 0, hu: r, hv: r };
    if (!this.free(b, 10)) return false;
    this.reserve(b);
    const ring: number[] = [];
    for (let k = 0; k < 20; k++) ring.push(Math.round(x + Math.cos((k / 20) * Math.PI * 2) * r), Math.round(y + Math.sin((k / 20) * Math.PI * 2) * r));
    this.data.buildings.push([9, BUILDING.tank, ring]);
    return true;
  }

  /**
   * Buildings in a row along a bank, `off` px from it (their middles), facing the channel.
   * `make` is called for each spot with the place and direction and returns how far to move on.
   */
  private row(side: number, off: number, make: (c: Pt, ux: number, uy: number, i: number) => number): void {
    let next = this.rng.range(0, 60);
    let dist = 0;
    let prev = this.at(0, side, off);
    const last = this.track.closed ? this.n : this.n - 1;
    for (let i = 1; i <= last; i++) {
      const p = this.at(i, side, off);
      dist += Math.hypot(p.x - prev.x, p.y - prev.y);
      prev = p;
      if (dist < next) continue;
      if (this.clear(p.x, p.y).d < off - 8) continue; // not enough land here
      const sm = this.s[i % this.n];
      next = dist + make(p, sm.tx, sm.ty, i);
    }
  }

  /** Streets leading away from a bank, every `every` samples, from the quay street outwards. */
  private crossStreets(side: number, from: number, every: number, w: number, minLen: number, maxLen: number): void {
    for (let i = Math.floor(every / 2); i < this.n - 2; i += every + this.rng.int(-3, 3)) {
      const a = this.at(i, side, from);
      if (this.clear(a.x, a.y).d < from - 6) continue;
      const sm = this.s[i];
      const dx = sm.nx * side, dy = sm.ny * side;
      const want = this.rng.range(minLen, maxLen);
      let len = 0;
      // Stop where the street meets another quay or cross street (it crosses back streets), or
      // would reach another stretch of the channel.
      let met = false;
      while (len < want && !met) {
        const x = a.x + dx * (len + 20), y = a.y + dy * (len + 20);
        if (len > 80 && this.clear(x, y).d < from + 2) break;
        if (len > 80 && this.onRoad(x, y, -w / 2, true)) met = true;
        len += 20;
      }
      if (len < 160 && !met) continue;
      this.road(1, w, [a, { x: a.x + dx * len * 0.5, y: a.y + dy * len * 0.5 }, { x: a.x + dx * len, y: a.y + dy * len }]);
    }
  }

  /** Fill the rest of the land on a jittered grid: `place` decides what goes at each spot. */
  private infill(cell: number, place: (x: number, y: number, d: number, i: number) => void): void {
    const { x0, y0, x1, y1 } = this.bounds;
    for (let x = x0; x < x1; x += cell) {
      for (let y = y0; y < y1; y += cell) {
        const px = x + this.rng.range(0.1, 0.9) * cell, py = y + this.rng.range(0.1, 0.9) * cell;
        const c = this.clear(px, py);
        if (c.d < TOWPATH + 12 || c.d > REACH) continue;
        place(px, py, c.d, c.i);
      }
    }
  }

  /** A yard of stacked containers: rows of 6 m boxes. Returns how far to move on along the row. */
  private containerYard(c: Pt, ux: number, uy: number): number {
    const rng = this.rng;
      const cols = rng.int(2, 4), rows = rng.int(2, 5);
      const vx = -uy, vy = ux;
      let any = false;
      for (let a = 0; a < cols; a++) {
        for (let b = 0; b < rows; b++) {
          if (rng.chance(0.15)) continue;
          const ox = (a - (cols - 1) / 2) * 66, oy = (b - (rows - 1) / 2) * 30;
          any = this.building({ cx: c.x + ux * ox + vx * oy, cy: c.y + uy * ox + vy * oy, ux, uy, hu: 30, hv: 12.5 }, BUILDING.container, rng.chance(0.3) ? 5.2 : 2.6, 1) || any;
        }
      }
      return any ? cols * 66 + rng.range(30, 70) : 40;
  }

  /** A group of storage tanks. */
  private tankFarm(c: Pt, ux: number, uy: number): number {
    const rng = this.rng;
      const k = rng.int(2, 3), r = rng.range(46, 70);
      let any = false;
      for (let a = 0; a < k; a++) any = this.tank(c.x + ux * (a - (k - 1) / 2) * (r * 2 + 16), c.y + uy * (a - (k - 1) / 2) * (r * 2 + 16), r) || any;
      return any ? k * (r * 2 + 16) + rng.range(30, 60) : 40;
  }

  /** A warehouse with a flat roof. */
  private warehouse(c: Pt, ux: number, uy: number): number {
    const rng = this.rng;
      const w = rng.range(210, 400), depth = rng.range(150, 210);
      return this.building({ cx: c.x, cy: c.y, ux, uy, hu: w / 2, hv: depth / 2 }, BUILDING.industrial, rng.range(8, 13), 12) ? w + rng.range(24, 70) : 40;
  }

  // ---- the three places ------------------------------------------------------------------

  /** Lock & Load: a brick canal town. */
  private town(): void {
    const rng = this.rng;
    this.data.style = { tiled: 0.72 };
    const QUAY = TOWPATH + 14 + 25; // middle of the quay street, from the bank
    const BLOCK = 230;
    const BACK = QUAY + 39 + BLOCK + 34; // middle of the back street

    for (const side of [1, -1]) {
      for (const run of this.along(side, QUAY)) this.road(1, 50, run.map((r) => r.p));
      for (const run of this.along(side, BACK)) this.road(1, 40, run.map((r) => r.p), true);
      this.crossStreets(side, QUAY, 24, 44, 380, 760);
    }

    // A football pitch on the first spot with room for it.
    for (let i = 20; i < this.n && this.data.sports!.length === 0; i += 15) {
      for (const side of [1, -1]) {
        const c = this.at(i, side, BACK + 34 + 30 + 190);
        const sm = this.s[i];
        const b: Obb = { cx: c.x, cy: c.y, ux: sm.tx, uy: sm.ty, hu: 300, hv: 190 };
        if (this.clear(c.x, c.y).d > BACK + 240 && this.free(b, 20)) {
          this.reserve({ ...b, hu: b.hu + 24, hv: b.hv + 24 });
          this.data.sports!.push([0, this.ring(b)]);
          break;
        }
      }
    }

    // Terraced houses: a row facing each quay street, a row on each side of the back street.
    const house = (depth: number) => (c: Pt, ux: number, uy: number): number => {
      const w = rng.range(64, 118);
      const placed = this.building({ cx: c.x, cy: c.y, ux, uy, hu: w / 2, hv: depth / 2 - rng.range(0, 10) }, rng.chance(0.03) ? BUILDING.church : BUILDING.house, rng.range(6, 13), 3);
      // Now and then a gap in the terrace: a garden with a tree.
      if (placed && rng.chance(0.16)) {
        const g = w / 2 + 34;
        if (this.freeSpot(c.x + ux * g, c.y + uy * g, 20)) this.tree(c.x + ux * g, c.y + uy * g, rng.range(18, 26));
        return w + 62;
      }
      return placed ? w + rng.range(2, 9) : 24;
    };
    for (const side of [1, -1]) {
      this.row(side, QUAY + 39 + 8 + 48, house(96));
      this.row(side, BACK - 34 - 8 - 44, house(88));
      this.row(side, BACK + 34 + 8 + 46, house(92));
    }

    // Plane trees along the quays, between the towpath and the street.
    for (const side of [1, -1]) {
      this.row(side, TOWPATH - 9, (c) => {
        this.tree(c.x, c.y, rng.range(15, 20));
        return rng.range(76, 96);
      });
    }

    // Further out: more houses, gardens and trees; trees in the courtyards.
    this.infill(140, (x, y, d, i) => {
      const sm = this.s[i];
      if (d > BACK + 150 && rng.chance(0.6)) {
        const turn = rng.chance(0.5);
        const ux = turn ? sm.nx : sm.tx, uy = turn ? sm.ny : sm.ty;
        this.building({ cx: x, cy: y, ux, uy, hu: rng.range(34, 60), hv: rng.range(30, 46) }, BUILDING.house, rng.range(5, 10), 14);
      } else if (rng.chance(d > BACK ? 0.75 : 0.5)) {
        const r = rng.range(14, 26);
        if (this.freeSpot(x, y, r * 0.7)) this.tree(x, y, r);
      }
    });
  }

  /** Industrial Estuary: a dock road, a railway, warehouses, tanks and containers. */
  private industrial(): void {
    const rng = this.rng;
    const ROAD = TOWPATH + 14 + 30;
    const RAIL = TOWPATH + 52;
    for (const run of this.along(1, ROAD)) this.road(1, 60, run.map((r) => r.p));
    this.crossStreets(1, ROAD, 40, 50, 420, 800);
    for (const run of this.along(-1, RAIL)) {
      const line = run.map((r) => r.p);
      for (let k = 0; k < line.length - 1; k += 9) this.data.rails.push([70, 0, line.slice(k, k + 10).flatMap((p) => [Math.round(p.x), Math.round(p.y)])]);
      this.mark(line, 46);
    }

    const containers = (c: Pt, ux: number, uy: number): number => this.containerYard(c, ux, uy);
    const tanks = (c: Pt, ux: number, uy: number): number => this.tankFarm(c, ux, uy);
    const warehouse = (c: Pt, ux: number, uy: number): number => this.warehouse(c, ux, uy);
    const mix = (c: Pt, ux: number, uy: number): number => {
      const pick = rng.next();
      return pick < 0.5 ? warehouse(c, ux, uy) : pick < 0.78 ? containers(c, ux, uy) : tanks(c, ux, uy);
    };
    this.row(1, ROAD + 48 + 20 + 105, mix);
    this.row(-1, RAIL + 46 + 24 + 105, mix);
    this.row(1, ROAD + 48 + 20 + 340, mix);
    this.row(-1, RAIL + 46 + 24 + 340, mix);

    // Further out: more sheds and yards, scrub and the odd tree on the waste ground.
    this.infill(230, (x, y, d, i) => {
      const sm = this.s[i];
      if (d > 520 && rng.chance(0.5)) mix({ x, y }, sm.tx, sm.ty);
      else if (rng.chance(0.5)) {
        const r = rng.range(10, 20);
        if (this.freeSpot(x, y, r * 0.7)) this.tree(x, y, r, [0x5d7a45, 0x6b8550, 0x4f6b3c]);
      }
    });
    this.infill(90, (x, y) => {
      if (!rng.chance(0.22)) return;
      const r = rng.range(8, 15);
      if (this.freeSpot(x, y, r * 0.7)) this.tree(x, y, r, [0x5d7a45, 0x6b8550, 0x4f6b3c]);
    });
  }

  /** Bayou Bends: swamp forest down to the water. */
  private bayou(): void {
    const rng = this.rng;
    this.data.style = { quay: 0x4a4a2c };
    // A dirt trail along one bank, here and there.
    for (const run of this.along(1, 96)) {
      for (let k = 0; k < run.length; k += 60) {
        if (rng.chance(0.3)) continue;
        this.road(2, 22, run.slice(k, k + 50).map((r) => r.p));
      }
    }
    // Shacks near the water, alternating banks.
    let side = 1;
    for (let i = 30; i < this.n; i += rng.int(34, 60)) {
      const c = this.at(i, side, rng.range(100, 125) + (side === 1 ? 60 : 0));
      const sm = this.s[i];
      this.building({ cx: c.x, cy: c.y, ux: sm.tx, uy: sm.ty, hu: rng.range(30, 44), hv: rng.range(22, 30) }, BUILDING.shack, 3.5, 10);
      side = -side;
    }
    // Bushes crowding both banks.
    for (const bank of [1, -1]) {
      this.row(bank, 8, (_c, _ux, _uy, i) => {
        const p = this.at(i, bank, rng.range(4, 30));
        const r = rng.range(9, 16);
        if (this.freeSpot(p.x, p.y, 4) || this.clear(p.x, p.y).d > 2) {
          if (!this.onRoad(p.x, p.y)) this.tree(p.x, p.y, r, SWAMP);
        }
        return rng.range(14, 30);
      });
    }
    // The canopy: big crowns everywhere else, leaving the trail and the shacks clear.
    this.infill(62, (x, y, d) => {
      if (rng.chance(0.1)) return;
      const r = Math.min(rng.range(24, 46), d + 6);
      if (r < 16 || this.onRoad(x, y, 2)) return;
      if (this.hitsBox(x, y, r * 0.4 + 16)) return; // a clearing round each shack
      this.tree(x, y, r, SWAMP);
    });
    // Lily pads in the slack water along the banks.
    for (let i = 12; i < this.n - 6; i += rng.int(16, 34)) {
      const bank = rng.chance(0.5) ? 1 : -1;
      const k = rng.int(3, 8);
      for (let a = 0; a < k; a++) {
        const j = i + rng.int(-3, 3);
        const sm = this.s[((j % this.n) + this.n) % this.n];
        const lat = (sm.width / 2 - rng.range(10, 46)) * bank;
        this.data.pads!.push([Math.round(sm.x + sm.nx * lat + sm.tx * rng.range(-8, 8)), Math.round(sm.y + sm.ny * lat + sm.ty * rng.range(-8, 8)), Math.round(rng.range(7, 12))]);
      }
    }
  }

  /** Champagne Hills: vineyards, a village, champagne cellars. */
  private vineyard(): void {
    const rng = this.rng;
    this.data.style = { quay: 0x8f9a5e, tiled: 0.55 };
    const ROAD = TOWPATH + 14 + 22;
    const n = this.n;
    // The village and the cellars each take a stretch of the river.
    const village = { from: Math.floor(n * 0.38), to: Math.floor(n * 0.52) };
    const cellars = { from: Math.floor(n * 0.05), to: Math.floor(n * 0.2) };
    const inside = (i: number, r: { from: number; to: number }) => i >= r.from && i <= r.to;

    // A country road along one bank; in the village a street along the other.
    for (const run of this.along(1, ROAD)) this.road(1, 38, run.map((r) => r.p));
    for (const run of this.along(-1, ROAD)) {
      const part = run.filter((r) => inside(r.i, village));
      if (part.length > 1) this.road(1, 34, part.map((r) => r.p));
    }
    this.crossStreets(1, ROAD, 80, 30, 260, 520);

    // The village: a church in the middle, houses along its street and behind them.
    const mid = Math.floor((village.from + village.to) / 2);
    for (const off of [ROAD + 34 + 70, ROAD + 34 + 260]) {
      const c = this.at(mid, -1, off);
      const sm = this.s[mid];
      if (this.building({ cx: c.x, cy: c.y, ux: sm.tx, uy: sm.ty, hu: 52, hv: 30 }, BUILDING.church, 16, 16)) break;
    }
    const house = (depth: number) => (c: Pt, ux: number, uy: number, i: number): number => {
      if (!inside(i, village)) return 30;
      const w = rng.range(56, 100);
      return this.building({ cx: c.x, cy: c.y, ux, uy, hu: w / 2, hv: depth / 2 }, BUILDING.house, rng.range(6, 11), 3) ? w + rng.range(2, 14) : 20;
    };
    this.row(-1, ROAD + 25 + 48, house(84));
    this.row(-1, ROAD + 25 + 160, house(80));
    this.row(1, ROAD + 25 + 48, house(84));
    // ...and a cluster of houses round the church, facing every which way.
    const heart = this.at(mid, -1, ROAD + 260);
    for (let k = 0; k < 500; k++) {
      const a = rng.range(0, Math.PI * 2), r = Math.sqrt(rng.next()) * 520;
      const x = heart.x + Math.cos(a) * r, y = heart.y + Math.sin(a) * r;
      const c = this.clear(x, y);
      if (c.i < 0) continue;
      const sm = this.s[c.i];
      const turn = rng.chance(0.5);
      const w = rng.range(40, 80);
      this.building({ cx: x, cy: y, ux: turn ? sm.nx : sm.tx, uy: turn ? sm.ny : sm.ty, hu: w / 2, hv: rng.range(24, 40) }, BUILDING.house, rng.range(5, 10), 12);
    }

    // Champagne cellars: big houses with long roofs along the road, in their own stretch.
    this.row(1, ROAD + 25 + 110, (c, ux, uy, i) => {
      if (!inside(i, cellars)) return 30;
      const w = rng.range(200, 300);
      return this.building({ cx: c.x, cy: c.y, ux, uy, hu: w / 2, hv: rng.range(70, 95) }, BUILDING.industrial, rng.range(10, 14), 14) ? w + rng.range(60, 140) : 40;
    });

    // Poplars on the banks, here and there.
    for (const side of [1, -1]) {
      this.row(side, TOWPATH - 10, (c) => {
        if (rng.chance(0.45)) this.tree(c.x, c.y, rng.range(13, 17), [0x4f7a32, 0x5d8a3a, 0x557f36]);
        return rng.range(90, 200);
      });
    }

    // The vines: parcels lined up with the river, a wood or a meadow now and then.
    this.infill(120, (x, y, d, i) => {
      if (d < TOWPATH + 22) return;
      const sm = this.s[i];
      const turn = rng.chance(0.3);
      const ux = turn ? sm.nx : sm.tx, uy = turn ? sm.ny : sm.ty;
      const b: Obb = { cx: x, cy: y, ux, uy, hu: rng.range(80, 150), hv: rng.range(55, 100) };
      for (let k = 0; k < 4 && !this.free(b, 12, TOWPATH + 16); k++) {
        b.hu *= 0.72;
        b.hv *= 0.72;
      }
      if (b.hv < 24 || !this.free(b, 12, TOWPATH + 16)) return;
      this.reserve(b);
      const pick = rng.next();
      const kind = d > 450 && pick < 0.12 ? VEG.forest : pick < 0.2 ? VEG.meadow : pick < 0.24 ? VEG.orchard : VEG.vineyard;
      this.data.vegetation.push([kind, this.ring(b)]);
    });
    // Lone trees in what's left.
    this.infill(110, (x, y) => {
      if (!rng.chance(0.18)) return;
      const r = rng.range(12, 20);
      if (this.freeSpot(x, y, r * 0.7)) this.tree(x, y, r);
    });
  }

  /** Floating things in the slack water along the banks (lily pads, ice floes, rocks, dinghies). */
  private floaters(every: [number, number], perGroup: [number, number], size: [number, number], keepOff: number): void {
    const rng = this.rng;
    for (let i = 12; i < this.n - 6; i += rng.int(every[0], every[1])) {
      const bank = rng.chance(0.5) ? 1 : -1;
      const k = rng.int(perGroup[0], perGroup[1]);
      for (let a = 0; a < k; a++) {
        const j = i + rng.int(-3, 3);
        const sm = this.s[((j % this.n) + this.n) % this.n];
        const lat = (sm.width / 2 - rng.range(keepOff, keepOff + 30)) * bank;
        this.data.pads!.push([Math.round(sm.x + sm.nx * lat + sm.tx * rng.range(-10, 10)), Math.round(sm.y + sm.ny * lat + sm.ty * rng.range(-10, 10)), Math.round(rng.range(size[0], size[1]))]);
      }
    }
  }

  /** Harbour Rush: quays, warehouses and containers, a town quarter, dinghies along the quays. */
  private harbour(): void {
    const rng = this.rng;
    this.data.style = { quay: 0x5a5e63, tiled: 0.45, pads: 'dinghy' };
    const QUAY = TOWPATH + 14 + 28;
    for (const side of [1, -1]) {
      for (const run of this.along(side, QUAY)) this.road(1, 54, run.map((r) => r.p));
      this.crossStreets(side, QUAY, 34, 46, 380, 720);
    }
    // One side: the docks (warehouses, containers, tanks); the other: tall town houses.
    const mix = (c: Pt, ux: number, uy: number): number => {
      const pick = rng.next();
      return pick < 0.45 ? this.warehouse(c, ux, uy) : pick < 0.85 ? this.containerYard(c, ux, uy) : this.tankFarm(c, ux, uy);
    };
    this.row(1, QUAY + 52 + 105, mix);
    this.row(1, QUAY + 52 + 340, mix);
    const house = (depth: number) => (c: Pt, ux: number, uy: number): number => {
      const w = rng.range(46, 84);
      return this.building({ cx: c.x, cy: c.y, ux, uy, hu: w / 2, hv: depth / 2 }, BUILDING.house, rng.range(9, 16), 2) ? w + rng.range(1, 5) : 20;
    };
    this.row(-1, QUAY + 40 + 50, house(92));
    this.row(-1, QUAY + 40 + 160, house(90));
    this.infill(160, (x, y, d, i) => {
      const sm = this.s[i];
      if (d > 480 && rng.chance(0.55)) mix({ x, y }, sm.tx, sm.ty);
      else if (rng.chance(0.25)) {
        const r = rng.range(12, 20);
        if (this.freeSpot(x, y, r * 0.7)) this.tree(x, y, r);
      }
    });
    // Dinghies tied up along the quays, in little rows, nose to the bank.
    for (let i = 10; i < this.n - 4; i += rng.int(18, 40)) {
      const bank = rng.chance(0.5) ? 1 : -1;
      const k = rng.int(2, 5);
      for (let a = 0; a < k; a++) {
        const sm = this.s[(i + a * 2) % this.n];
        const lat = (sm.width / 2 - 14) * bank;
        const heading = Math.atan2(sm.ny * bank, sm.nx * bank);
        this.data.pads!.push([Math.round(sm.x + sm.nx * lat), Math.round(sm.y + sm.ny * lat), 11, Math.round(heading * 1000)]);
      }
    }
  }

  /** Frozen Fjord: snow, pine forest, red cabins by the water, boulders, ice floes. */
  private fjord(): void {
    const rng = this.rng;
    this.data.style = { quay: 0x8d979e, tiled: 1, pads: 'ice' };
    const PINES = [0x1f4a2e, 0x24553a, 0x2c5f3c, 0x1b4029];
    const ROCKS = [0xa9b2b8, 0x9aa3aa, 0xc3cbd0];
    // A road along one bank, here and there.
    for (const run of this.along(1, TOWPATH + 50)) {
      for (let k = 0; k < run.length; k += 70) if (rng.chance(0.6)) this.road(2, 26, run.slice(k, k + 55).map((r) => r.p));
    }
    // Red cabins by the water, in twos and threes.
    for (let i = 20; i < this.n; i += rng.int(30, 55)) {
      const side = rng.chance(0.5) ? 1 : -1;
      for (let a = 0; a < rng.int(1, 3); a++) {
        const c = this.at(i + a * 4, side, rng.range(110, 170));
        const sm = this.s[(i + a * 4) % this.n];
        this.building({ cx: c.x, cy: c.y, ux: sm.tx, uy: sm.ty, hu: rng.range(24, 36), hv: rng.range(18, 26) }, BUILDING.house, rng.range(5, 8), 10);
      }
    }
    // Pines thick on the slopes, boulders poking out of the snow, a clearing round each cabin.
    this.infill(54, (x, y, d) => {
      if (this.onRoad(x, y, 4) || this.hitsBox(x, y, 30)) return;
      if (d < 40) return;
      if (rng.chance(0.12)) this.tree(x, y, rng.range(10, 22), ROCKS);
      else if (rng.chance(d > 120 ? 0.85 : 0.45)) this.tree(x, y, rng.range(15, 26), PINES);
    });
    this.floaters([14, 30], [2, 6], [9, 22], 8);
  }

  /** Canyon Run: red rock and sand, boulders, cacti, a dirt track, a few adobe houses. */
  private canyon(): void {
    const rng = this.rng;
    this.data.style = { quay: 0xa36638, tiled: 1, pads: 'rock' };
    const ROCKS = [0xa8643a, 0x8f5530, 0xb87348, 0x7a4528];
    const CACTI = [0x5f8a3a, 0x6b9442, 0x527a32];
    for (const run of this.along(-1, TOWPATH + 70)) this.road(2, 28, run.map((r) => r.p));
    // A few adobe houses in a hamlet by the track.
    for (let i = Math.floor(this.n * 0.3); i < this.n; i += Math.floor(this.n * 0.45)) {
      for (let a = 0; a < 8; a++) {
        const c = this.at(i + a * 5, -1, TOWPATH + 70 + 40 + rng.range(30, 120));
        const sm = this.s[(i + a * 5) % this.n];
        this.building({ cx: c.x, cy: c.y, ux: sm.tx, uy: sm.ty, hu: rng.range(22, 34), hv: rng.range(18, 26) }, BUILDING.house, rng.range(3, 5), 10);
      }
    }
    // Big red boulders and rock outcrops, cacti in between.
    this.infill(90, (x, y, d) => {
      if (this.onRoad(x, y, 4) || this.hitsBox(x, y, 20)) return;
      const pick = rng.next();
      if (pick < 0.45) {
        const r = rng.range(16, d > 200 ? 52 : 30);
        this.tree(x, y, r, ROCKS);
        if (r > 34 && rng.chance(0.6)) this.tree(x + rng.range(-r, r) * 0.7, y + rng.range(-r, r) * 0.7, r * 0.5, ROCKS);
      } else if (pick < 0.75) this.tree(x, y, rng.range(6, 10), CACTI);
    });
    this.floaters([22, 46], [1, 3], [8, 16], 6);
  }

  /** Tropical Lagoon: a sand beach along the water, palms, beach huts, jungle further back. */
  private lagoon(): void {
    const rng = this.rng;
    this.data.style = { quay: 0xf0e2b4, tiled: 0, pads: 'lily' };
    const PALMS = [0x4f9a34, 0x5fae3c, 0x3f8a2c];
    const JUNGLE = [0x2f6a2c, 0x3b7a33, 0x27602a, 0x46883a];
    // Beach huts on the sand, facing the water.
    for (let i = 15; i < this.n; i += rng.int(26, 46)) {
      const side = rng.chance(0.5) ? 1 : -1;
      const c = this.at(i, side, rng.range(80, 110));
      const sm = this.s[i % this.n];
      this.building({ cx: c.x, cy: c.y, ux: sm.tx, uy: sm.ty, hu: rng.range(18, 26), hv: rng.range(14, 20) }, BUILDING.shack, 3, 12);
    }
    // Palms along the beach, leaning over the water.
    for (const side of [1, -1]) {
      this.row(side, rng.range(30, 60), (c) => {
        if (rng.chance(0.7)) this.tree(c.x, c.y, rng.range(14, 20), PALMS);
        return rng.range(45, 110);
      });
    }
    // Then the jungle: a sand strip first, thick canopy behind.
    this.infill(60, (x, y, d) => {
      if (d < 150 || this.hitsBox(x, y, 24)) return;
      if (rng.chance(d < 220 ? 0.35 : 0.9)) this.tree(x, y, Math.min(rng.range(22, 40), d - 120), d < 220 ? PALMS : JUNGLE);
    });
    this.floaters([24, 50], [2, 5], [7, 12], 10);
  }
}
