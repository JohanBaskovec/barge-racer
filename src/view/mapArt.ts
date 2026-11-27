import Phaser from 'phaser';

/**
 * Drawing routines for the real-world map (trees, roofs, road markings, sports grounds...).
 * Everything is placed from map coordinates only (hashes of a world grid), so a tile always draws
 * the same thing and features crossing tile edges line up without seams.
 */

type G = Phaser.GameObjects.Graphics;
type V = Phaser.Math.Vector2;
export interface Box { x0: number; y0: number; x1: number; y1: number }

// ---------------------------------------------------------------------------- geometry helpers

/** Deterministic pseudo-random number in [0, 1) for a grid cell. */
export function hash2(i: number, j: number, salt = 0): number {
  let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(salt, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function pointInRing(x: number, y: number, r: number[]): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function ringBox(r: number[]): Box {
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (let i = 0; i + 1 < r.length; i += 2) {
    if (r[i] < b.x0) b.x0 = r[i];
    if (r[i] > b.x1) b.x1 = r[i];
    if (r[i + 1] < b.y0) b.y0 = r[i + 1];
    if (r[i + 1] > b.y1) b.y1 = r[i + 1];
  }
  return b;
}

export function ringArea(r: number[]): number {
  let a = 0;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) a += r[j] * r[i + 1] - r[i] * r[j + 1];
  return Math.abs(a) / 2;
}

/** A rectangle around a shape, aligned with its longest edge: centre, axes u (long) and v, half sizes. */
export function orientedBox(r: number[]): { cx: number; cy: number; ux: number; uy: number; vx: number; vy: number; hu: number; hv: number } {
  let best = 0, ux = 1, uy = 0;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const dx = r[i] - r[j], dy = r[i + 1] - r[j + 1];
    const l = Math.hypot(dx, dy);
    if (l > best) { best = l; ux = dx / l; uy = dy / l; }
  }
  const vx = -uy, vy = ux;
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (let i = 0; i + 1 < r.length; i += 2) {
    const pu = r[i] * ux + r[i + 1] * uy, pv = r[i] * vx + r[i + 1] * vy;
    u0 = Math.min(u0, pu); u1 = Math.max(u1, pu); v0 = Math.min(v0, pv); v1 = Math.max(v1, pv);
  }
  const hu = (u1 - u0) / 2, hv = (v1 - v0) / 2;
  const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
  const cx = cu * ux + cv * vx, cy = cu * uy + cv * vy;
  // Keep u as the long axis (turn the frame a quarter if the longest edge was a short side).
  if (hv > hu) return { cx, cy, ux: vx, uy: vy, vx: -ux, vy: -uy, hu: hv, hv: hu };
  return { cx, cy, ux, uy, vx, vy, hu, hv };
}

/** Keep the part of a polygon where n·p <= c (Sutherland-Hodgman against one line). */
export function clipHalf(r: number[], nx: number, ny: number, c: number): number[] {
  const out: number[] = [];
  const n = r.length / 2;
  for (let k = 0; k < n; k++) {
    const ax = r[2 * k], ay = r[2 * k + 1];
    const bx = r[2 * ((k + 1) % n)], by = r[2 * ((k + 1) % n) + 1];
    const da = ax * nx + ay * ny - c, db = bx * nx + by * ny - c;
    if (da <= 0) out.push(ax, ay);
    if (da * db < 0) {
      const t = da / (da - db);
      out.push(ax + (bx - ax) * t, ay + (by - ay) * t);
    }
  }
  return out;
}

/** The same line moved sideways by d (positive = to the left of its direction). */
export function offsetLine(r: number[], d: number): number[] {
  const n = r.length / 2;
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    const pk = Math.max(0, k - 1), nk = Math.min(n - 1, k + 1);
    let dx = r[2 * nk] - r[2 * pk], dy = r[2 * nk + 1] - r[2 * pk + 1];
    const l = Math.hypot(dx, dy) || 1;
    dx /= l; dy /= l;
    out.push(r[2 * k] - dy * d, r[2 * k + 1] + dx * d);
  }
  return out;
}

