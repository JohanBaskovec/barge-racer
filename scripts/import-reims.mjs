#!/usr/bin/env node
/**
 * Builds the "Canal de Reims" track from IGN open data (BD TOPO, Licence Ouverte Etalab 2.0).
 *
 *   npm run import:reims
 *
 * Downloads the canal centre line, water surfaces, buildings, roads, railways, vegetation and
 * bridges along the Canal de l'Aisne à la Marne, from Passage Marx Dormoy (la Neuvillette, north of
 * Reims) to the Écluse n°13 de Sillery, and writes:
 *   src/data/maps/reimsCanal.track.json  centre line + widths (bundled with the game)
 *   public/maps/reims-canal.json         scenery (loaded when the race starts)
 *
 * Everything is in game pixels at true scale (PX_PER_M pixels per metre). Locks on the way are
 * removed: the canal keeps its normal width through them.
 *
 * Any stretch of the canal can be raced (the game has a slider for it). The track file gives the
 * default stretch (boulevard Paul Doumer to the Sillery lock), the range that can be picked, and
 * named places along the canal (bridges, removed locks, the ends) to show on the slider.
 *
 * Behind a proxy, Node's fetch needs NODE_USE_ENV_PROXY=1 (Node >= 22.21).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const CONFIG = {
  canalName: "Canal de la Marne a l'Aisne",
  /** Default start line: the canal point nearest to boulevard Paul Doumer (geocoder street position). Also the map's origin. */
  start: { lon: 4.027292, lat: 49.248586, name: 'Boulevard Paul Doumer' },
  /** The map begins here: the canal point nearest to Passage Marx Dormoy, la Neuvillette. */
  north: { lon: 4.004011, lat: 49.292089, name: 'Passage Marx Dormoy' },
  /** Finish line just before this lock. */
  endLock: 'Écluse Numéro 13 de Sillery',
  /** Shift the start line along the canal, in metres (positive = further south). */
  startShift: 0,
  finishBeforeLock: 25,
  /** Water before the start line (starting grid) and after the finish line (slowing down). */
  leadIn: 45,
  runOut: 70,
  pxPerM: 10,
  /** Scenery further than this from the canal is never visible, so it isn't exported. */
  corridor: 230,
  /** Street names are only placed this near the canal (m), at least `streetClearance` m from the water. */
  streetReach: 150,
  streetClearance: 8,
  /** The same street name is repeated no closer than this (m). */
  streetRepeat: 1500,
  streetFont: { min: 13, max: 26 },
  minWidth: 11,
  maxWidth: 60,
  /** Locks are removed within this distance of their outline. */
  lockMargin: 35,
  searchBox: { minLon: 3.97, minLat: 49.17, maxLon: 4.17, maxLat: 49.31 },
};

const WFS = 'https://data.geopf.fr/wfs/ows';
const R = 6371008.8;
const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------- download

async function wfs(layer, box) {
  const out = [];
  const count = 5000;
  for (let start = 0; ; start += count) {
    const q = new URLSearchParams({
      SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature', TYPENAMES: layer,
      OUTPUTFORMAT: 'application/json', SRSNAME: 'EPSG:4326', COUNT: String(count), STARTINDEX: String(start),
    });
    const url = `${WFS}?${q}&BBOX=${box.minLat},${box.minLon},${box.maxLat},${box.maxLon},urn:ogc:def:crs:EPSG::4326`;
    let res;
    for (let attempt = 0; ; attempt++) {
      try {
        res = await fetch(url);
        if (res.ok) break;
        throw new Error(`HTTP ${res.status}`);
      } catch (e) {
        if (attempt >= 3) throw new Error(`${layer}: ${e.message}`);
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
    }
    const data = await res.json();
    out.push(...data.features);
    if (data.features.length < count) return out;
  }
}

// ---------------------------------------------------------------------------- geometry

let LON0 = 0, LAT0 = 0, COS0 = 1;
const project = ([lon, lat]) => [(lon - LON0) * DEG * R * COS0, -(lat - LAT0) * DEG * R];
const unproject = ([x, y]) => [x / (DEG * R * COS0) + LON0, -y / (DEG * R) + LAT0];

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Lines and polygon rings of any GeoJSON geometry, projected. */
function lines(geom) {
  const c = geom.coordinates;
  switch (geom.type) {
    case 'LineString': return [c.map(project)];
    case 'MultiLineString': return c.map((l) => l.map(project));
    default: return [];
  }
}
function polygons(geom) {
  const c = geom.coordinates;
  switch (geom.type) {
    case 'Polygon': return [c.map((ring) => ring.map(project))];
    case 'MultiPolygon': return c.map((p) => p.map((ring) => ring.map(project)));
    default: return [];
  }
}

function pointInRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const pointInPolygon = (p, poly) => pointInRing(p, poly[0]) && !poly.slice(1).some((hole) => pointInRing(p, hole));

function bboxOf(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

/** Douglas-Peucker simplification. */
function simplify(pts, tol) {
  if (pts.length <= 2) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const len = Math.hypot(bx - ax, by - ay);
    let maxD = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      // Closed rings start and end on the same point: measure from that point instead of a line.
      const d = len < 1e-9
        ? Math.hypot(pts[i][0] - ax, pts[i][1] - ay)
        : Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / len;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tol && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Resample a polyline at a fixed spacing. */
function resample(pts, step) {
  const out = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const seg = dist(a, b);
    let t = step - carry;
    while (t <= seg) {
      out.push([a[0] + ((b[0] - a[0]) * t) / seg, a[1] + ((b[1] - a[1]) * t) / seg]);
      t += step;
    }
    carry = seg - (t - step);
  }
  return out;
}

/** Arc-length position of the point of the polyline nearest to p. */
function locate(pts, p) {
  let best = Infinity, bestS = 0, s = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const seg = dist(a, b);
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / (seg * seg || 1)));
    const q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const d = dist(p, q);
    if (d < best) { best = d; bestS = s + seg * t; }
    s += seg;
  }
  return { s: bestS, d: best };
}

