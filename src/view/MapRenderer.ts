import Phaser from 'phaser';
import { FONT } from '../config';
import { t } from '../i18n';
import type { Track } from '../track/Track';
import { drawLine } from './lines';
import { type SceneryData, TOWPATH } from './scenery';
import {
  type Box, drawBuilding, drawBuildingShadow, drawCemetery, drawLilyPad, drawRail, drawRoadBase, drawRoadMarkings, drawSport,
  clipRing, fastCircle, fillRing, setLineClip, type Plant, plants, thickLine, vegetationGround,
} from './mapArt';

export type { SceneryData } from './scenery';

const CHUNK = 512;
/** Tiles overlap by this much so no seam shows between them when the camera zoom isn't 1. */
const BLEED = 2;
/** Chunks this far beyond the view are drawn ahead of time; they are dropped once beyond KEEP. */
const MARGIN = 384;
const KEEP = 576;
/** Drawn chunks kept (hidden) after going out of range, ready to show again: a lap later, or back the other way. */
const CACHE_CHUNKS = 12;
/** Time spent drawing chunks per frame (ms), unless one in view must be finished. */
const FRAME_BUDGET_MS = 5;
/** Street names kept hidden after their chunks went, ready to show again. */
const HIDDEN_STREETS = 40;
/** Tree crowns stamped per drawing step. */
const TREE_BATCH = 150;