const pts = (r: number[]): V[] => {
  const out: V[] = [];
  for (let i = 0; i + 1 < r.length; i += 2) out.push({ x: r[i], y: r[i + 1] } as V);
  return out;
};

export const fillRing = (g: G, r: number[], color: number, alpha = 1): void => {
  if (r.length >= 6) g.fillStyle(color, alpha).fillPoints(pts(r), true);
};

const FAN = 10;
const COS = Array.from({ length: FAN + 1 }, (_, k) => Math.cos((k * 2 * Math.PI) / FAN));
const SIN = Array.from({ length: FAN + 1 }, (_, k) => Math.sin((k * 2 * Math.PI) / FAN));

/**
 * A small filled circle as a 10-triangle fan. Much cheaper than Graphics.fillCircle, which makes a
 * 100-point polygon and triangulates it: that matters with thousands of road joints per tile.
 */
export function fastCircle(g: G, x: number, y: number, r: number): void {
  for (let k = 0; k < FAN; k++) g.fillTriangle(x, y, x + COS[k] * r, y + SIN[k] * r, x + COS[k + 1] * r, y + SIN[k + 1] * r);
}

/** Thick line with round joins (Phaser's thick strokes leave gaps at corners). */
export function thickLine(g: G, r: number[], width: number, color: number, alpha = 1): void {
  if (r.length < 4) return;
  g.lineStyle(width, color, alpha).strokePoints(pts(r), false, false);
  if (width >= 8) {
    g.fillStyle(color, alpha);
    for (let i = 0; i + 1 < r.length; i += 2) fastCircle(g, r[i], r[i + 1], width / 2);
  }
}

/** Dashed line along a polyline. */
export function dashedLine(g: G, r: number[], width: number, color: number, dash: number, gap: number, alpha = 1): void {
  g.lineStyle(width, color, alpha);
  let phase = 0; // distance into the current dash+gap period
  for (let i = 2; i + 1 < r.length; i += 2) {
    const ax = r[i - 2], ay = r[i - 1], bx = r[i], by = r[i + 1];
    const len = Math.hypot(bx - ax, by - ay);
    let s = 0;
    while (s < len) {
      const inDash = phase < dash;
      const step = Math.min(len - s, inDash ? dash - phase : dash + gap - phase);
      if (inDash) g.lineBetween(ax + ((bx - ax) * s) / len, ay + ((by - ay) * s) / len, ax + ((bx - ax) * (s + step)) / len, ay + ((by - ay) * (s + step)) / len);
      s += step;
      phase = (phase + step) % (dash + gap);
    }
  }
}

/** A stadium (rectangle with round ends) along u: half length hu, half width hv. */
function stadium(cx: number, cy: number, ux: number, uy: number, hu: number, hv: number): number[] {
  const vx = -uy, vy = ux;
  const straight = Math.max(0, hu - hv);
  const out: number[] = [];
  for (const end of [1, -1]) {
    for (let k = 0; k <= 12; k++) {
      const a = -Math.PI / 2 + (Math.PI * k) / 12;
      const du = end * (straight + Math.cos(a) * hv), dv = end * Math.sin(a) * hv;
      out.push(cx + ux * du + vx * dv, cy + uy * du + vy * dv);
    }
  }
  return out;
}

/** A rectangle in an oriented frame, as a polygon: centre + u/v axes, half sizes along them. */
function quad(cx: number, cy: number, ux: number, uy: number, hu: number, hv: number): number[] {
  const vx = -uy, vy = ux;
  return [
    cx - ux * hu - vx * hv, cy - uy * hu - vy * hv,
    cx + ux * hu - vx * hv, cy + uy * hu - vy * hv,
    cx + ux * hu + vx * hv, cy + uy * hu + vy * hv,
    cx - ux * hu + vx * hv, cy - uy * hu + vy * hv,
  ];
}