function cut(pts, s0, s1) {
  const out = [];
  let s = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const seg = dist(a, b);
    const lerp = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    if (s + seg >= s0 && s <= s1) {
      if (!out.length) out.push(lerp(Math.max(0, (s0 - s) / seg)));
      if (s + seg <= s1) out.push(b);
      else { out.push(lerp((s1 - s) / seg)); break; }
    }
    s += seg;
  }
  return out;
}

/** Uniform grid over projected points for "is this near the canal?" queries. */
class Grid {
  constructor(cell) { this.cell = cell; this.map = new Map(); }
  key(x, y) { return `${Math.floor(x / this.cell)},${Math.floor(y / this.cell)}`; }
  add(x, y, v) { const k = this.key(x, y); (this.map.get(k) ?? this.map.set(k, []).get(k)).push(v); }
  near(x, y, r = 1) {
    const out = [];
    const cx = Math.floor(x / this.cell), cy = Math.floor(y / this.cell);
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) out.push(...(this.map.get(`${cx + i},${cy + j}`) ?? []));
    return out;
  }
}

// ---------------------------------------------------------------------------- street labels

/**
 * IGN cuts streets into one piece per block. Join the pieces of one street into long lines by
 * walking from endpoint to endpoint, taking the straightest continuation at junctions.
 */
function chainSegments(segs) {
  const key = (p) => `${Math.round(p[0] * 2)},${Math.round(p[1] * 2)}`;
  const at = new Map();
  segs.forEach((s, i) => {
    for (const end of [0, 1]) {
      const k = key(end ? s[s.length - 1] : s[0]);
      (at.get(k) ?? at.set(k, []).get(k)).push([i, end]);
    }
  });
  const used = new Set();
  const heading = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]);
  const turn = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  /** Extend `chain` (oriented so that we grow past its last point) as far as pieces connect. */
  const grow = (chain) => {
    for (;;) {
      const n = chain.length;
      const dir = heading(chain[Math.max(0, n - 4)], chain[n - 1]);
      let best = null;
      for (const [i, end] of at.get(key(chain[n - 1])) ?? []) {
        if (used.has(i)) continue;
        const pts = end ? [...segs[i]].reverse() : segs[i];
        const d = turn(dir, heading(pts[0], pts[Math.min(3, pts.length - 1)]));
        if (d < Math.PI / 3 && (!best || d < best.d)) best = { i, pts, d };
      }
      if (!best) return chain;
      used.add(best.i);
      chain = chain.concat(best.pts.slice(1));
    }
  };
  const chains = [];
  segs.forEach((s, i) => {
    if (used.has(i)) return;
    used.add(i);
    const forward = grow([...s]);
    const both = grow([...forward].reverse()); // grow the other end
    chains.push(both);
  });
  return chains;
}

// ---------------------------------------------------------------------------- main

