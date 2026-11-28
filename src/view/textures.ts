import Phaser from 'phaser';
import { BOATS, type BoatDef } from '../data/boats';
import { generateItemIcons } from './itemIcons';
import { BOAT_ART_PAD, drawBoatArt, hasBoatArt } from './boatArt';
import { drawPeniche, drawPenicheAccent } from './peniche';
import { drawBarge } from './bargeArt';
import { CAR, CAR_COLORS, SHIRTS, STREET_ART_SCALE, drawAngler, drawCar, drawCyclist, drawDog, drawWalker } from './streetArt';
import { TUNING } from '../data/items';
import { drawRocket, drawDrillBit, drawBloodSplat, drawBullet, drawDuck, drawFeather, drawGib, drawNozzle, drawPolice, drawRowboat, drawSwimmer, drawBoobs, drawCheesePuddle, drawCheeseScreen, drawCrate, drawGoldCrate, drawDildo, drawGlueBlob, drawGluePuddle, drawHam, drawNail, drawPotato, drawSaw, drawToxicSmoke, drawVolunteer, drawWaterTile, PAINT_COLORS, drawPaintPuddle, drawPaintScreen, drawCouch, drawSteamPuff, drawSteamHole, drawCircularSaw, drawCorsicaFlag, drawBretonFlag, drawFlagOnPole } from './worldArt';

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
  world('crateGold', 44, 44, drawGoldCrate);
  world('volunteer', 28, 28, drawVolunteer);
  world('glue', 128, 128, drawGluePuddle, 1); // big and soft: its game size is enough
  world('blob', 30, 30, drawGlueBlob);
  world('saw', 56, 40, drawSaw);
  world('potato', 28, 24, drawPotato);
  world('ham', 32, 24, drawHam);
  world('boobs', 72, 136, drawBoobs);
  world('dildo', 82, 24, drawDildo);
  world('nail', 24, 8, drawNail, 4);
  for (let k = 0; k < 2; k++) world(`drillBit_${k}`, 72, 16, (c) => drawDrillBit(c, k), 3);
  // Hazards (hazards.ts) and the vacuum cleaner
  world('police', 96, 34, drawPolice, 2.5);
  world('bullet', 16, 4, drawBullet, 4);
  world('rocket', 30, 10, drawRocket, 3);
  for (let k = 0; k < 2; k++) world(`duck_${k}`, 18, 12, (c) => drawDuck(c, k), 4);
  for (let k = 0; k < 2; k++) world(`rowboat_${k}`, 96, 64, (c) => drawRowboat(c, k), 3);
  ['#f2c12e', '#d23b2f', '#2f6fd8', '#f2f2f2'].forEach((cap, i) => {
    for (let k = 0; k < 2; k++) world(`swimmer_${i}_${k}`, 26, 26, (c) => drawSwimmer(c, k, cap), 4);
  });
  world('bloodSplat', 96, 96, drawBloodSplat, 1.5);
  world('gib', 10, 8, drawGib, 3);
  world('feather', 12, 4, drawFeather, 3);
  world('nozzle', 46, 26, drawNozzle, 3);
  world('cheese', 160, 160, drawCheesePuddle, 1);
  world('smoke', 220, 220, drawToxicSmoke, 1);
  world('cheeseScreen', 1280, 900, drawCheeseScreen, 1);
  // The painting workshop, the lazy volunteers' couch and the sauna's steam
  PAINT_COLORS.forEach((col, i) => world(`paint_${i}`, 120, 120, (c) => drawPaintPuddle(c, col, i), 1));
  world('paintScreen', 1280, 720, drawPaintScreen, 1);
  for (let k = 0; k < 2; k++) world(`couch_${k}`, 100, 60, (c) => drawCouch(c, k), 2.5);
  world('steamPuff', 128, 128, drawSteamPuff, 1);
  world('steamHole', 256, 256, drawSteamHole, 1);
  world('circSaw', 40, 40, drawCircularSaw, 3);
  // Capture the flag: the flags of Corsica and Brittany, on a pole (in the race) and flat (menus, HUD).
  for (const team of [0, 1]) world(`flagPole_${team}`, 64, 72, (c) => drawFlagOnPole(c, team), 3);
  world('flatFlag_0', 96, 64, (c) => drawCorsicaFlag(c, 96, 64), 3);
  world('flatFlag_1', 96, 64, (c) => drawBretonFlag(c, 96, 64), 3);
  // Traffic barges, with a little margin round the hull
  const T = TUNING.traffic;
  for (let k = 0; k < 3; k++) world(`barge_${k}`, T.length + 4, T.width + 4, (c) => (c.translate(2, 2), drawBarge(c, k, T.length, T.width)), 2.5);
  world('water', 256, 256, drawWaterTile, 1);
  // Street life (streetLife.ts): small and seen close up, so drawn at STREET_ART_SCALE.
  CAR_COLORS.forEach((col, i) => {
    for (let k = 0; k < 3; k++) world(`car_${k * CAR_COLORS.length + i}`, CAR.length + 4, CAR.width + 4, (c) => drawCar(c, col, k), STREET_ART_SCALE);
  });
  SHIRTS.forEach((col, i) => world(`walker_${i}`, 10, 10, (c) => drawWalker(c, col, i), STREET_ART_SCALE));
  for (let i = 0; i < 4; i++) world(`cyclist_${i}`, 22, 10, (c) => drawCyclist(c, SHIRTS[(i * 3 + 1) % SHIRTS.length]), STREET_ART_SCALE);
  for (let i = 0; i < 3; i++) world(`angler_${i}`, 40, 14, (c) => drawAngler(c, SHIRTS[(i * 4 + 6) % SHIRTS.length]), STREET_ART_SCALE);
  world('dog', 10, 6, drawDog, STREET_ART_SCALE);
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