const shade = (c: number, k: number): number => {
  const col = Phaser.Display.Color.ValueToColor(c);
  return (k >= 0 ? col.lighten(k * 100) : col.darken(-k * 100)).color;
};

// ---------------------------------------------------------------------------- vegetation

export const VEG = { forest: 1, vineyard: 2, orchard: 3, hedge: 4, meadow: 5 } as const;

export interface Plant {
  x: number;
  y: number;
  r: number;
  color: number;
}

/**
 * The individual plants of a vegetation area: tree crowns for woods, small bushes for hedges, a
 * regular grid for orchards (returned, to be stamped as textures by the caller); rows of vines for
 * vineyards (drawn directly). Only plants that fall in `tile` (grown by their size) are included.
 */
export const vegetationGround = (kind: number): number =>
  kind === VEG.vineyard ? 0xc9c48e : kind === VEG.orchard ? 0xa7c47c : kind === VEG.meadow ? 0xb3cc84 : kind === VEG.hedge ? 0x6f9a55 : 0x5f8c4c;

export function plants(g: G, kind: number, ring: number[], tile: Box): Plant[] {
  const b = ringBox(ring);
  const area: Box = { x0: Math.max(b.x0, tile.x0 - 50), y0: Math.max(b.y0, tile.y0 - 50), x1: Math.min(b.x1, tile.x1 + 50), y1: Math.min(b.y1, tile.y1 + 50) };
  if (area.x0 >= area.x1 || area.y0 >= area.y1) return [];

  if (kind === VEG.vineyard) {
    const ob = orientedBox(ring);
    for (let x = area.x0; x <= area.x1; x += 11) {
      for (let y = area.y0; y <= area.y1; y += 11) {
        const along = x * ob.ux + y * ob.uy, across = x * ob.vx + y * ob.vy;
        if (Math.abs((((across % 24) + 24) % 24) - 12) > 3 || !pointInRing(x, y, ring)) continue;
        g.fillStyle(hash2(Math.round(along), Math.round(across)) > 0.5 ? 0x6f8a3a : 0x5f7a30, 1);
        fastCircle(g, x, y, 4);
      }
    }
    return [];
  }
  if (kind === VEG.meadow) return [];

  const S = kind === VEG.hedge ? 16 : kind === VEG.orchard ? 60 : 52;
  const jitter = kind === VEG.orchard ? 0 : S * 0.35;
  const [rMin, rMax] = kind === VEG.hedge ? [9, 13] : kind === VEG.orchard ? [16, 21] : [22, 36];
  const palette = kind === VEG.hedge ? [0x3f6f35, 0x4a7a3c, 0x557f42] : [0x3f6f35, 0x4f7f3f, 0x5c8c45, 0x6a9a4e, 0x47783a];
  const trees: Plant[] = [];
  for (let i = Math.floor(area.x0 / S); i <= Math.ceil(area.x1 / S); i++) {
    for (let j = Math.floor(area.y0 / S); j <= Math.ceil(area.y1 / S); j++) {
      const x = i * S + (hash2(i, j, kind) - 0.5) * 2 * jitter;
      const y = j * S + (hash2(i, j, kind + 7) - 0.5) * 2 * jitter;
      if (!pointInRing(x, y, ring)) continue;
      const r = rMin + hash2(i, j, kind + 13) * (rMax - rMin);
      trees.push({ x, y, r, color: palette[Math.floor(hash2(i, j, kind + 21) * palette.length)] });
    }
  }
  return trees;
}

// ---------------------------------------------------------------------------- other areas