async function main() {
  const C = CONFIG;
  LON0 = C.start.lon; LAT0 = C.start.lat; COS0 = Math.cos(LAT0 * DEG);
  const log = (...a) => console.log(...a);

  // 1. Canal centre line: chain the named canal sections north to south.
  log('Downloading canal centre line…');
  const hydro = await wfs('BDTOPO_V3:troncon_hydrographique', C.searchBox);
  const sections = hydro.filter((f) => f.properties.cpx_toponyme_de_cours_d_eau === C.canalName).flatMap((f) => lines(f.geometry));
  const nodeKey = (p) => `${Math.round(p[0])},${Math.round(p[1])}`;
  const adj = new Map();
  for (const s of sections) {
    for (const [a, b, line] of [[s[0], s[s.length - 1], s], [s[s.length - 1], s[0], [...s].reverse()]]) {
      (adj.get(nodeKey(a)) ?? adj.set(nodeKey(a), []).get(nodeKey(a))).push({ to: nodeKey(b), line });
    }
  }
  const nodes = [...adj.keys()].map((k) => k.split(',').map(Number));
  const north = nodeKey(nodes.reduce((m, p) => (p[1] < m[1] ? p : m)));
  const south = nodeKey(nodes.reduce((m, p) => (p[1] > m[1] ? p : m)));
  const prev = new Map([[north, null]]);
  const queue = [north];
  while (queue.length) {
    const k = queue.shift();
    for (const e of adj.get(k) ?? []) if (!prev.has(e.to)) { prev.set(e.to, { from: k, line: e.line }); queue.push(e.to); }
  }
  const chain = [];
  for (let k = south; prev.get(k); k = prev.get(k).from) chain.unshift(prev.get(k).line);
  let canal = chain.flatMap((l, i) => (i ? l.slice(1) : l));
  log(`  ${sections.length} sections, chained length ${(locate(canal, canal[canal.length - 1]).s / 1000).toFixed(1)} km`);

  // 2. Start and finish.
  log('Locating locks…');
  const constructions = await wfs('BDTOPO_V3:construction_surfacique', C.searchBox);
  const locks = constructions.filter((f) => f.properties.nature === 'Ecluse');
  const endLock = locks.find((f) => f.properties.toponyme === C.endLock);
  if (!endLock) throw new Error(`Lock not found: ${C.endLock}`);
  const lockCentre = (f) => { const ring = polygons(f.geometry)[0][0]; const b = bboxOf(ring); return [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2]; };
  const startS = locate(canal, [0, 0]).s + C.startShift;
  const northS = locate(canal, project([C.north.lon, C.north.lat])).s;
  const lockS = locate(canal, lockCentre(endLock)).s;
  const finishS = lockS - C.finishBeforeLock;
  const cutS = northS - C.leadIn; // the map's centre line starts here
  canal = cut(canal, cutS, finishS + C.runOut);
  const raceLength = finishS - startS;
  log(`  default race: ${(raceLength / 1000).toFixed(2)} km, start ${locate(canal, [0, 0]).d.toFixed(1)} m from the boulevard; whole map ${((finishS - northS) / 1000).toFixed(2)} km from ${C.north.name}`);

  // 3. Sample the centre line and measure the canal from the water surfaces.
  const sampleStep = 4;
  const samples = resample(simplify(canal, 0.5), sampleStep);
  const routeBox = bboxOf(samples);
  const pad = C.corridor + 50;
  const boxes = [];
  for (let i = 0; i < samples.length; i += Math.round(600 / sampleStep)) {
    const piece = samples.slice(i, i + Math.round(600 / sampleStep) + 1);
    const b = bboxOf(piece);
    const [minLon, maxLat] = unproject([b.minX - pad, b.minY - pad]);
    const [maxLon, minLat] = unproject([b.maxX + pad, b.maxY + pad]);
    boxes.push({ minLon, minLat, maxLon, maxLat });
  }
  async function corridorLayer(layer) {
    const seen = new Map();
    for (const b of boxes) for (const f of await wfs(layer, b)) seen.set(f.properties.cleabs ?? f.id, f);
    return [...seen.values()];
  }

  log('Downloading water surfaces…');
  const water = (await corridorLayer('BDTOPO_V3:surface_hydrographique')).flatMap((f) => polygons(f.geometry));
  const waterIdx = new Grid(100);
  water.forEach((poly, i) => {
    const b = bboxOf(poly[0]);
    for (let x = b.minX; x <= b.maxX + 100; x += 100) for (let y = b.minY; y <= b.maxY + 100; y += 100) waterIdx.add(x, y, i);
  });
  const inWater = (p) => [...new Set(waterIdx.near(p[0], p[1], 0))].some((i) => pointInPolygon(p, water[i]));

  const n = samples.length;
  const tangent = (i) => {
    const a = samples[Math.max(0, i - 2)], b = samples[Math.min(n - 1, i + 2)];
    const l = dist(a, b) || 1;
    return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
  };
  const lockPolys = locks.flatMap((f) => polygons(f.geometry));
  const nearLock = (p) => lockPolys.some((poly) => {
    if (pointInPolygon(p, poly)) return true;
    return poly[0].some((q) => dist(p, q) < C.lockMargin);
  });

  const width = new Float64Array(n);
  const offset = new Float64Array(n);
  const valid = new Uint8Array(n);
  let lockSamples = 0;
  for (let i = 0; i < n; i++) {
    const p = samples[i];
    const [tx, ty] = tangent(i);
    const nx = -ty, ny = tx;
    if (nearLock(p)) { lockSamples++; continue; }
    if (!inWater(p)) continue;
    const reach = (sign) => {
      let d = 0;
      while (d < C.maxWidth && inWater([p[0] + nx * sign * (d + 0.5), p[1] + ny * sign * (d + 0.5)])) d += 0.5;
      return d;
    };
    const dl = reach(1), dr = reach(-1);
    width[i] = dl + dr;
    offset[i] = (dl - dr) / 2;
    valid[i] = width[i] >= C.minWidth * 0.75;
  }
  // Fill locks and gaps by interpolating between measured neighbours.
  const fill = (arr, fallback) => {
    let last = -1;
    for (let i = 0; i <= n; i++) {
      if (i < n && !valid[i]) continue;
      const a = last >= 0 ? arr[last] : i < n ? arr[i] : fallback;
      const b = i < n ? arr[i] : a;
      for (let k = last + 1; k < i; k++) arr[k] = last < 0 ? b : i >= n ? a : a + ((b - a) * (k - last)) / (i - last);
      last = i;
    }
  };
  fill(width, 20);
  fill(offset, 0);
  // Smooth over ~40 m and clamp.
  const smooth = (arr, win) => {
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0, c = 0;
      for (let k = -win; k <= win; k++) { const j = i + k; if (j >= 0 && j < n) { s += arr[j]; c++; } }
      out[i] = s / c;
    }
    return out;
  };
  const W = smooth(width, 5).map((w) => Math.max(C.minWidth, Math.min(C.maxWidth, w)));
  const O = smooth(offset, 5);
  const centre = samples.map((p, i) => {
    const [tx, ty] = tangent(i);
    return [p[0] - ty * O[i], p[1] + tx * O[i]];
  });
  log(`  ${n} samples, ${valid.reduce((a, b) => a + b, 0)} measured, ${lockSamples} at locks; width ${Math.min(...W).toFixed(1)}–${Math.max(...W).toFixed(1)} m, at start ${W[Math.round(C.leadIn / sampleStep)].toFixed(1)} m`);

  // 4. Scenery in the corridor.
  const centreIdx = new Grid(50);
  centre.forEach((p, i) => centreIdx.add(p[0], p[1], i));
  const distToCanal = (p) => {
    let best = Infinity;
    for (const i of centreIdx.near(p[0], p[1], Math.ceil(C.corridor / 50) + 1)) best = Math.min(best, dist(p, centre[i]));
    return best;
  };
  const nearCanal = (pts) => pts.some((p) => distToCanal(p) < C.corridor);
  const coversCanal = (poly) => {
    const b = bboxOf(poly[0]);
    return centre.some((p, i) => i % 10 === 0 && p[0] >= b.minX && p[0] <= b.maxX && p[1] >= b.minY && p[1] <= b.maxY && pointInPolygon(p, poly));
  };
  const px = (v) => Math.round(v * C.pxPerM);
  const flat = (pts) => pts.flatMap(([x, y]) => [px(x), px(y)]);
  const ring = (pts, tol) => flat(simplify(pts, tol));

  log('Downloading buildings…');
  const buildings = [];
  for (const f of await corridorLayer('BDTOPO_V3:batiment')) {
    for (const poly of polygons(f.geometry)) {
      if (!nearCanal(poly[0])) continue;
      const h = Math.round(f.properties.hauteur ?? 6);
      const kind = /Religieux/.test(f.properties.usage_1 ?? '') || /Eglise|Chapelle/i.test(f.properties.nature ?? '') ? 1 : /Industriel|Agricole/.test(f.properties.usage_1 ?? '') ? 2 : 0;
      buildings.push([h, kind, ring(poly[0], 0.4)]);
    }
  }

  // Everything that could be a bridge over the canal, with the names IGN gives it (see "Bridge labels").
  const bridgeCandidates = [];
  const ABBREVIATIONS = { R: 'Rue', AV: 'Avenue', BD: 'Boulevard', CHE: 'Chemin', RTE: 'Route', PL: 'Place', IMP: 'Impasse', ALL: 'Allée', QU: 'Quai', ST: 'Saint', STE: 'Sainte', PTE: 'Porte', FG: 'Faubourg', SQ: 'Square', VOIE: 'Voie' };
  const SMALL_WORDS = new Set(['DE', 'DU', 'DES', 'LA', 'LE', 'LES', 'ET', 'EN', 'AU', 'AUX', "L'", "D'"]);
  const capitalize = (w) => w.toLowerCase().replace(/(^|[-'])(\p{L})/gu, (m, sep, ch) => sep + ch.toUpperCase());
  /** "AV DE CHAMPAGNE" -> "Avenue de Champagne" (only used when the cleaner BAN name is missing). */
  const prettify = (name) => name.trim().split(/\s+/).map((w, i) => {
    const up = w.toUpperCase();
    if (ABBREVIATIONS[up]) return ABBREVIATIONS[up];
    if (i > 0 && SMALL_WORDS.has(up)) return w.toLowerCase();
    return capitalize(w);
  }).join(' ');
  // IGN's "collaborative" names are upper case without accents; restore the ones we know are on the route.
  const ACCENTS = { Flechambault: 'Fléchambault', Nicephore: 'Nicéphore', Niepce: 'Niépce', Leonard: 'Léonard', Rivieres: 'Rivières', Riviere: 'Rivière', Prolonge: 'Prolongé' };
  const fixAccents = (name) => name.replace(/\p{L}+/gu, (w) => ACCENTS[w] ?? w);
  /** "Écluse Numéro 13 de Sillery" -> "Écluse n°13 Sillery". */
  const prettyLock = (name) => fixAccents(name.replace(/Num[ée]ro\s*/i, 'n°').replace(/\s+de\s+/i, ' '));
  /** BAN sometimes abbreviates the first word ("R des Bains", "Bd du Val"). */
  // BAN names in hamlets carry the hamlet: "Rue Louis Pasteur - la Neuvillette". The map shows the street.
  const expandBan = (n) => n.replace(/\s+-\s+.*$/, '').replace(/^R /, 'Rue ').replace(/^Bd /, 'Boulevard ').replace(/^Av /, 'Avenue ').replace(/\p{Lu}{3,}/gu, (w) => capitalize(w));
  const streetName = (p) => {
    const ban = p.nom_voie_ban_droite || p.nom_voie_ban_gauche;
    if (ban) return expandBan(ban);
    const collab = p.nom_collaboratif_droite || p.nom_collaboratif_gauche;
    if (collab && !/^pont\b/i.test(collab)) return prettify(collab);
    if (p.cpx_toponyme_route_nommee) return p.cpx_toponyme_route_nommee;
    if (p.cpx_numero) return p.cpx_numero;
    return '';
  };

  log('Downloading roads…');
  const STREET_NATURES = new Set(['Route à 1 chaussée', 'Route à 2 chaussées', 'Type autoroutier', 'Chemin', 'Route empierrée']);
  const ROAD_WIDTH = { 'Type autoroutier': 9, 'Route à 2 chaussées': 7, 'Route à 1 chaussée': 6, Bretelle: 5, 'Rond-point': 7, 'Route empierrée': 3.5, Chemin: 3, 'Piste cyclable': 2, Sentier: 1.6, Escalier: 2 };
  const roads = [];
  const streetSegs = [];
  for (const f of await corridorLayer('BDTOPO_V3:troncon_de_route')) {
    const p = f.properties;
    if (p.position_par_rapport_au_sol === '-1' || p.position_par_rapport_au_sol === -1) continue; // tunnels
    for (const l of lines(f.geometry)) {
      if (!nearCanal(l)) continue;
      const w = p.largeur_de_chaussee || ROAD_WIDTH[p.nature] || 4;
      const cls = ['Type autoroutier', 'Bretelle'].includes(p.nature) ? 0 : ['Sentier', 'Chemin', 'Piste cyclable', 'Escalier', 'Route empierrée'].includes(p.nature) ? 2 : 1;
      const bridge = String(p.position_par_rapport_au_sol) === '1' || Number(p.position_par_rapport_au_sol) > 0 ? 1 : 0;
      roads.push([cls, px(w), bridge, ring(l, 0.5)]);
      // Streets that get a name written along them: real roads with a name, not bridges or footpaths.
      if (!bridge && STREET_NATURES.has(p.nature)) {
        const name = fixAccents(streetName(p));
        if (name) streetSegs.push({ name, width: w, pts: l });
      }
      if (bridge && cls < 2) bridgeCandidates.push({ pts: l, street: streetName(p), official: '', roadOfficial: /^pont\b/i.test(p.nom_collaboratif_droite ?? '') ? prettify(p.nom_collaboratif_droite) : '', rail: false });
    }
  }

  log('Downloading railways…');
  const rails = [];
  for (const f of await corridorLayer('BDTOPO_V3:troncon_de_voie_ferree')) {
    const p = f.properties;
    if (Number(p.position_par_rapport_au_sol) < 0) continue;
    for (const l of lines(f.geometry)) {
      if (!nearCanal(l)) continue;
      rails.push([px(3 + 4 * Math.max(0, (p.nombre_de_voies ?? 1) - 1)), Number(p.position_par_rapport_au_sol) > 0 ? 1 : 0, ring(l, 0.5)]);
      if (Number(p.position_par_rapport_au_sol) > 0) bridgeCandidates.push({ pts: l, street: '', official: '', rail: true });
    }
  }

  log('Downloading vegetation…');
  const VEG = (nature) => (/Vigne/.test(nature) ? 2 : /Verger|Peupleraie/.test(nature) ? 3 : /Haie/.test(nature) ? 4 : /Lande|Prairie/.test(nature) ? 5 : 1);
  const vegetation = [];
  for (const f of await corridorLayer('BDTOPO_V3:zone_de_vegetation')) {
    for (const poly of polygons(f.geometry)) {
      if (!nearCanal(poly[0]) && !coversCanal(poly)) continue;
      vegetation.push([VEG(f.properties.nature ?? ''), ring(poly[0], 1)]);
    }
  }

  // Sports grounds get their markings drawn in the game; cemeteries their rows of graves.
  log('Downloading sports grounds and cemeteries…');
  const SPORT = (p) => {
    const n = `${p.nature ?? ''} ${p.nature_detaillee ?? ''}`;
    if (/natation/i.test(n)) return 4;
    if (/athl|vélodrome|Piste de sport/i.test(n)) return 3;
    if (/tennis/i.test(n)) return 1;
    if (/Grand terrain|football|rugby/i.test(n)) return 0;
    return 2; // basketball, handball, multi-sports...
  };
  const sports = [];
  for (const f of await corridorLayer('BDTOPO_V3:terrain_de_sport')) {
    for (const poly of polygons(f.geometry)) if (nearCanal(poly[0])) sports.push([SPORT(f.properties), ring(poly[0], 0.3)]);
  }
  const cemeteries = [];
  for (const f of await corridorLayer('BDTOPO_V3:cimetiere')) {
    for (const poly of polygons(f.geometry)) if (nearCanal(poly[0]) || coversCanal(poly)) cemeteries.push(ring(poly[0], 0.5));
  }

  log('Bridges…');
  const bridges = [];
  for (const f of constructions.filter((c) => c.properties.nature === 'Pont')) {
    for (const poly of polygons(f.geometry)) {
      if (!nearCanal(poly[0])) continue;
      // The aqueduct carrying the canal over the Vesle runs along the canal: not a bridge over the boats.
      const r = poly[0];
      let longest = 0, ang = 0;
      for (let i = 1; i < r.length; i++) { const d = dist(r[i - 1], r[i]); if (d > longest) { longest = d; ang = Math.atan2(r[i][1] - r[i - 1][1], r[i][0] - r[i - 1][0]); } }
      const c = r.reduce((m, p) => [m[0] + p[0] / r.length, m[1] + p[1] / r.length], [0, 0]);
      const ci = centreIdx.near(c[0], c[1], 1).sort((a, b) => dist(c, centre[a]) - dist(c, centre[b]))[0];
      if (ci !== undefined && dist(c, centre[ci]) < 30) {
        const [tx, ty] = tangent(ci);
        const diff = Math.abs(Math.sin(ang - Math.atan2(ty, tx)));
        if (diff < 0.5 && longest > 25) continue;
      }
      bridges.push([f.properties.toponyme ?? '', ring(r, 0.3)]);
    }
  }

  // ---- Street labels: the name written along the street, like on a printed map. One label per
  // street where it runs near the canal; a very long street repeats its name every
  // STREET_REPEAT metres (a name seen once in 3 km would never be read).
  log('Street labels…');
  const clearance = (p) => {
    let best = Infinity;
    for (const i of centreIdx.near(p[0], p[1], Math.ceil(C.streetReach / 50) + 1)) best = Math.min(best, dist(p, centre[i]) - W[i] / 2);
    return best;
  };
  const byName = new Map();
  for (const s of streetSegs) (byName.get(s.name) ?? byName.set(s.name, []).get(s.name)).push(s);
  const streets = [];
  for (const [name, segs] of byName) {
    const width = Math.max(...segs.map((s) => s.width));
    const candidates = [];
    for (const chain of chainSegments(segs.map((s) => s.pts))) {
      const line = resample(chain, 3);
      if (line.length < 4) continue;
      // Longest label that fits the road, then shrink until a straight stretch of dry land holds it.
      for (let fontPx = Math.min(C.streetFont.max, width * C.pxPerM * 0.42); fontPx >= C.streetFont.min; fontPx -= 1.5) {
        const lenM = (name.length * fontPx * 0.58) / C.pxPerM;
        const n = Math.ceil(lenM / 3);
        if (n >= line.length) continue;
        for (let i = 0; i + n < line.length; i += 2) {
          const a = line[i], b = line[i + n];
          const mid = line[i + (n >> 1)];
          const chord = dist(a, b) || 1;
          // Straight enough to stay on the road, and nowhere near the water.
          let off = 0, dry = true;
          for (let k = 0; k <= n; k += 2) {
            const q = line[i + k];
            off = Math.max(off, Math.abs((b[0] - a[0]) * (a[1] - q[1]) - (a[0] - q[0]) * (b[1] - a[1])) / chord);
            if (clearance(q) < C.streetClearance || inWater(q)) { dry = false; break; }
          }
          if (!dry || off > width * 0.28 || chord < lenM * 0.9) continue;
          const d = distToCanal(mid);
          if (d > C.streetReach) continue;
          let angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
          if (angle > Math.PI / 2) angle -= Math.PI;
          else if (angle <= -Math.PI / 2) angle += Math.PI;
          candidates.push({ x: mid[0], y: mid[1], angle, fontPx, d, lenM });
        }
        if (candidates.length) break; // the biggest font that fits wins
      }
    }
    // Nearest to the canal first; further labels of the same street only if far from the others.
    candidates.sort((p, q) => p.d - q.d);
    const picked = [];
    for (const c of candidates) {
      if (picked.every((o) => dist([o.x, o.y], [c.x, c.y]) >= C.streetRepeat)) picked.push(c);
    }
    for (const c of picked) streets.push([px(c.x), px(c.y), Math.round(c.angle * 1000), Math.round(c.fontPx), name, px(c.lenM)]);
  }
  log(`  ${streets.length} labels for ${new Set(streets.map((s) => s[4])).size} streets`);

  // ---- Bridge labels: one per bridge that really crosses the canal, named after the bridge itself
  // when IGN has its name ("Pont de Venise"), else after the street it carries, else "railway".
  log('Bridge labels…');
  for (const f of await corridorLayer('BDTOPO_V3:construction_lineaire')) {
    if (f.properties.nature !== 'Pont') continue;
    for (const l of lines(f.geometry)) bridgeCandidates.push({ pts: l, street: '', official: f.properties.toponyme ?? '', rail: false });
  }
  for (const f of constructions.filter((c) => c.properties.nature === 'Pont' && c.properties.toponyme)) {
    for (const poly of polygons(f.geometry)) bridgeCandidates.push({ pts: poly[0], street: '', official: f.properties.toponyme, rail: false });
  }
  const crossings = [];
  for (const cand of bridgeCandidates) {
    // Walk along the bridge and find where it gets closest to the canal's centre line.
    let best = null;
    for (const p of resample(cand.pts.length > 1 ? cand.pts : [cand.pts[0], cand.pts[0]], 2)) {
      for (const i of centreIdx.near(p[0], p[1], 1)) {
        const d = dist(p, centre[i]);
        if (!best || d < best.d) best = { d, i };
      }
    }
    if (!best || best.d > W[best.i] / 2 + 6) continue; // doesn't cross the water the boats use
    crossings.push({ i: best.i, ...cand });
  }
  crossings.sort((a, b) => a.i - b.i);
  const labels = [];
  for (let k = 0; k < crossings.length;) {
    // Everything crossing within 30 m of the canal is the same bridge (road + footpath + parapet...).
    const group = [crossings[k]];
    while (k + group.length < crossings.length && crossings[k + group.length].i - group[0].i <= 7) group.push(crossings[k + group.length]);
    k += group.length;
    const official = fixAccents(group.map((g) => g.official).find(Boolean) || group.map((g) => g.roadOfficial).find(Boolean) || '');
    const street = fixAccents(group.map((g) => g.street).find(Boolean) || '');
    const mid = group[Math.floor(group.length / 2)].i;
    const [kind, name] = official ? [0, official] : street ? [1, street] : group.some((g) => g.rail) ? [2, ''] : [-1, ''];
    if (kind < 0) continue;
    labels.push([px(centre[mid][0]), px(centre[mid][1]), kind, name]);
  }
  const skipped = crossings.length - labels.length;
  if (process.env.DEBUG_BRIDGES) console.log(crossings.map((c) => `${c.i} ${c.rail ? 'rail' : ''} off="${c.official}" road="${c.roadOfficial ?? ''}" street="${c.street}"`).join('\n'));
  log(`  ${labels.length} bridges over the canal (${crossings.length} crossing structures, ${skipped} merged or unnamed):`);
  log(`  ${labels.length} bridges over the canal: ${labels.map((l) => l[3] || '(railway)').join(', ')}`);

  const waterOut = water.filter((poly) => nearCanal(poly[0]) || coversCanal(poly)).map((poly) => ring(poly[0], 0.5));

  // Named places along the canal, for the slider that picks the stretch to race:
  // [x, y, kind, name] with kind 0 = end or default start, 1 = named bridge, 2 = removed lock,
  // 3 = bridge named after the street it carries (name = the street), 4 = railway bridge.
  const at = (s) => centre[Math.max(0, Math.min(n - 1, Math.round(s / sampleStep)))];
  const places = [
    [...at(C.leadIn).map(px), 0, C.north.name],
    [...at(startS - cutS).map(px), 0, C.start.name],
    [...at(finishS - cutS).map(px), 0, prettyLock(C.endLock)],
    ...labels.map(([x, y, kind, name]) => [x, y, [1, 3, 4][kind], name]),
  ];
  for (const f of locks) {
    if (f === endLock || !f.properties.toponyme) continue;
    const l = locate(canal, lockCentre(f));
    if (l.d > 60 || l.s < C.leadIn || l.s > finishS - cutS) continue;
    places.push([...at(l.s).map(px), 2, prettyLock(f.properties.toponyme)]);
  }
  log(`  ${places.length} named places: ${places.map((p) => p[3]).join(', ')}`);

  // 5. Write.
  const step = 2; // control points every 8 m
  const control = [];
  for (let i = 0; i < n; i += step) control.push(px(centre[i][0]), px(centre[i][1]), px(W[i]));
  if ((n - 1) % step) control.push(px(centre[n - 1][0]), px(centre[n - 1][1]), px(W[n - 1]));

  const meta = {
    source: 'IGN – BD TOPO®, Licence Ouverte Etalab 2.0',
    generated: new Date().toISOString().slice(0, 10),
    pxPerM: C.pxPerM,
    origin: [C.start.lon, C.start.lat],
  };
  const trackFile = join(ROOT, 'src/data/maps/reimsCanal.track.json');
  const sceneryFile = join(ROOT, 'public/maps/reims-canal.json');
  mkdirSync(dirname(trackFile), { recursive: true });
  mkdirSync(dirname(sceneryFile), { recursive: true });
  writeFileSync(trackFile, JSON.stringify({
    ...meta,
    // The default stretch, and the range any stretch must stay within (water behind the start for the grid).
    startDist: px(startS - cutS), finishDist: px(finishS - cutS), range: [px(C.leadIn), px(finishS - cutS)],
    places, centerLine: control,
  }));
  writeFileSync(sceneryFile, JSON.stringify({ ...meta, water: waterOut, vegetation, roads, rails, buildings, bridges, labels, streets, sports, cemeteries }));
  log(`\nWrote ${trackFile}\n  ${control.length / 3} control points`);
  log(`Wrote ${sceneryFile}\n  ${buildings.length} buildings, ${roads.length} roads, ${rails.length} railways, ${vegetation.length} vegetation, ${bridges.length} bridges, ${labels.length} bridge labels, ${streets.length} street labels, ${sports.length} sports grounds, ${cemeteries.length} cemeteries, ${waterOut.length} water`);
  void routeBox;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
