import Phaser from 'phaser';
import { BOATS, type BoatDef } from '../data/boats';
import { generateItemIcons } from './itemIcons';
import { drawPeniche, drawPenicheAccent } from './peniche';

type G = Phaser.GameObjects.Graphics;

/** Boat textures are drawn at this multiple of their game size, for sharper sprites. */
const BOAT_TEX_SCALE = 2;

/** Boats are drawn pointing right (+x), in near-white so the racer tint colours them. */
function drawBoat(g: G, def: BoatDef): void {
  const L = def.size.length;
  const W = def.size.width;
  const WHITE = 0xffffff;
  const LIGHT = 0xe8e8e8;
  const MID = 0xb0b0b0;
  const DARK = 0x555555;
  const BLACK = 0x222222;
  g.lineStyle(2, 0x000000, 0.35);
  switch (def.shape) {
    case 'peniche':
      drawPeniche(g, def);
      break;
    case 'barge':
      g.fillStyle(WHITE).fillRoundedRect(0, 0, L, W, 8).strokeRoundedRect(0, 0, L, W, 8);
      g.fillStyle(BLACK).fillRoundedRect(L * 0.12, W * 0.16, L * 0.52, W * 0.68, 6);
      g.fillStyle(0x444444).fillCircle(L * 0.3, W * 0.4, 5).fillCircle(L * 0.45, W * 0.6, 6);
      g.fillStyle(LIGHT).fillRect(L * 0.72, W * 0.18, L * 0.2, W * 0.64).strokeRect(L * 0.72, W * 0.18, L * 0.2, W * 0.64);
      g.fillStyle(DARK).fillRect(L * 0.76, W * 0.3, L * 0.06, W * 0.4);
      break;
    case 'tug':
      g.fillStyle(WHITE).fillRoundedRect(0, 0, L, W, W * 0.45).strokeRoundedRect(0, 0, L, W, W * 0.45);
      g.fillStyle(LIGHT).fillRoundedRect(L * 0.18, W * 0.2, L * 0.45, W * 0.6, 6);
      g.fillStyle(DARK).fillCircle(L * 0.34, W * 0.5, W * 0.14);
      g.fillStyle(MID).fillRect(L * 0.72, W * 0.35, L * 0.16, W * 0.3);
      break;
    case 'narrow':
      g.fillStyle(WHITE).fillRoundedRect(0, 0, L, W, 7).strokeRoundedRect(0, 0, L, W, 7);
      g.fillStyle(LIGHT).fillRoundedRect(L * 0.18, W * 0.18, L * 0.5, W * 0.64, 4);
      g.fillStyle(0xff7aa8).fillCircle(L * 0.26, W * 0.5, 3).fillCircle(L * 0.4, W * 0.5, 3).fillCircle(L * 0.54, W * 0.5, 3);
      g.fillStyle(0x66cc66).fillCircle(L * 0.33, W * 0.5, 2.5).fillCircle(L * 0.47, W * 0.5, 2.5);
      break;
    case 'speedboat': {
      const pts = [new Phaser.Math.Vector2(0, 0), new Phaser.Math.Vector2(L * 0.62, 0), new Phaser.Math.Vector2(L, W / 2), new Phaser.Math.Vector2(L * 0.62, W), new Phaser.Math.Vector2(0, W)];
      g.fillStyle(WHITE).fillPoints(pts, true).strokePoints(pts, true);
      g.fillStyle(DARK).fillRoundedRect(L * 0.42, W * 0.22, L * 0.2, W * 0.56, 4);
      g.fillStyle(MID).fillRect(L * 0.1, W * 0.4, L * 0.28, W * 0.2);
      g.fillStyle(MID).fillRect(0, W * 0.1, L * 0.08, W * 0.8);
      break;
    }
    case 'pontoon':
      g.fillStyle(MID).fillRoundedRect(0, 0, L, W * 0.32, 8).fillRoundedRect(0, W * 0.68, L, W * 0.32, 8);
      g.fillStyle(WHITE).fillRoundedRect(L * 0.04, W * 0.12, L * 0.92, W * 0.76, 6).strokeRoundedRect(L * 0.04, W * 0.12, L * 0.92, W * 0.76, 6);
      g.fillStyle(0xaa6644).fillCircle(L * 0.3, W * 0.5, W * 0.2);
      g.fillStyle(0xffffff).fillCircle(L * 0.62, W * 0.5, 6).lineStyle(1, 0x000000, 0.4).strokeCircle(L * 0.62, W * 0.5, 6);
      break;
    case 'fireboat':
      g.fillStyle(WHITE).fillRoundedRect(0, 0, L, W, 10).strokeRoundedRect(0, 0, L, W, 10);
      g.fillStyle(LIGHT).fillRect(L * 0.12, W * 0.2, L * 0.34, W * 0.6);
      g.fillStyle(DARK).fillRect(L * 0.52, W * 0.42, L * 0.34, W * 0.16);
      g.fillStyle(MID).fillCircle(L * 0.52, W * 0.5, W * 0.16);
      g.fillStyle(DARK).fillRect(L * 0.92, W * 0.2, 4, W * 0.6);
      break;
    case 'hovercraft':
      g.fillStyle(WHITE).fillEllipse(L * 0.5, W * 0.5, L, W).lineStyle(2, 0x000000, 0.35).strokeEllipse(L * 0.5, W * 0.5, L, W);
      g.fillStyle(LIGHT).fillEllipse(L * 0.42, W * 0.5, L * 0.5, W * 0.55);
      g.fillStyle(DARK).fillCircle(L * 0.12, W * 0.5, W * 0.26);
      g.lineStyle(3, 0x888888).lineBetween(L * 0.12, W * 0.24, L * 0.12, W * 0.76);
      break;
  }
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
    const w = b.size.length * S, h = b.size.width * S;
    gen(scene, `boat_${b.id}`, w, h, (g) => (g.scaleCanvas(S, S), drawBoat(g, b)));
    if (b.accent) gen(scene, `boat_${b.id}_accent`, w, h, (g) => (g.scaleCanvas(S, S), drawPenicheAccent(g, b)));
  }

  gen(scene, 'crate', 44, 44, (g) => {
    g.fillStyle(0x9a6a3a).fillRoundedRect(2, 2, 40, 40, 5);
    g.lineStyle(3, 0x5b3b1c).strokeRoundedRect(2, 2, 40, 40, 5);
    g.lineStyle(3, 0x5b3b1c).lineBetween(2, 2, 42, 42).lineBetween(42, 2, 2, 42);
    g.fillStyle(0xffe08a).fillCircle(22, 22, 10);
    g.fillStyle(0x5b3b1c).fillCircle(22, 22, 3);
  });
  gen(scene, 'volunteer', 28, 28, (g) => {
    g.fillStyle(0xff8a1f).fillCircle(14, 14, 12);
    g.lineStyle(2, 0x7a3d00).strokeCircle(14, 14, 12);
    g.fillStyle(0xffd9b0).fillCircle(14, 14, 6);
    g.fillStyle(0x000000).fillCircle(16, 12, 1.2).fillCircle(16, 16, 1.2);
    g.lineStyle(3, 0xffd9b0).lineBetween(6, 6, 2, 1).lineBetween(6, 22, 2, 27);
  });
  gen(scene, 'drill', 54, 22, (g) => {
    g.fillStyle(0xdd3333).fillRoundedRect(0, 3, 22, 16, 4);
    g.fillStyle(0xc8c8c8).fillRect(22, 7, 8, 8);
    const pts = [new Phaser.Math.Vector2(30, 3), new Phaser.Math.Vector2(54, 11), new Phaser.Math.Vector2(30, 19)];
    g.fillStyle(0xdddddd).fillPoints(pts, true);
    g.lineStyle(2, 0x777777).lineBetween(34, 5, 38, 17).lineBetween(40, 6, 44, 15).lineBetween(46, 8, 49, 13);
  });
  gen(scene, 'glue', 128, 128, (g) => {
    g.fillStyle(0xf2e27a, 0.85).fillCircle(64, 64, 60);
    g.fillStyle(0xfff3a8, 0.9).fillCircle(54, 52, 38).fillCircle(78, 72, 26);
    g.lineStyle(3, 0xc9b44a, 0.9).strokeCircle(64, 64, 60);
    g.fillStyle(0xffffff, 0.7).fillCircle(40, 40, 6).fillCircle(86, 50, 4).fillCircle(70, 88, 5);
  });
  gen(scene, 'blob', 30, 30, (g) => {
    g.fillStyle(0xf2e27a).fillCircle(15, 15, 13);
    g.lineStyle(3, 0xc9b44a).strokeCircle(15, 15, 13);
    g.fillStyle(0xfff6b8).fillCircle(11, 11, 5);
    g.fillStyle(0xffffff, 0.8).fillCircle(9, 9, 2);
  });
  gen(scene, 'wake', 24, 24, (g) => {
    g.fillStyle(0xffffff, 1).fillCircle(12, 12, 10);
  });
  gen(scene, 'spark', 8, 8, (g) => {
    g.fillStyle(0xfff2a0, 1).fillCircle(4, 4, 4);
  });
  gen(scene, 'saw', 56, 40, (g) => {
    // A jigsaw blade: long steel strip with teeth along the front edge.
    g.fillStyle(0xd7dde2).fillRect(0, 14, 40, 12);
    g.fillStyle(0xaab2b8);
    for (let i = 0; i < 8; i++) g.fillTriangle(8 + i * 6, 14, 14 + i * 6, 14, 11 + i * 6, 8);
    for (let i = 0; i < 8; i++) g.fillTriangle(8 + i * 6, 26, 14 + i * 6, 26, 11 + i * 6, 32);
    g.fillStyle(0xe8a317).fillRoundedRect(0, 8, 14, 24, 4);
    g.lineStyle(2, 0x555555).strokeRect(14, 14, 40, 12);
  });
  gen(scene, 'water', 128, 128, (g) => {
    g.fillStyle(0xffffff, 0.0).fillRect(0, 0, 128, 128);
    g.lineStyle(3, 0xffffff, 0.22);
    const waves: [number, number][] = [[10, 20], [70, 12], [30, 60], [96, 70], [8, 100], [64, 112]];
    for (const [x, y] of waves) {
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + 8, y - 4);
      g.lineTo(x + 16, y);
      g.lineTo(x + 24, y - 4);
      g.lineTo(x + 32, y);
      g.strokePath();
    }
  });
  gen(scene, 'deco_tree', 64, 64, (g) => {
    g.fillStyle(0x000000, 0.25).fillCircle(34, 36, 26);
    g.fillStyle(0xffffff).fillCircle(32, 32, 26);
    g.fillStyle(0xcfcfcf).fillCircle(24, 24, 14).fillCircle(40, 38, 12);
  });
  gen(scene, 'deco_block', 96, 96, (g) => {
    g.fillStyle(0x000000, 0.25).fillRect(6, 6, 90, 90);
    g.fillStyle(0xffffff).fillRect(0, 0, 90, 90);
    g.fillStyle(0xcccccc).fillRect(8, 8, 74, 74);
    g.lineStyle(2, 0x888888).strokeRect(8, 8, 74, 74).lineBetween(45, 8, 45, 82);
  });
  gen(scene, 'shadow', 64, 32, (g) => {
    g.fillStyle(0x000000, 0.28).fillEllipse(32, 16, 64, 32);
  });
}