/** A cemetery: gravel paths and rows of graves, aligned with the cemetery. */
export function drawCemetery(g: G, ring: number[], tile: Box): void {
  fillRing(g, ring, 0xa9b39a);
  const ob = orientedBox(ring);
  const b = ringBox(ring);
  const x0 = Math.max(b.x0, tile.x0 - 20), x1 = Math.min(b.x1, tile.x1 + 20);
  const y0 = Math.max(b.y0, tile.y0 - 20), y1 = Math.min(b.y1, tile.y1 + 20);
  // Walk the cemetery's own grid (along u and v) and draw a grave in each cell that is inside.
  const corners = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]];
  const us = corners.map(([x, y]) => x * ob.ux + y * ob.uy), vs = corners.map(([x, y]) => x * ob.vx + y * ob.vy);
  for (let u = Math.floor(Math.min(...us) / 26) * 26; u <= Math.max(...us); u += 26) {
    for (let v = Math.floor(Math.min(...vs) / 36) * 36; v <= Math.max(...vs); v += 36) {
      if (Math.abs((v / 36) % 6) < 1) continue; // a path every six rows
      const x = u * ob.ux + v * ob.vx, y = u * ob.uy + v * ob.vy;
      if (!pointInRing(x, y, ring)) continue;
      const q = quad(x, y, ob.ux, ob.uy, 6, 11);
      fillRing(g, q, 0xdcdcd4);
      g.lineStyle(1.5, 0x8a8a84, 1).strokePoints(pts(q), true, true);
    }
  }
}

export const SPORT = { pitch: 0, tennis: 1, court: 2, track: 3, pool: 4 } as const;

/** A sports ground with its markings: football/rugby pitch, tennis court, multi-sport court, track, pool. */
export function drawSport(g: G, kind: number, ring: number[]): void {
  const ob = orientedBox(ring);
  const { cx, cy, ux, uy, vx, vy } = ob;
  const P = (a: number, b: number): [number, number] => [cx + ux * a + vx * b, cy + uy * a + vy * b];
  const line = (a0: number, b0: number, a1: number, b1: number, w = 3): void => {
    const [x0, y0] = P(a0, b0), [x1, y1] = P(a1, b1);
    g.lineStyle(w, 0xffffff, 0.9).lineBetween(x0, y0, x1, y1);
  };
  const rect = (hu: number, hv: number, a = 0, w = 3): void => {
    const [x, y] = P(a, 0);
    g.lineStyle(w, 0xffffff, 0.9).strokePoints(pts(quad(x, y, ux, uy, hu, hv)), true, true);
  };
  const hu = ob.hu * 0.92, hv = ob.hv * 0.88;

  if (kind === SPORT.pool) {
    fillRing(g, ring, 0xe9e4d8);
    fillRing(g, quad(cx, cy, ux, uy, hu, hv), 0x4fb3e3);
    for (let k = 1; k < 6; k++) line(-hu * 0.95, -hv + (2 * hv * k) / 6, hu * 0.95, -hv + (2 * hv * k) / 6, 2);
    return;
  }
  if (kind === SPORT.track) {
    // A running track: red lanes round a grass infield, as nested stadium shapes.
    fillRing(g, ring, 0x8b8f94);
    fillRing(g, stadium(cx, cy, ux, uy, ob.hu * 0.97, ob.hv * 0.95), 0xb5513f);
    fillRing(g, stadium(cx, cy, ux, uy, ob.hu * 0.97 - ob.hv * 0.35, ob.hv * 0.6), 0x5fa34a);
    for (const k of [0.68, 0.76, 0.84, 0.92]) {
      g.lineStyle(2, 0xffffff, 0.75).strokePoints(pts(stadium(cx, cy, ux, uy, ob.hu * 0.97 - ob.hv * (0.95 - k), ob.hv * k)), true, true);
    }
    return;
  }
  if (kind === SPORT.tennis) {
    fillRing(g, ring, 0x2f7d4a);
    fillRing(g, quad(cx, cy, ux, uy, hu, hv), 0xc96b3f); // French clay
    rect(hu, hv);
    rect(hu, hv * 0.75, 0, 2);
    line(-hu * 0.54, 0, hu * 0.54, 0, 2);
    line(-hu * 0.54, -hv * 0.75, -hu * 0.54, hv * 0.75, 2);
    line(hu * 0.54, -hv * 0.75, hu * 0.54, hv * 0.75, 2);
    line(0, -hv * 1.05, 0, hv * 1.05, 2.5); // net
    return;
  }
  if (kind === SPORT.court) {
    fillRing(g, ring, 0x8b8f94);
    fillRing(g, quad(cx, cy, ux, uy, hu, hv), 0x3f72b0);
    rect(hu, hv);
    line(0, -hv, 0, hv);
    g.lineStyle(3, 0xffffff, 0.9).strokeCircle(cx, cy, Math.min(hv * 0.3, 18));
    rect(hu * 0.2, hv * 0.3, -hu * 0.8, 2);
    rect(hu * 0.2, hv * 0.3, hu * 0.8, 2);
    return;
  }
  // Football / rugby pitch: mowing stripes and markings, scaled to the pitch.
  fillRing(g, ring, 0x5a9a45);
  const stripes = 10;
  for (let k = 0; k < stripes; k += 2) {
    const a0 = -hu + (2 * hu * k) / stripes;
    const [x, y] = P(a0 + hu / stripes, 0);
    fillRing(g, quad(x, y, ux, uy, hu / stripes, hv), 0x66a850);
  }
  rect(hu, hv);
  line(0, -hv, 0, hv);
  g.lineStyle(3, 0xffffff, 0.9).strokeCircle(cx, cy, Math.min(hv * 0.27, hu * 0.17));
  for (const side of [-1, 1]) {
    rect(hu * 0.157, hv * 0.59, side * hu * (1 - 0.157));
    rect(hu * 0.052, hv * 0.27, side * hu * (1 - 0.052), 2);
  }
}

