import Phaser from 'phaser';
import { FONT } from '../config';
import { t } from '../i18n';
import type { Track } from '../track/Track';
import { drawLine } from './lines';
import {
  type Box, drawBuilding, drawBuildingShadow, drawCemetery, drawRail, drawRoadBase, drawRoadMarkings, drawSport,
  fastCircle, fillRing, type Plant, plants, thickLine, vegetationGround,
} from './mapArt';

/** Scenery of a real-world track, as written by scripts/import-reims.mjs (game pixels). */
export interface SceneryData {
  source: string;
  water: number[][];
  vegetation: [number, number[]][];
  roads: [number, number, number, number[]][]; // class (0 motorway, 1 road, 2 path), width, bridge, line
  rails: [number, number, number[]][]; // width, bridge, line
  buildings: [number, number, number[]][]; // height (m), kind (0 house, 1 church, 2 industrial), ring
  bridges: [string, number[]][];
  /** Bridges over the canal: x, y on the centre line, kind (0 own name, 1 street it carries, 2 railway), name. */
  labels?: [number, number, number, string][];
  /** Street names written along the streets: x, y, angle (milliradians), font size, name, available length (px). */
  streets?: [number, number, number, number, string, number][];
  /** Sports grounds: kind (0 pitch, 1 tennis, 2 court, 3 track, 4 pool), ring. */
  sports?: [number, number[]][];
  cemeteries?: number[][];
}

const CHUNK = 512;
/** Tiles overlap by this much so no seam shows between them when the camera zoom isn't 1. */
const BLEED = 2;
const MARGIN = 160;
const TOWPATH = 45; // px of quay/towpath drawn along both banks


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
}

type Layer = 'ground' | 'shadow' | 'deck';
const DEPTH: Record<Layer, number> = { ground: 1, shadow: 9.5, deck: 20 };
const BRIDGE_SHADOW = 25;

/**
 * Draws a real-world map around the race. Only what the camera can see is drawn: the world is
 * cut into CHUNK-sized tiles, each rendered into a texture when it comes into view and recycled
 * when it leaves. Water is erased from the tiles so the animated water layer below shows through.
 * Bridges are drawn above the boats.
 */
export class MapRenderer {
  private index = new Map<string, ChunkIndex>();
  /** Rendered tiles per chunk: the ground, plus bridge shadows (below boats) and decks (above). */
  private active = new Map<string, Phaser.GameObjects.RenderTexture[]>();
  private pools: Record<Layer, Phaser.GameObjects.RenderTexture[]> = { ground: [], shadow: [], deck: [] };
  private g: Phaser.GameObjects.Graphics;
  private eraser: Phaser.GameObjects.Graphics;
  private water: Phaser.GameObjects.TileSprite;
  private channel: { a: number; b: number }[] = [];
  /** Street name texts currently on screen, shared by the tiles they overlap (reference counted). */
  private streetTexts = new Map<number, { text: Phaser.GameObjects.Text; refs: number }>();
  private first = true;

  constructor(private scene: Phaser.Scene, private track: Track, private data: SceneryData) {
    const c = track.def.colors;
    scene.cameras.main.setBackgroundColor(c.water);
    this.water = scene.add.tileSprite(0, 0, 64, 64, 'water').setOrigin(0).setDepth(0).setTint(c.waterDeep);
    this.g = scene.make.graphics({}, false);
    this.eraser = scene.make.graphics({}, false);
    this.buildIndex();
    drawLine(scene, track, track.startDist);
    drawLine(scene, track, track.startDist + track.lapLength);
    this.addBridgeLabels();
  }

