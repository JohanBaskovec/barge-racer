import Phaser from 'phaser';
import type { BoatDef } from '../data/boats';

type G = Phaser.GameObjects.Graphics;
type Pt = { x: number; y: number };

/**
 * Cabourg: a real péniche moored on the canal, redrawn from an aerial photo, seen from
 * above with the bow to the right (the photo's left side is the top edge here).
 *
 * From bow to stern: a blunt rounded bow with a blue tarp over the side, a long lavender-grey roof
 * over the first hold (vents, a red parasol at its end), a lawn with a pergola, a second, bluer roof
 * with a glazed band and plants, the white wheelhouse roof (off-centre, towards the top edge), the
 * wooden stern deck with blue-grey furniture, and a shield-shaped stern. Dark navy hull with a pale
 * gunwale and walkways along both sides.
 *
 * Drawn in design units (the boat's game size); the caller scales the canvas for a sharp texture.
 */

/** Hull half-width (0..1 of W/2) at t, where t = 0 at the bow and 1 at the stern. */
function hullProfile(t: number): number {
  const BOW = 0.05;
  const STERN = 0.91;
  if (t < BOW) {
    const u = (BOW - t) / BOW; // 1 at the tip: a half ellipse, wider than it is long (spoon bow)
    return Math.sqrt(Math.max(0, 1 - u * u));
  }
  if (t > STERN) {
    const u = (t - STERN) / (1 - STERN); // tapers to a blunt point, like a shield
    return Math.pow(Math.max(0, 1 - Math.pow(u, 1.8)), 0.6);
  }
  return 1;
}

/** Outline of the hull, inset by `inset` design units, as a closed polygon. */
function hullOutline(L: number, W: number, inset: number): Pt[] {
  const ts: number[] = [];
  for (let t = 0; t <= 1.0001; t += t < 0.06 || t > 0.9 ? 0.0025 : 0.02) ts.push(Math.min(1, t));
  const x = (t: number): number => L * (1 - t);
  const half = (t: number): number => Math.max(0, hullProfile(t) * (W / 2) - inset);
  const top = ts.map((t) => ({ x: x(t), y: W / 2 - half(t) }));
  const bottom = [...ts].reverse().map((t) => ({ x: x(t), y: W / 2 + half(t) }));
  return [...top, ...bottom];
}