// ---------------------------------------------------------------------------- roads and rails

export const ROAD_COLORS = { asphalt: 0x62666d, motorway: 0x585c63, pavement: 0xc5c2ba, verge: 0x9fa39c, path: 0xd6c9a6, marking: 0xf4f4ef };

/** The road surface (asphalt with pavements, motorway with verges, gravel path). */
export function drawRoadBase(g: G, cls: number, w: number, line: number[]): void {
  if (cls === 0) {
    thickLine(g, line, w + 16, ROAD_COLORS.verge);
    thickLine(g, line, w, ROAD_COLORS.motorway);
  } else if (cls === 1) {
    thickLine(g, line, w + 28, ROAD_COLORS.pavement);
    thickLine(g, line, w, ROAD_COLORS.asphalt);
  } else thickLine(g, line, Math.max(w, 14), ROAD_COLORS.path);
}

/** Road markings: motorway edge lines and lanes, a dashed centre line on two-way streets. */
export function drawRoadMarkings(g: G, cls: number, w: number, line: number[]): void {
  if (cls === 0) {
    for (const side of [-1, 1]) thickLine(g, offsetLine(line, side * (w / 2 - 5)), 2.5, ROAD_COLORS.marking, 0.9);
    const lanes = Math.max(2, Math.round(w / 35));
    for (let k = 1; k < lanes; k++) dashedLine(g, offsetLine(line, -w / 2 + (w * k) / lanes), 2.5, ROAD_COLORS.marking, 30, 60, 0.85);
  } else if (cls === 1 && w >= 50) dashedLine(g, line, 2.5, ROAD_COLORS.marking, 30, 45, 0.85);
}

/** A railway: ballast, sleepers and the rails of each track. */
export function drawRail(g: G, w: number, line: number[]): void {
  thickLine(g, line, w + 10, 0x8d8173);
  const tracks = Math.max(1, Math.round((w / 10 - 3) / 4) + 1);
  for (let k = 0; k < tracks; k++) {
    const centre = offsetLine(line, (k - (tracks - 1) / 2) * 40);
    dashedLine(g, centre, 26, 0x5a4a3c, 3, 5); // sleepers
    for (const side of [-1, 1]) thickLine(g, offsetLine(centre, side * 7.5), 2, 0xb8b8b8);
  }
}