  /**
   * Names of the bridges over the canal ("Pont de Venise", "Pont · Avenue de Champagne"),
   * set on the bank beside each bridge so the boats pass under the deck, not under the text.
   */
  private addBridgeLabels(): void {
    for (const [x, y, kind, name] of this.data.labels ?? []) {
      const s = this.track.samples[this.track.nearest(x, y).index];
      const side = s.width / 2 + 95; // beside the water, on the left bank
      const text = kind === 0 ? name : kind === 1 ? `${t('map.bridge')} · ${name}` : t('map.railBridge');
      const label = this.scene.add
        .text(x + s.nx * side, y + s.ny * side, text, {
          fontFamily: FONT, fontSize: '30px', fontStyle: 'bold', color: '#ffffff', stroke: '#2b3a4a', strokeThickness: 7, align: 'center', resolution: 2,
        })
        .setOrigin(0.5)
        .setDepth(21);
      if (label.width > 460) label.setScale(460 / label.width);
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
          e = { water: [], vegetation: [], roads: [], rails: [], buildings: [], channel: [], bridges: [], streets: [], sports: [], cemeteries: [] };
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
    d.roads.forEach(([, w, bridge, l], i) => bridge && this.add('bridges', -1 - i, l, w / 2 + 15 + BRIDGE_SHADOW + 4));
    // The navigable channel, as quads between centre-line samples (drawn wider for the towpath).
    const s = this.track.samples;
    for (let a = 0; a < s.length - 1; a += 2) {
      const b = Math.min(s.length - 1, a + 2);
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

    const cx0 = Math.floor((view.x - MARGIN) / CHUNK), cx1 = Math.floor((view.right + MARGIN) / CHUNK);
    const cy0 = Math.floor((view.y - MARGIN) / CHUNK), cy1 = Math.floor((view.bottom + MARGIN) / CHUNK);
    const needed = new Set<string>();
    for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) needed.add(`${cx},${cy}`);

    for (const [key, tiles] of this.active) {
      if (!needed.has(key)) {
        for (const rt of tiles) {
          rt.setVisible(false);
          this.pools[rt.getData('layer') as Layer].push(rt);
        }
        this.active.delete(key);
        for (const i of this.index.get(key)?.streets ?? []) this.releaseStreet(i);
      }
    }
    // Draw a couple of tiles per frame to avoid hitches; everything at once on the first frame.
    let budget = this.first ? Infinity : 2;
    this.first = false;
    for (const key of needed) {
      if (budget <= 0) break;
      if (this.active.has(key)) continue;
      this.renderChunk(key);
      budget--;
    }
  }

  private tile(layer: Layer, x: number, y: number): Phaser.GameObjects.RenderTexture {
    let rt = this.pools[layer].pop();
    if (!rt) {
      rt = this.scene.add.renderTexture(0, 0, CHUNK + BLEED * 2, CHUNK + BLEED * 2).setOrigin(0).setDepth(DEPTH[layer]);
      rt.setData('layer', layer);
    }
    return rt.setPosition(x - BLEED, y - BLEED).setVisible(true).clear();
  }

  private renderChunk(key: string): void {
    const [cx, cy] = key.split(',').map(Number);
    const x = cx * CHUNK, y = cy * CHUNK;
    const rt = this.tile('ground', x, y);
    const tiles = [rt];
    this.active.set(key, tiles);
    const ox = -(x - BLEED), oy = -(y - BLEED);

    const e = this.index.get(key);
    for (const i of e?.streets ?? []) this.retainStreet(i);
    const g = this.g.clear();
    const d = this.data;
    const colors = this.track.def.colors;
    g.fillStyle(colors.land, 1).fillRect(x - BLEED, y - BLEED, CHUNK + BLEED * 2, CHUNK + BLEED * 2);
    const tileBox: Box = { x0: x - BLEED, y0: y - BLEED, x1: x + CHUNK + BLEED, y1: y + CHUNK + BLEED };
    const trees: Plant[] = [];
    if (e) {
      // Ground: grass and woodland floors, cemeteries, sports grounds, the towpath and stone quays.
      for (const i of e.vegetation) fillRing(g, d.vegetation[i][1], vegetationGround(d.vegetation[i][0]));
      for (const i of e.cemeteries) drawCemetery(g, d.cemeteries![i], tileBox);
      for (const i of e.sports) drawSport(g, d.sports![i][0], d.sports![i][1]);
      g.fillStyle(colors.shore, 1);
      for (const i of e.channel) this.channelQuad(g, i, TOWPATH);
      g.fillStyle(0x8d8a83, 1);
      for (const i of e.channel) this.channelQuad(g, i, 6); // what's left of this after the water is cut out: a quay edge
      for (const i of e.water) thickLine(g, [...d.water[i], d.water[i][0], d.water[i][1]], 10, 0x8d8a83);

      // Roads (surfaces first, so markings are never covered by a crossing street) and railways
      for (const i of e.roads) {
        const [cls, w, bridge, line] = d.roads[i];
        if (!bridge) drawRoadBase(g, cls, w, line);
      }
      for (const i of e.rails) {
        const [w, bridge, line] = d.rails[i];
        if (!bridge) drawRail(g, w, line);
      }
      for (const i of e.roads) {
        const [cls, w, bridge, line] = d.roads[i];
        if (!bridge) drawRoadMarkings(g, cls, w, line);
      }

      // Buildings: shadows, then roofs
      for (const i of e.buildings) drawBuildingShadow(g, d.buildings[i][0], d.buildings[i][2]);
      for (const i of e.buildings) drawBuilding(g, d.buildings[i][1], d.buildings[i][2]);

      // Trees last (stamped below): their crowns overhang paths and road edges, as they do.
      for (const i of e.vegetation) trees.push(...plants(g, d.vegetation[i][0], d.vegetation[i][1], tileBox));
    }
    rt.draw(g, ox, oy);
    // Tree crowns are textures stamped in one batch: far cheaper than drawing thousands of circles.
    if (trees.length) {
      rt.beginDraw();
      for (const p of trees) rt.stamp('crownShadow', undefined, p.x + p.r * 0.35 + ox, p.y + p.r * 0.45 + oy, { scale: p.r / 30, alpha: 0.22, skipBatch: true });
      for (const p of trees) rt.stamp('crown', undefined, p.x + ox, p.y + oy, { scale: p.r / 30, tint: p.color, skipBatch: true });
      rt.endDraw();
    }

    // Cut out the water so the animated layer underneath shows.
    if (e && (e.water.length || e.channel.length)) {
      const er = this.eraser.clear().fillStyle(0xffffff, 1);
      for (const i of e.water) er.fillPoints(toPts(d.water[i]), true);
      for (const i of e.channel) this.channelQuad(er, i, 0);
      rt.erase(er, ox, oy);
    }

    // Bridges: a shadow tile below the boats and a deck tile above them, only where there are bridges.
    if (e && e.bridges.length) {
      const shadow = this.tile('shadow', x, y).setAlpha(0.22);
      this.drawBridges(g.clear(), e.bridges, true);
      shadow.draw(g, ox, oy);
      const deck = this.tile('deck', x, y);
      this.drawBridges(g.clear(), e.bridges, false);
      deck.draw(g, ox, oy);
      tiles.push(shadow, deck);
    }
  }

  /** Street names are text objects (crisp at any size), created while a tile that shows them is on screen. */
  private retainStreet(i: number): void {
    const have = this.streetTexts.get(i);
    if (have) {
      have.refs++;
      return;
    }
    const [x, y, angle, font, name, len] = this.data.streets![i];
    const text = this.scene.add
      .text(x, y, name, {
        fontFamily: FONT, fontSize: `${font}px`, fontStyle: 'bold', color: '#3b4048', stroke: '#ffffff', strokeThickness: Math.max(3, font * 0.26), resolution: 2,
      })
      .setOrigin(0.5)
      .setRotation(angle / 1000)
      .setDepth(1.5); // above the ground tiles, below boats and bridge decks
    text.setLetterSpacing(1);
    if (text.width > len) text.setScale(len / text.width); // never run past the stretch of road it was fitted to
    this.streetTexts.set(i, { text, refs: 1 });
  }

  private releaseStreet(i: number): void {
    const have = this.streetTexts.get(i);
    if (!have || --have.refs > 0) return;
    have.text.destroy();
    this.streetTexts.delete(i);
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
    for (const i of items) {
      if (i >= 0) continue;
      const [cls, w, , line] = d.roads[-1 - i];
      if (asShadow) {
        this.polyline(g, shift(line), w + 30, 0x000000);
        continue;
      }
      thickLine(g, line, w + 34, 0x8f877c); // parapets
      drawRoadBase(g, cls, w, line);
      drawRoadMarkings(g, cls, w, line);
    }
  }
}