export function drawPeniche(g: G, def: BoatDef): void {
  const L = def.size.length;
  const W = def.size.width;
  const X = (t: number): number => L * (1 - t); // t = 0 at the bow, 1 at the stern
  const Y = (f: number): number => W * f; // f = 0 at the top edge, 1 at the bottom edge
  /** A rectangle between two positions along the boat (t0 nearer the bow) and two across it. */
  const box = (t0: number, t1: number, f0: number, f1: number): [number, number, number, number] => [X(t1), Y(f0), X(t0) - X(t1), Y(f1) - Y(f0)];
  const fill = (color: number, t0: number, t1: number, f0: number, f1: number, alpha = 1): void => {
    g.fillStyle(color, alpha).fillRect(...box(t0, t1, f0, f1));
  };
  const dot = (color: number, t: number, f: number, r: number): void => {
    g.fillStyle(color, 1).fillCircle(X(t), Y(f), r);
  };

  const HULL = 0x1d2433;
  const WALKWAY = 0x2c3446;
  const GUNWALE = 0xa3acbb;

  // --- Hull: dark navy, a pale gunwale line, then the walkway deck inside it
  const outer = hullOutline(L, W, 0);
  g.fillStyle(HULL, 1).fillPoints(outer as Phaser.Math.Vector2[], true);
  g.lineStyle(0.9, GUNWALE, 0.9).strokePoints(outer as Phaser.Math.Vector2[], true, true);
  g.fillStyle(WALKWAY, 1).fillPoints(hullOutline(L, W, 1.7) as Phaser.Math.Vector2[], true);

  // --- Bow deck: hatch, winch, a white chest, and a blue tarp hanging over the side
  fill(0x3a4356, 0.03, 0.068, 0.3, 0.56);
  g.lineStyle(0.5, 0x161b26, 1).strokeRect(...box(0.03, 0.068, 0.3, 0.56));
  dot(0x8d95a3, 0.022, 0.5, 1.2);
  fill(0xe6e9ee, 0.03, 0.055, 0.6, 0.78);
  g.fillStyle(0x2f6fd8, 1).fillPoints([
    { x: X(0.075), y: Y(0.84) }, { x: X(0.018), y: Y(0.8) }, { x: X(0.012), y: Y(0.9) }, { x: X(0.04), y: W - 0.3 }, { x: X(0.075), y: W - 0.3 },
  ] as Phaser.Math.Vector2[], true);
  g.lineStyle(0.4, 0x5d93e8, 1).lineBetween(X(0.06), Y(0.86), X(0.03), Y(0.93));

  // --- A long corrugated roof over a hold
  const roof = (t0: number, t1: number, base: number, shade: number, seam: number): void => {
    fill(base, t0, t1, 0.2, 0.86);
    fill(shade, t0, t1, 0.2, 0.28); // the side facing the top edge is a little darker
    g.lineStyle(0.35, seam, 0.8);
    for (let x = X(t1) + 2.6; x < X(t0) - 1; x += 2.6) g.lineBetween(x, Y(0.21), x, Y(0.85));
    g.lineStyle(0.6, 0x55536e, 1).strokeRect(...box(t0, t1, 0.2, 0.86));
  };

  // First roof, with a row of vents near its aft end and a red parasol just behind it
  roof(0.075, 0.385, 0x8f8dac, 0x7d7b99, 0x83819f);
  for (let k = 0; k < 4; k++) fill(0xcfd0dd, 0.305 + k * 0.009, 0.311 + k * 0.009, 0.68, 0.76);
  dot(0x6d8f55, 0.345, 0.74, 1); // a pot on the roof
  dot(0x8a6a4a, 0.365, 0.78, 0.7);
  dot(0x8a6a4a, 0.372, 0.7, 0.6);

  // --- The garden: a lawn with a pergola on a wooden floor, pots, chairs and a table
  fill(0x6e9b50, 0.385, 0.522, 0.13, 0.88);
  dot(0x84ae62, 0.405, 0.3, 2.2);
  dot(0x84ae62, 0.5, 0.72, 2.4);
  dot(0x5d8a45, 0.43, 0.18, 1.8);
  dot(0x84ae62, 0.47, 0.25, 1.5);
  fill(0xc48c4c, 0.462, 0.5, 0.38, 0.62); // wooden floor
  fill(0x2b2f38, 0.44, 0.488, 0.3, 0.55); // pergola roof
  g.lineStyle(0.4, 0x4a505d, 1).lineBetween(X(0.464), Y(0.31), X(0.464), Y(0.54));
  dot(0xd8506a, 0.392, 0.52, 2.6); // red parasol at the end of the first roof
  g.lineStyle(0.35, 0xf3a0b2, 1);
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 4;
    g.lineBetween(X(0.392) - Math.cos(a) * 2.4, Y(0.52) - Math.sin(a) * 2.4, X(0.392) + Math.cos(a) * 2.4, Y(0.52) + Math.sin(a) * 2.4);
  }
  for (const t of [0.41, 0.425, 0.44]) dot(0x34502c, t, 0.84, 0.9); // pots along the side
  dot(0xf2f2f2, 0.475, 0.79, 0.8); // white chairs and table
  dot(0xf2f2f2, 0.495, 0.8, 0.8);
  dot(0xf2f2f2, 0.508, 0.64, 1);

  // --- Second roof: bluer, with a glazed band at the front and two darker joints
  roof(0.522, 0.772, 0x898ca9, 0x787b98, 0x7f829f);
  fill(0xb3b7cc, 0.524, 0.55, 0.21, 0.85);
  g.lineStyle(0.7, 0x55576f, 1).lineBetween(X(0.605), Y(0.21), X(0.605), Y(0.85)).lineBetween(X(0.69), Y(0.21), X(0.69), Y(0.85));
  fill(0x3c3f4c, 0.565, 0.572, 0.5, 0.58); // a small vent
  // plants and pots crowding the aft end of the roof
  dot(0x5f8f45, 0.752, 0.32, 1.5);
  dot(0x6f9f52, 0.765, 0.46, 1.3);
  dot(0xe6e1d6, 0.758, 0.62, 1);
  dot(0xd9cbb0, 0.768, 0.74, 0.9);

  // --- Wheelhouse: a white roof, off-centre towards the top edge
  g.fillStyle(0xf0f2f4, 1).fillRect(...box(0.795, 0.877, 0.17, 0.69));
  fill(0xc8ced6, 0.795, 0.877, 0.63, 0.69); // shadowed edge
  g.lineStyle(0.6, 0xa9b0bb, 1).strokeRect(...box(0.795, 0.877, 0.17, 0.69));
  fill(0xd4d9df, 0.81, 0.83, 0.26, 0.36);
  fill(0xd4d9df, 0.845, 0.86, 0.44, 0.54);

  // --- Stern deck: wooden planks, blue-grey furniture, a light blue cover
  fill(0xb8875a, 0.88, 0.965, 0.16, 0.58);
  g.lineStyle(0.3, 0x8a6240, 1);
  for (const f of [0.26, 0.36, 0.46]) g.lineBetween(X(0.965), Y(f), X(0.88), Y(f));
  fill(0x7f98b6, 0.885, 0.925, 0.6, 0.82);
  fill(0x6a819e, 0.9, 0.915, 0.62, 0.8);
  fill(0xa6cde3, 0.93, 0.955, 0.6, 0.76);
  dot(0xeeeeee, 0.94, 0.3, 0.8);
  dot(0xeeeeee, 0.905, 0.4, 0.6);
}

/** The layer that takes the racer's colour: a stripe along each gunwale and a flag at the stern. */
export function drawPenicheAccent(g: G, def: BoatDef): void {
  const L = def.size.length;
  const W = def.size.width;
  const X = (t: number): number => L * (1 - t);
  g.fillStyle(0xffffff, 1);
  g.fillRect(X(0.9), 0.35, X(0.06) - X(0.9), 0.9);
  g.fillRect(X(0.9), W - 1.25, X(0.06) - X(0.9), 0.9);
  // stern flag: a short pole and a pennant streaming aft
  g.fillRect(X(0.968) - 0.3, W / 2 - 2.6, 0.6, 2.6);
  g.fillTriangle(X(0.968), W / 2 - 2.6, X(0.968), W / 2 - 0.4, X(0.995), W / 2 - 1.5);
}