// ---------------------------------------------------------------------------- buildings

const SLATE = [0x5f6875, 0x6b7380, 0x77808c, 0x646c79];
const TILES = [0xb0634b, 0xbd7457, 0xa85a44];

/** The shadow a building casts (longer for taller buildings). */
export function drawBuildingShadow(g: G, h: number, ring: number[]): void {
  const off = Math.min(45, h * 4);
  const shifted = ring.map((v, i) => v + (i % 2 ? off : off * 0.6));
  fillRing(g, shifted, 0x000000, 0.18);
}

/**
 * A roof: small buildings get a pitched roof (one side lit, one in shade, a ridge along the
 * building) in Reims slate or terracotta; large or industrial buildings a flat roof with a parapet
 * and rooftop units.
 */
export function drawBuilding(g: G, kind: number, ring: number[]): void {
  const areaM2 = ringArea(ring) / 100;
  const pick = hash2(Math.round(ring[0]), Math.round(ring[1]), 3);
  const ob = orientedBox(ring);

  if (kind === 2 || areaM2 > 1400) {
    const base = kind === 2 ? 0xa2a6ac : 0xb3b0a8;
    fillRing(g, ring, base);
    const inner = ring.map((v, i) => (i % 2 ? ob.cy + (v - ob.cy) * 0.94 : ob.cx + (v - ob.cx) * 0.94));
    g.lineStyle(2, shade(base, 0.12), 1).strokePoints(pts(inner), true, true);
    // rooftop units
    const n = 1 + Math.floor(pick * 4);
    for (let k = 0; k < n; k++) {
      const a = (hash2(k, Math.round(ring[0]), 5) - 0.5) * ob.hu * 1.2, b = (hash2(k, Math.round(ring[1]), 9) - 0.5) * ob.hv * 1.2;
      const x = ob.cx + ob.ux * a + ob.vx * b, y = ob.cy + ob.uy * a + ob.vy * b;
      if (!pointInRing(x, y, ring)) continue;
      const q = quad(x, y, ob.ux, ob.uy, 14, 9);
      fillRing(g, q, 0xd0d3d8);
      g.lineStyle(1.5, 0x7f848b, 1).strokePoints(pts(q), true, true);
    }
    g.lineStyle(2, 0x000000, 0.3).strokePoints(pts(ring), true, true);
    return;
  }

  const base = kind === 1 ? 0x585e6b : pick < 0.68 ? SLATE[Math.floor(pick * 100) % SLATE.length] : TILES[Math.floor(pick * 100) % TILES.length];
  // Split the roof along its ridge (the long axis through the middle): the side facing the sun
  // (top-left) is lighter.
  const c = ob.cx * ob.vx + ob.cy * ob.vy;
  const sideA = clipHalf(ring, ob.vx, ob.vy, c);
  const sideB = clipHalf(ring, -ob.vx, -ob.vy, -c);
  const aLit = ob.vx + ob.vy > 0; // side A faces -v; lit if -v points towards the sun, up-left (-1, -1)
  fillRing(g, sideA, shade(base, aLit ? 0.14 : -0.12));
  fillRing(g, sideB, shade(base, aLit ? -0.12 : 0.14));
  const r = Math.max(0, ob.hu - ob.hv * 0.6); // hipped ends
  g.lineStyle(2, shade(base, -0.28), 1).lineBetween(ob.cx - ob.ux * r, ob.cy - ob.uy * r, ob.cx + ob.ux * r, ob.cy + ob.uy * r);
  g.lineStyle(2, 0x000000, 0.32).strokePoints(pts(ring), true, true);
}