type Pt = { x: number; y: number };
const toPts = (flat: number[]): Pt[] => {
  const out: Pt[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push({ x: flat[i], y: flat[i + 1] });
  return out;
};

interface ChunkIndex {
  water: number[];
  vegetation: number[];
  roads: number[];
  rails: number[];
  buildings: number[];
  channel: number[];
  bridges: number[];
  streets: number[];
  sports: number[];
  cemeteries: number[];
  trees: number[];
  pads: number[];
}

type Layer = 'ground' | 'canopy' | 'shadow' | 'deck';
/** A chunk of map: its tiles, and the drawing steps left until it's done. */
interface Chunk {
  cell: [number, number];
  tiles: Phaser.GameObjects.RenderTexture[];
  steps: Generator<void, void, void>;
  done: boolean;
}
/** canopy: tree crowns, above the cars and people in the streets (streetLife.ts, depth 1.62), below the boats. */
const DEPTH: Record<Layer, number> = { ground: 1, canopy: 1.7, shadow: 9.5, deck: 20 };
const BRIDGE_SHADOW = 25;
/** How much of a street on land is laid over the end of a bridge deck that leads to it (px). */
const DECK_JOIN = 120;

/**
 * Draws a real-world map around the race. Only what the camera can see is drawn: the world is
 * cut into CHUNK-sized tiles, each rendered into a texture when it comes into view and recycled
 * when it leaves. Water is erased from the tiles so the animated water layer below shows through.
 * Bridges are drawn above the boats.
 */
export class MapRenderer {
  private index = new Map<string, ChunkIndex>();
  /** Chunks in range (drawn or being drawn): the ground tile, plus bridge shadows (below boats) and decks (above). */
  private active = new Map<string, Chunk>();
  /** Drawn chunks gone out of range, oldest first: shown again at once if the camera comes back. */
  private cache = new Map<string, Chunk>();
  private pools: Record<Layer, Phaser.GameObjects.RenderTexture[]> = { ground: [], canopy: [], shadow: [], deck: [] };
  private g: Phaser.GameObjects.Graphics;
  private eraser: Phaser.GameObjects.Graphics;
  private water: Phaser.GameObjects.TileSprite;
  private channel: { a: number; b: number }[] = [];
  /** Street name texts, shared by the chunks they overlap (reference counted; kept hidden a while at 0). */
  private streetTexts = new Map<number, { text: Phaser.GameObjects.Text | null; refs: number }>();
  /** Street names waiting to be made (one per frame: each takes a while). */
  private streetQueue: number[] = [];
  private first = true;
  /** For profiling: chunks drawn, and drawing steps taken over budget because the chunk was already in view. */
  readonly stats = { chunks: 0, late: 0 };
  /** Ground (not bridge) road pieces by vertex ("x,y"), to join bridge decks to the streets they lead to. */
  private groundAt = new Map<string, number[]>();

  constructor(private scene: Phaser.Scene, private track: Track, private data: SceneryData) {
    const c = track.def.colors;
    scene.cameras.main.setBackgroundColor(c.water);
    this.water = scene.add.tileSprite(0, 0, 64, 64, 'water').setOrigin(0).setDepth(0);
    this.g = scene.make.graphics({}, false);
    this.eraser = scene.make.graphics({}, false);
    this.buildIndex();
    drawLine(scene, track, track.startDist);
    drawLine(scene, track, track.startDist + track.lapLength);
    this.addBridgeLabels();
  }

  /**
   * Names of the bridges over the canal ("Pont de Venise", "Pont · Avenue de Champagne"), written
   * along the bridge on its deck, like the street names: following the road (or railway) that
   * crosses there, upright, never longer than the bridge.
   */
  private addBridgeLabels(): void {
    for (const [x, y, kind, name] of this.data.labels ?? []) {
      const s = this.track.samples[this.track.nearest(x, y).index];
      const text = kind === 0 ? name : kind === 1 ? `${t('map.bridge')} · ${name}` : t('map.railBridge');
      // The deck: the bridge road or railway nearest the label's spot, else straight across.
      let best = { d: 160, x, y, angle: Math.atan2(s.ny, s.nx) };
      const lines = [
        ...this.data.roads.filter((r) => r[2]).map((r) => r[3]),
        ...this.data.rails.filter((r) => r[1]).map((r) => r[2]),
      ];
      for (const l of lines) {
        for (let k = 0; k + 3 < l.length; k += 2) {
          const ax = l[k], ay = l[k + 1], bx = l[k + 2], by = l[k + 3];
          const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1;
          const u = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
          const px = ax + dx * u, py = ay + dy * u;
          const d = Math.hypot(px - x, py - y);
          if (d < best.d) best = { d, x: px, y: py, angle: Math.atan2(dy, dx) };
        }
      }
      // Upright: never upside down.
      let angle = best.angle;
      if (angle > Math.PI / 2) angle -= Math.PI;
      else if (angle < -Math.PI / 2) angle += Math.PI;
      const label = this.scene.add
        .text(best.x, best.y, text, {
          fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#3b4048', stroke: '#ffffff', strokeThickness: 6, resolution: 2,
        })
        .setOrigin(0.5)
        .setRotation(angle)
        .setDepth(20.6); // on the deck, like the street names
      label.setLetterSpacing(1);
      // As long as the bridge at most: the water and the towpaths either side.
      const span = s.width + 2 * TOWPATH + 40;
      if (label.width > span) label.setScale(span / label.width);
    }
  }

  // ---- Spatial index ----------------------------------------------------------

  private add(kind: keyof ChunkIndex, i: number, flat: number[], pad = 0): void {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let k = 0; k + 1 < flat.length; k += 2) {
      const x = flat[k], y = flat[k + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const x0 = Math.floor((minX - pad) / CHUNK), x1 = Math.floor((maxX + pad) / CHUNK);
    const y0 = Math.floor((minY - pad) / CHUNK), y1 = Math.floor((maxY + pad) / CHUNK);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const key = `${cx},${cy}`;
        let e = this.index.get(key);
        if (!e) {
          e = { water: [], vegetation: [], roads: [], rails: [], buildings: [], channel: [], bridges: [], streets: [], sports: [], cemeteries: [], trees: [], pads: [] };
          this.index.set(key, e);
        }
        e[kind].push(i);
      }
    }
  }

  private buildIndex(): void {
    const d = this.data;
    d.water.forEach((r, i) => this.add('water', i, r));
    d.vegetation.forEach(([, r], i) => this.add('vegetation', i, r));
    d.roads.forEach(([, w, , l], i) => this.add('roads', i, l, w / 2 + 6));
    d.rails.forEach(([w, , l], i) => this.add('rails', i, l, w / 2 + 6));
    d.buildings.forEach(([h, , r], i) => this.add('buildings', i, r, Math.min(40, h * 4)));
    d.bridges.forEach(([, r], i) => this.add('bridges', i, r, BRIDGE_SHADOW + 4));
    (d.sports ?? []).forEach(([, r], i) => this.add('sports', i, r));
    (d.cemeteries ?? []).forEach((r, i) => this.add('cemeteries', i, r));
    // A street name covers a stretch of road: index it by the box around the text.
    (d.streets ?? []).forEach(([x, y, , , , len], i) => this.add('streets', i, [x - len / 2, y - len / 2, x + len / 2, y + len / 2]));
    // Road segments on bridges are drawn on the bridge layers too.
    // (with room for the bits of street joined to the ends of a deck, see joinDeck).
    d.roads.forEach(([, w, bridge, l], i) => bridge && this.add('bridges', -1 - i, l, w / 2 + 15 + BRIDGE_SHADOW + 4 + DECK_JOIN));
    d.roads.forEach(([, , bridge, l], i) => {
      if (bridge) return;
      for (let k = 0; k + 1 < l.length; k += 2) {
        const key = `${l[k]},${l[k + 1]}`;
        (this.groundAt.get(key) ?? this.groundAt.set(key, []).get(key)!).push(i);
      }
    });
    // The navigable channel, as quads between centre-line samples (drawn wider for the towpath).
    (d.trees ?? []).forEach(([x, y, r], i) => this.add('trees', i, [x, y], r * 1.5));
    (d.pads ?? []).forEach(([x, y, r], i) => this.add('pads', i, [x, y], r + 2));
    const s = this.track.samples;
    // (A closed track's last quad joins the last sample back to the first.)
    for (let a = 0; a < (this.track.closed ? s.length : s.length - 1); a += 2) {
      const b = this.track.closed ? (a + 2) % s.length : Math.min(s.length - 1, a + 2);
      this.channel.push({ a, b });
      const hw = Math.max(s[a].width, s[b].width) / 2 + TOWPATH;
      this.add('channel', this.channel.length - 1, [s[a].x, s[a].y, s[b].x, s[b].y], hw);
    }
  }

  // ---- Per frame ----------------------------------------------------------------

  update(time: number): void {
    const view = this.scene.cameras.main.worldView;
    // Water layer: just covers the view, with the texture anchored to the world.
    const x0 = Math.floor((view.x - 128) / 128) * 128;
    const y0 = Math.floor((view.y - 128) / 128) * 128;
    this.water.setPosition(x0, y0).setSize(view.width + 384, view.height + 384);
    this.water.tilePositionX = x0 + time * 0.012;
    this.water.tilePositionY = y0 + time * 0.008;

    // Chunks wanted: those in view plus a margin, drawn ahead of time; kept until they are further
    // out than KEEP (so a boat weaving along a chunk's edge doesn't have it redrawn again and again).
    const range = (m: number): [number, number, number, number] => [
      Math.floor((view.x - m) / CHUNK), Math.floor((view.right + m) / CHUNK), Math.floor((view.y - m) / CHUNK), Math.floor((view.bottom + m) / CHUNK),
    ];
    const [kx0, kx1, ky0, ky1] = range(KEEP);
    for (const [key, chunk] of this.active) {
      const [cx, cy] = chunk.cell;
      if (cx < kx0 || cx > kx1 || cy < ky0 || cy > ky1) this.retire(key, chunk);
    }
    // In order: those in view first, then the nearest to the middle of the view.
    const [vx0, vx1, vy0, vy1] = range(0);
    const [cx0, cx1, cy0, cy1] = range(MARGIN);
    const mx = view.centerX / CHUNK - 0.5, my = view.centerY / CHUNK - 0.5;
    const wanted: { key: string; cx: number; cy: number; inView: boolean; d: number }[] = [];
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const key = `${cx},${cy}`;
        const have = this.active.get(key);
        if (have?.done) continue;
        if (!have && this.revive(key)) continue;
        const inView = cx >= vx0 && cx <= vx1 && cy >= vy0 && cy <= vy1;
        wanted.push({ key, cx, cy, inView, d: (cx - mx) ** 2 + (cy - my) ** 2 });
      }
    }
    this.makeStreet();
    if (!wanted.length) return;
    wanted.sort((a, b) => Number(b.inView) - Number(a.inView) || a.d - b.d);
    // A few milliseconds of drawing per frame (at least one step). A chunk already in view gets
    // finished whatever the cost, or there would be a hole in the map; everything at once at first.
    const t0 = performance.now();
    const budget = this.first ? Infinity : FRAME_BUDGET_MS;
    this.first = false;
    let steps = 0;
    for (const w of wanted) {
      let chunk = this.active.get(w.key);
      if (!chunk) {
        const tiles: Phaser.GameObjects.RenderTexture[] = [];
        chunk = { cell: [w.cx, w.cy], tiles, steps: this.chunkSteps(w.key, tiles), done: false };
        this.active.set(w.key, chunk);
      }
      // Lines are limited to the tile being drawn (see setLineClip).
      const x = w.cx * CHUNK, y = w.cy * CHUNK;
      setLineClip({ x0: x - BLEED, y0: y - BLEED, x1: x + CHUNK + BLEED, y1: y + CHUNK + BLEED });
      while (!chunk.done && (w.inView || steps === 0 || performance.now() - t0 < budget)) {
        if (w.inView && steps > 0 && performance.now() - t0 >= budget) this.stats.late++;
        chunk.done = !!chunk.steps.next().done;
        steps++;
      }
      if (chunk.done) this.stats.chunks++;
      setLineClip(null);
      if (chunk.done) this.show(w.key, chunk);
      else break;
    }
    // At the start, every street name in view at once too.
    if (budget === Infinity) while (this.streetQueue.length) this.makeStreet();
  }

  /** A finished chunk: its tiles appear, with the street names over it. */
  private show(key: string, chunk: Chunk): void {
    for (const rt of chunk.tiles) rt.setVisible(true);
    for (const i of this.index.get(key)?.streets ?? []) this.retainStreet(i);
  }

  /** A chunk out of range: kept drawn but hidden for a while (it may come back), its tiles reused later. */
  private retire(key: string, chunk: Chunk): void {
    this.active.delete(key);
    for (const rt of chunk.tiles) rt.setVisible(false);
    if (!chunk.done) {
      // Half drawn: its tiles go straight back to the pool.
      for (const rt of chunk.tiles) this.pools[rt.getData('layer') as Layer].push(rt);
      return;
    }
    for (const i of this.index.get(key)?.streets ?? []) this.releaseStreet(i);
    this.cache.delete(key);
    this.cache.set(key, chunk);
    // The oldest kept chunks give their tiles back to the pool.
    while (this.cache.size > CACHE_CHUNKS) {
      const [oldKey, old] = this.cache.entries().next().value!;
      this.cache.delete(oldKey);
      for (const rt of old.tiles) this.pools[rt.getData('layer') as Layer].push(rt);
    }
  }

  /** A chunk wanted again that is still kept: shown at once, nothing to draw. */
  private revive(key: string): boolean {
    const chunk = this.cache.get(key);
    if (!chunk) return false;
    this.cache.delete(key);
    this.active.set(key, chunk);
    this.show(key, chunk);
    return true;
  }

  private tile(layer: Layer, x: number, y: number): Phaser.GameObjects.RenderTexture {
    let rt = this.pools[layer].pop();
    if (!rt) {
      rt = this.scene.add.renderTexture(0, 0, CHUNK + BLEED * 2, CHUNK + BLEED * 2).setOrigin(0).setDepth(DEPTH[layer]);
      rt.setData('layer', layer);
    }
    // Hidden until the whole chunk is drawn.
    return rt.setPosition(x - BLEED, y - BLEED).setVisible(false).clear();
  }

  /**
   * Draws a chunk's tiles one layer at a time, yielding between layers so the work can be spread
   * over several frames (see update). The shared Graphics are cleared and used up within a step.
   */
  private *chunkSteps(key: string, tiles: Phaser.GameObjects.RenderTexture[]): Generator<void, void, void> {
    const [cx, cy] = key.split(',').map(Number);
    const x = cx * CHUNK, y = cy * CHUNK;
    const rt = this.tile('ground', x, y);
    tiles.push(rt);
    const ox = -(x - BLEED), oy = -(y - BLEED);

    const e = this.index.get(key);
    let g = this.g.clear();
    const d = this.data;
    const colors = this.track.def.colors;
    g.fillStyle(colors.land, 1).fillRect(x - BLEED, y - BLEED, CHUNK + BLEED * 2, CHUNK + BLEED * 2);
    const tileBox: Box = { x0: x - BLEED, y0: y - BLEED, x1: x + CHUNK + BLEED, y1: y + CHUNK + BLEED };
    const trees: Plant[] = [];
    // Woods and fields cut down to this tile (with room for plants overhanging its edges).
    const veg = (e?.vegetation ?? []).map((i) => clipRing(d.vegetation[i][1], { x0: tileBox.x0 - 90, y0: tileBox.y0 - 90, x1: tileBox.x1 + 90, y1: tileBox.y1 + 90 }));
    if (e) {
      // Ground: grass and woodland floors, cemeteries, sports grounds, the towpath and stone quays.
      e.vegetation.forEach((i, k) => veg[k].length && fillRing(g, veg[k], vegetationGround(d.vegetation[i][0])));
      for (const i of e.cemeteries) drawCemetery(g, d.cemeteries![i], tileBox);
      for (const i of e.sports) drawSport(g, d.sports![i][0], d.sports![i][1]);
      g.fillStyle(colors.shore, 1);
      for (const i of e.channel) this.channelQuad(g, i, TOWPATH);
      g.fillStyle(d.style?.quay ?? 0x8d8a83, 1);
      for (const i of e.channel) this.channelQuad(g, i, 6); // what's left of this after the water is cut out: a quay edge
      for (const i of e.water) thickLine(g, [...d.water[i], d.water[i][0], d.water[i][1]], 10, 0x8d8a83);
    }
    rt.draw(g, ox, oy);
    if (e) {
      yield;
      g = this.g.clear();

      // Roads in layers, so streets that meet join up: footpaths, pavements and verges of all of
      // them, then all the asphalt, then (after the railways) all the markings, which a crossing
      // street never covers.
      const groundRoads = e.roads.filter((i) => !d.roads[i][2]);
      // Paths first: a footpath meeting a street passes under its pavement.
      groundRoads.sort((a, b) => (d.roads[a][0] === 2 ? 0 : 1) - (d.roads[b][0] === 2 ? 0 : 1));
      for (const layer of [0, 1] as const) {
        for (const i of groundRoads) drawRoadBase(g, d.roads[i][0], d.roads[i][1], d.roads[i][3], layer);
      }
      for (const i of e.rails) {
        const [w, bridge, line] = d.rails[i];
        if (!bridge) drawRail(g, w, line);
      }
      for (const i of groundRoads) drawRoadMarkings(g, d.roads[i][0], d.roads[i][1], d.roads[i][3]);
      rt.draw(g, ox, oy);
      yield;
      g = this.g.clear();

      // Buildings: shadows, then roofs
      for (const i of e.buildings) drawBuildingShadow(g, d.buildings[i][0], d.buildings[i][2]);
      for (const i of e.buildings) drawBuilding(g, d.buildings[i][1], d.buildings[i][2], d.style?.tiled);
      rt.draw(g, ox, oy);
      yield;
      g = this.g.clear();

      // Trees last (stamped below): their crowns overhang paths and road edges, as they do.
      e.vegetation.forEach((i, k) => veg[k].length && trees.push(...plants(g, d.vegetation[i][0], veg[k], tileBox, d.vegetation[i][1])));
      for (const i of e.trees) {
        const [tx, ty, r, color] = d.trees![i];
        trees.push({ x: tx, y: ty, r, color });
      }
      rt.draw(g, ox, oy);
    }
    // Tree crowns are textures stamped in one batch: far cheaper than drawing thousands of circles.
    // In batches (a wood has hundreds per tile): all the shadows, then all the crowns.
    // The shadows on the ground; the crowns on a layer of their own, over the street life.
    const canopy = trees.length ? this.tile('canopy', x, y) : null;
    if (canopy) tiles.push(canopy);
    for (const crowns of [false, true]) {
      const into = crowns ? canopy! : rt;
      for (let k = 0; k < trees.length; k += TREE_BATCH) {
        yield;
        into.beginDraw();
        for (const p of trees.slice(k, k + TREE_BATCH)) {
          if (crowns) into.stamp('crown', undefined, p.x + ox, p.y + oy, { scale: p.r / 30, tint: p.color, skipBatch: true });
          else into.stamp('crownShadow', undefined, p.x + p.r * 0.35 + ox, p.y + p.r * 0.45 + oy, { scale: p.r / 30, alpha: 0.22, skipBatch: true });
        }
        into.endDraw();
      }
    }

    // Cut out the water so the animated layer underneath shows.
    if (e && (e.water.length || e.channel.length)) {
      yield;
      const er = this.eraser.clear().fillStyle(0xffffff, 1);
      for (const i of e.water) {
        const ring = clipRing(d.water[i], { x0: tileBox.x0 - 4, y0: tileBox.y0 - 4, x1: tileBox.x1 + 4, y1: tileBox.y1 + 4 });
        if (ring.length) er.fillPoints(toPts(ring), true);
      }
      for (const i of e.channel) this.channelQuad(er, i, 0);
      rt.erase(er, ox, oy);
      canopy?.erase(er, ox, oy); // crowns stop at the bank, as they did on the ground
      yield;
      // On the water just cut out: a pale band along each bank (shallows and the wash against the
      // quay), a thin bright line at the very edge, and any lily pads.
      const w = g.clear();
      for (const i of e.channel) this.bankBand(w, i, 16, 0xffffff, 0.09);
      for (const i of e.channel) this.bankBand(w, i, 3.5, 0xffffff, 0.3);
      for (const i of e.pads) drawLilyPad(w, d.pads![i][0], d.pads![i][1], d.pads![i][2]);
      rt.draw(w, ox, oy);
    }

    // Bridges: a shadow tile below the boats and a deck tile above them, only where there are bridges.
    if (e && e.bridges.length) {
      yield;
      const shadow = this.tile('shadow', x, y).setAlpha(0.22);
      this.drawBridges(g.clear(), e.bridges, true);
      shadow.draw(g, ox, oy);
      tiles.push(shadow);
      yield;
      const deck = this.tile('deck', x, y);
      this.drawBridges(g.clear(), e.bridges, false);
      deck.draw(g, ox, oy);
      tiles.push(deck);
    }
  }

  /**
   * Street names are text objects (crisp at any size), shown while a chunk that shows them is.
   * Making one is slow (drawn on a canvas, then uploaded), so those no longer shown are kept hidden
   * for a while, in case they come back.
   */
  private retainStreet(i: number): void {
    const have = this.streetTexts.get(i);
    if (have) {
      if (have.refs++ === 0) have.text?.setVisible(true);
      return;
    }
    this.streetTexts.set(i, { text: null, refs: 1 });
    this.streetQueue.push(i);
  }

  /** Make the next street name waiting, if it's still wanted. */
  private makeStreet(): void {
    let i = -1, entry;
    while (this.streetQueue.length) {
      i = this.streetQueue.shift()!;
      entry = this.streetTexts.get(i);
      if (entry && !entry.text) break;
      entry = undefined;
    }
    if (!entry) return;
    const [x, y, angle, font, name, len] = this.data.streets![i];
    const text = this.scene.add
      .text(x, y, name, {
        fontFamily: FONT, fontSize: `${font}px`, fontStyle: 'bold', color: '#3b4048', stroke: '#ffffff', strokeThickness: Math.max(3, font * 0.26), resolution: 2,
      })
      .setOrigin(0.5)
      .setRotation(angle / 1000)
      .setDepth(20.5); // above bridge decks, so a street running onto a bridge keeps its name (labels stay 8 m from the water, away from boats)
    text.setLetterSpacing(1);
    if (text.width > len) text.setScale(len / text.width); // never run past the stretch of road it was fitted to
    entry.text = text.setVisible(entry.refs > 0);
  }

  private releaseStreet(i: number): void {
    const have = this.streetTexts.get(i);
    if (!have || --have.refs > 0) return;
    have.text?.setVisible(false);
    // Kept in the order they were hidden: the oldest go when there are too many.
    this.streetTexts.delete(i);
    this.streetTexts.set(i, have);
    let hidden = 0;
    for (const v of this.streetTexts.values()) if (v.refs === 0) hidden++;
    for (const [k, v] of this.streetTexts) {
      if (hidden <= HIDDEN_STREETS) break;
      if (v.refs > 0) continue;
      v.text?.destroy();
      this.streetTexts.delete(k);
      hidden--;
    }
  }

  private channelQuad(g: Phaser.GameObjects.Graphics, i: number, extra: number): void {
    const s = this.track.samples;
    const { a, b } = this.channel[i];
    const A = s[a], B = s[b];
    const ha = A.width / 2 + extra, hb = B.width / 2 + extra;
    g.fillPoints([
      { x: A.x + A.nx * ha, y: A.y + A.ny * ha },
      { x: B.x + B.nx * hb, y: B.y + B.ny * hb },
      { x: B.x - B.nx * hb, y: B.y - B.ny * hb },
      { x: A.x - A.nx * ha, y: A.y - A.ny * ha },
    ] as Phaser.Math.Vector2[], true);
    // Round the joint so consecutive quads never leave a gap on bends.
    g.fillCircle(B.x, B.y, hb);
  }

  /** The first `length` pixels of each street on land that starts or passes at (x, y), as [class, width, line]. */
  private joinDeck(x: number, y: number, length: number): [number, number, number[]][] {
    const out: [number, number, number[]][] = [];
    for (const i of this.groundAt.get(`${x},${y}`) ?? []) {
      const [cls, w, , l] = this.data.roads[i];
      if (cls === 2) continue; // footpaths have no pavement to hide
      const max = Math.min(DECK_JOIN, length);
      for (let k = 0; k + 1 < l.length; k += 2) {
        if (l[k] !== x || l[k + 1] !== y) continue;
        for (const dir of [-2, 2]) {
          const piece = [x, y];
          let left = max;
          for (let j = k + dir; j >= 0 && j + 1 < l.length && left > 0; j += dir) {
            const px = piece[piece.length - 2], py = piece[piece.length - 1];
            const len = Math.hypot(l[j] - px, l[j + 1] - py);
            const f = Math.min(1, left / (len || 1));
            piece.push(px + (l[j] - px) * f, py + (l[j + 1] - py) * f);
            left -= len;
          }
          if (piece.length >= 4) out.push([cls, w, piece]);
        }
      }
    }
    return out;
  }

  /** A strip of water along both banks of a channel quad, `width` px wide, inside the channel. */
  private bankBand(g: Phaser.GameObjects.Graphics, i: number, width: number, color: number, alpha: number): void {
    const s = this.track.samples;
    const A = s[this.channel[i].a], B = s[this.channel[i].b];
    g.fillStyle(color, alpha);
    for (const side of [1, -1]) {
      const ha = (A.width / 2) * side, hb = (B.width / 2) * side, wa = ha - width * side, wb = hb - width * side;
      g.fillPoints([
        { x: A.x + A.nx * ha, y: A.y + A.ny * ha },
        { x: B.x + B.nx * hb, y: B.y + B.ny * hb },
        { x: B.x + B.nx * wb, y: B.y + B.ny * wb },
        { x: A.x + A.nx * wa, y: A.y + A.ny * wa },
      ] as Phaser.Math.Vector2[], true);
    }
  }

  /** Thick polyline with round joins (Phaser's own thick strokes leave gaps at corners). */
  private polyline(g: Phaser.GameObjects.Graphics, flat: number[], width: number, color: number): void {
    const pts = toPts(flat);
    if (pts.length < 2) return;
    g.lineStyle(width, color, 1).strokePoints(pts as Phaser.Math.Vector2[], false, false);
    if (width >= 16) {
      g.fillStyle(color, 1);
      for (const p of pts) fastCircle(g, p.x, p.y, width / 2);
    }
  }

  /**
   * Bridge polygons (index >= 0) and road segments on bridges (index -1 - roadIndex).
   * As a shadow: solid black, offset (the tile itself is translucent); otherwise the deck.
   */
  private drawBridges(g: Phaser.GameObjects.Graphics, items: number[], asShadow: boolean): void {
    const d = this.data;
    const shift = (flat: number[]) => (asShadow ? flat.map((v, i) => v + (i % 2 ? BRIDGE_SHADOW : BRIDGE_SHADOW * 0.6)) : flat);
    for (const i of items) {
      if (i < 0) continue;
      const pts = toPts(shift(d.bridges[i][1])) as Phaser.Math.Vector2[];
      g.fillStyle(asShadow ? 0x000000 : 0xb9b1a3, 1).fillPoints(pts, true);
      if (!asShadow) g.lineStyle(5, 0x7d756a, 1).strokePoints(pts, true, true);
    }
    // Roads on bridges, in layers like the roads on the ground so the pieces of a deck join up.
    const decks = items.filter((i) => i < 0).map((i) => d.roads[-1 - i]);
    if (asShadow) {
      for (const [, w, , line] of decks) this.polyline(g, shift(line), w + 30, 0x000000);
      return;
    }
    for (const [, w, , line] of decks) thickLine(g, line, w + 34, 0x8f877c); // parapets
    for (const [cls, w, , line] of decks) drawRoadBase(g, cls, w, line, 0);
    // Where a deck meets a street on land, the deck (drawn above everything) would end in a rounded
    // pavement across that street: lay the street's asphalt over that rounded end (only as far as
    // it reaches), under the deck's own asphalt.
    const joins = decks.flatMap(([, w, , line]) => [
      ...this.joinDeck(line[0], line[1], w / 2 + 19),
      ...this.joinDeck(line[line.length - 2], line[line.length - 1], w / 2 + 19),
    ]);
    for (const [cls, w, line] of joins) drawRoadBase(g, cls, w, line, 1);
    for (const [cls, w, , line] of decks) drawRoadBase(g, cls, w, line, 1);
    for (const [cls, w, , line] of decks) drawRoadMarkings(g, cls, w, line);
  }
}
