import Phaser from 'phaser';
import { BOATS, type BoatDef } from '../data/boats';
import { generateItemIcons } from './itemIcons';
import { BOAT_ART_PAD, drawBoatArt, hasBoatArt } from './boatArt';
import { drawPeniche, drawPenicheAccent } from './peniche';
import { drawCrate, drawDrill, drawGlueBlob, drawGluePuddle, drawSaw, drawVolunteer, drawWaterTile } from './worldArt';

type G = Phaser.GameObjects.Graphics;

/** Crates, volunteers, drills, glue blobs and the saw have textures twice their game size: display them at this scale. */
export const WORLD_ART_SCALE = 0.5;

/** Boat textures are drawn at this multiple of their game size, for sharper sprites. */
const BOAT_TEX_SCALE = 3;

/** Boats drawn with the canvas API (boatArt.ts) use a bigger multiple: they are full of small details. */
const ART_TEX_SCALE = 3;

/** A texture drawn with the Canvas 2D API, in design units (`scale` canvas pixels each). */
function canvasTexture(scene: Phaser.Scene, key: string, w: number, h: number, scale: number): CanvasRenderingContext2D | null {
  if (scene.textures.exists(key)) return null;
  const tex = scene.textures.createCanvas(key, Math.ceil(w * scale), Math.ceil(h * scale));
  if (!tex) return null;
  const ctx = tex.getContext();
  ctx.scale(scale, scale);
  return ctx;
}

/** The two layers of a boat drawn by boatArt.ts: `boat_<id>` (details) and `boat_<id>_paint` (takes the racer's colour). */
function boatArtTextures(scene: Phaser.Scene, def: BoatDef): void {
  const w = def.size.length + BOAT_ART_PAD * 2, h = def.size.width + BOAT_ART_PAD * 2;
  const detail = canvasTexture(scene, `boat_${def.id}`, w, h, ART_TEX_SCALE);
  const paint = canvasTexture(scene, `boat_${def.id}_paint`, w, h, ART_TEX_SCALE);
  if (!detail || !paint) return;
  detail.translate(BOAT_ART_PAD, BOAT_ART_PAD);
  paint.translate(BOAT_ART_PAD, BOAT_ART_PAD);
  drawBoatArt(paint, detail, def);
  (scene.textures.get(`boat_${def.id}`) as Phaser.Textures.CanvasTexture).refresh();
  (scene.textures.get(`boat_${def.id}_paint`) as Phaser.Textures.CanvasTexture).refresh();
}

function gen(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: G) => void): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

export function generateTextures(scene: Phaser.Scene): void {
  generateItemIcons(scene);
  const S = BOAT_TEX_SCALE;
  for (const b of BOATS) {
    if (hasBoatArt(b)) {
      boatArtTextures(scene, b);
      continue;
    }
    // Cabourg, the péniche: its own drawing code, with the racer's colour on an accent layer on top.
    const w = b.size.length * S, h = b.size.width * S;
    gen(scene, `boat_${b.id}`, w, h, (g) => (g.scaleCanvas(S, S), drawPeniche(g, b)));
    gen(scene, `boat_${b.id}_accent`, w, h, (g) => (g.scaleCanvas(S, S), drawPenicheAccent(g, b)));
  }

  // Things on the water (worldArt.ts), drawn at twice their game size: show them at WORLD_ART_SCALE.
  const world = (key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, scale = 1 / WORLD_ART_SCALE): void => {
    const c = canvasTexture(scene, key, w, h, scale);
    if (!c) return;
    draw(c);
    (scene.textures.get(key) as Phaser.Textures.CanvasTexture).refresh();
  };
  world('crate', 44, 44, drawCrate);
  world('volunteer', 28, 28, drawVolunteer);
  world('drill', 54, 22, drawDrill);
  world('glue', 128, 128, drawGluePuddle, 1); // big and soft: its game size is enough
  world('blob', 30, 30, drawGlueBlob);
  world('saw', 56, 40, drawSaw);
  world('water', 256, 256, drawWaterTile, 1);
  // A tree crown seen from above, in greys so a tint colours it: darker rim, lighter top-left.
  gen(scene, 'crown', 64, 64, (g) => {
    g.fillStyle(0xbcbcbc, 1).fillCircle(32, 32, 30);
    g.fillStyle(0xd9d9d9, 1).fillCircle(30, 30, 25);
    g.fillStyle(0xf2f2f2, 1).fillCircle(24, 23, 15);
    g.fillStyle(0xffffff, 1).fillCircle(21, 20, 7);
    g.fillStyle(0xa8a8a8, 1).fillCircle(42, 40, 5).fillCircle(38, 22, 4).fillCircle(22, 44, 4);
  });
  gen(scene, 'crownShadow', 64, 64, (g) => {
    g.fillStyle(0x000000, 1).fillCircle(32, 32, 30);
  });
  gen(scene, 'droplet', 10, 10, (g) => {
    g.fillStyle(0xffffff, 1).fillCircle(5, 5, 4);
  });
  gen(scene, 'ring', 96, 96, (g) => {
    g.lineStyle(4, 0xffffff, 0.9).strokeCircle(48, 48, 44);
    g.lineStyle(2, 0xffffff, 0.4).strokeCircle(48, 48, 38);
  });
  gen(scene, 'splinter', 12, 5, (g) => {
    g.fillStyle(0xffffff, 1).fillRect(0, 0, 12, 5);
  });
  gen(scene, 'bubble', 16, 16, (g) => {
    g.lineStyle(2, 0xffffff, 0.9).strokeCircle(8, 8, 6);
    g.fillStyle(0xffffff, 0.8).fillCircle(6, 6, 1.5);
  });
  gen(scene, 'wake', 24, 24, (g) => {
    g.fillStyle(0xffffff, 1).fillCircle(12, 12, 10);
  });
  gen(scene, 'spark', 8, 8, (g) => {
    g.fillStyle(0xfff2a0, 1).fillCircle(4, 4, 4);
  });
  gen(scene, 'shadow', 64, 32, (g) => {
    g.fillStyle(0x000000, 0.28).fillEllipse(32, 16, 64, 32);
  });
}
