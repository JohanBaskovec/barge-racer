import Phaser from 'phaser';

/**
 * HUD icons for the items, drawn in code with the Canvas 2D API in a 96 x 96 box and rendered at
 * three times that, so they stay sharp on a phone. One style for all: a dark outline, light from
 * the top left (gradients, a highlight), and a soft shadow under the whole icon so it stands out
 * on the item buttons.
 */

type C = CanvasRenderingContext2D;
type Fill = string | CanvasGradient;

/** Texture pixels per design unit. */
const SCALE = 3;
const OUT = '#17212e';
const LW = 2.6;

// ---- Small toolkit ---------------------------------------------------------------------

/** A linear gradient with evenly spaced colours. */
function lg(c: C, x0: number, y0: number, x1: number, y1: number, ...cols: string[]): CanvasGradient {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  cols.forEach((col, i) => g.addColorStop(cols.length === 1 ? 0 : i / (cols.length - 1), col));
  return g;
}

/** A radial gradient from a centre outwards. */
function rg(c: C, x: number, y: number, r: number, ...cols: string[]): CanvasGradient {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  cols.forEach((col, i) => g.addColorStop(cols.length === 1 ? 0 : i / (cols.length - 1), col));
  return g;
}

/** Fill and outline the current path. */
function paint(c: C, fill: Fill | null, lw = LW, stroke = OUT): void {
  if (fill) {
    c.fillStyle = fill;
    c.fill();
  }
  if (lw > 0) {
    c.lineWidth = lw;
    c.strokeStyle = stroke;
    c.stroke();
  }
}

function rr(c: C, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  c.moveTo(x + k, y);
  c.arcTo(x + w, y, x + w, y + h, k);
  c.arcTo(x + w, y + h, x, y + h, k);
  c.arcTo(x, y + h, x, y, k);
  c.arcTo(x, y, x + w, y, k);
  c.closePath();
}

function el(c: C, x: number, y: number, rx: number, ry = rx, rot = 0): void {
  c.beginPath();
  c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
}

/** A polygon (or an open polyline) through flat x, y pairs. */
function pl(c: C, pts: number[], close = true): void {
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i + 1 < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  if (close) c.closePath();
}

/** A thick line with its own outline: cables, hoses, arms. */
function tube(c: C, build: () => void, width: number, color: Fill, outline = LW): void {
  c.save();
  c.lineCap = 'round';
  build();
  c.lineWidth = width + outline * 2;
  c.strokeStyle = OUT;
  c.stroke();
  build();
  c.lineWidth = width;
  c.strokeStyle = color;
  c.stroke();
  c.restore();
}

/** Several shapes as one: outlined round their union, then all filled. */
function union(c: C, shapes: (() => void)[], fill: Fill, lw = LW, stroke = OUT): void {
  for (const s of shapes) {
    s();
    c.lineWidth = lw * 2;
    c.strokeStyle = stroke;
    c.stroke();
  }
  for (const s of shapes) {
    s();
    c.fillStyle = fill;
    c.fill();
  }
}

/** A soft white highlight on the current path. */
function shine(c: C, alpha = 0.4): void {
  c.fillStyle = `rgba(255,255,255,${alpha})`;
  c.fill();
}

/** A four-pointed sparkle. */
function spark(c: C, x: number, y: number, s: number, color = '#fff3b0'): void {
  c.beginPath();
  c.moveTo(x, y - s * 1.5);
  c.quadraticCurveTo(x + s * 0.22, y - s * 0.22, x + s, y);
  c.quadraticCurveTo(x + s * 0.22, y + s * 0.22, x, y + s * 1.5);
  c.quadraticCurveTo(x - s * 0.22, y + s * 0.22, x - s, y);
  c.quadraticCurveTo(x - s * 0.22, y - s * 0.22, x, y - s * 1.5);
  c.closePath();
  paint(c, color, 1.4, 'rgba(90,60,0,0.75)');
}

/** A straight line. */
function line(c: C, x0: number, y0: number, x1: number, y1: number, w: number, color: string): void {
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x1, y1);
  c.lineWidth = w;
  c.strokeStyle = color;
  c.stroke();
}

const STEEL = (c: C, x0: number, y0: number, x1: number, y1: number): CanvasGradient => lg(c, x0, y0, x1, y1, '#f6f8fa', '#b3bbc4', '#6f7882');
const DARK = (c: C, x0: number, y0: number, x1: number, y1: number): CanvasGradient => lg(c, x0, y0, x1, y1, '#59616c', '#2c323b', '#1a1f26');

/** A wooden crate front: planks, a frame, steel corners. */
function crateFront(c: C, x: number, y: number, s: number): void {
  rr(c, x, y, s, s, 7);
  paint(c, lg(c, x, y, x + s, y + s, '#d59a55', '#a86d32'));
  c.save();
  rr(c, x, y, s, s, 7);
  c.clip();
  c.strokeStyle = 'rgba(70,40,12,0.5)';
  c.lineWidth = 1.2;
  for (let k = 1; k < 5; k++) {
    c.beginPath();
    c.moveTo(x, y + (s * k) / 5);
    c.lineTo(x + s, y + (s * k) / 5);
    c.stroke();
  }
  // diagonal braces
  c.strokeStyle = '#7a4a1e';
  c.lineWidth = 6;
  c.beginPath();
  c.moveTo(x + 4, y + 4);
  c.lineTo(x + s - 4, y + s - 4);
  c.moveTo(x + s - 4, y + 4);
  c.lineTo(x + 4, y + s - 4);
  c.stroke();
  c.restore();
  // frame
  rr(c, x + 3.5, y + 3.5, s - 7, s - 7, 4);
  paint(c, null, 3, '#8a5524');
  // steel corners
  for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + s, y, -1, 1], [x, y + s, 1, -1], [x + s, y + s, -1, -1]]) {
    pl(c, [cx + sx * 2, cy + sy * 2, cx + sx * 15, cy + sy * 2, cx + sx * 2, cy + sy * 15]);
    paint(c, STEEL(c, cx, cy, cx + sx * 14, cy + sy * 14), 1.4);
    el(c, cx + sx * 6, cy + sy * 6, 1.4);
    paint(c, '#3b434d', 0);
  }
  rr(c, x, y, s, s, 7);
  paint(c, null);
}

// ---- The icons ---------------------------------------------------------------------------

const ICONS: Record<string, (c: C) => void> = {
  // A cheerful volunteer in an orange vest and a hard hat, waving both arms.
  icon_volunteer: (c) => {
    // arms up
    for (const [x0, x1] of [[33, 17], [63, 79]]) {
      tube(c, () => { c.beginPath(); c.moveTo(x0, 52); c.lineTo(x1, 27); }, 6.5, '#f3c59c');
      el(c, x1, 25, 6);
      paint(c, rg(c, x1 - 2, 23, 7, '#ffe0c2', '#eab48a'));
    }
    // legs and boots
    for (const x of [36, 50]) {
      rr(c, x, 66, 10.5, 22, 4);
      paint(c, lg(c, x, 66, x + 10, 66, '#4f86c6', '#2f5d94'));
      rr(c, x - 1.5, 84, 13.5, 7.5, 3.5);
      paint(c, '#2b2f38', 2);
    }
    // vest with reflective stripes
    rr(c, 29.5, 42, 37, 31, 10);
    paint(c, lg(c, 30, 42, 66, 73, '#ffad45', '#f07a12'));
    c.save();
    rr(c, 29.5, 42, 37, 31, 10);
    c.clip();
    c.fillStyle = '#f6f8fa';
    c.fillRect(36.5, 42, 5.5, 31);
    c.fillRect(54, 42, 5.5, 31);
    c.fillStyle = '#ffe14a';
    c.fillRect(29, 60, 38, 4.5);
    c.restore();
    rr(c, 29.5, 42, 37, 31, 10);
    paint(c, null);
    // head
    el(c, 48, 29, 14.5);
    paint(c, rg(c, 44, 25, 17, '#ffe2c6', '#f0bd92'));
    el(c, 40, 33, 3, 2);
    c.fillStyle = 'rgba(240,110,110,0.45)';
    c.fill();
    el(c, 56, 33, 3, 2);
    c.fill();
    el(c, 43, 29, 2);
    paint(c, OUT, 0);
    el(c, 53, 29, 2);
    paint(c, OUT, 0);
    c.beginPath();
    c.arc(48, 31.5, 6, 0.2 * Math.PI, 0.8 * Math.PI);
    paint(c, null, 2.2);
    // hard hat
    c.beginPath();
    c.arc(48, 24, 15.5, Math.PI, Math.PI * 2);
    c.closePath();
    paint(c, lg(c, 34, 8, 60, 24, '#fff09a', '#ffd21f', '#e0a000'));
    rr(c, 29, 21.5, 38, 5.5, 2.7);
    paint(c, lg(c, 29, 21, 29, 27, '#ffe45c', '#e0a000'));
    rr(c, 45.5, 9, 5, 12, 2);
    shine(c, 0.45);
  },

  // A jigsaw: a yellow body with a black handle, and a long toothed blade.
  icon_jigsaw: (c) => {
    // blade, teeth on the left edge
    c.beginPath();
    c.moveTo(58, 50);
    c.lineTo(58, 86);
    c.lineTo(52, 93);
    c.lineTo(46, 88);
    for (let y = 88; y > 56; y -= 6) {
      c.lineTo(40.5, y - 3);
      c.lineTo(46, y - 6);
    }
    c.lineTo(46, 50);
    c.closePath();
    paint(c, STEEL(c, 40, 50, 60, 50));
    line(c, 54.5, 56, 54.5, 84, 1.4, 'rgba(255,255,255,0.7)');
    // shoe
    rr(c, 28, 49, 46, 6.5, 2.5);
    paint(c, DARK(c, 28, 49, 28, 56));
    // handle (a loop on top)
    rr(c, 28, 3, 42, 19, 9);
    paint(c, DARK(c, 28, 3, 28, 22));
    c.save();
    c.globalCompositeOperation = 'destination-out';
    rr(c, 37, 8.5, 24, 7, 3.5);
    c.fill();
    c.restore();
    rr(c, 37, 8.5, 24, 7, 3.5);
    paint(c, null, 2);
    // body
    rr(c, 16, 16, 62, 35, 11);
    paint(c, lg(c, 16, 16, 16, 51, '#ffe066', '#f5ae0e', '#c47700'));
    rr(c, 21, 19.5, 42, 5, 2.5);
    shine(c, 0.45);
    rr(c, 38, 28, 30, 12, 4);
    paint(c, DARK(c, 38, 28, 38, 40), 1.8);
    for (let x = 43; x < 66; x += 5) line(c, x, 31, x, 37, 1.4, 'rgba(255,255,255,0.35)');
    rr(c, 22, 27, 10, 15, 3.5);
    paint(c, lg(c, 22, 27, 32, 42, '#ff7b66', '#c9302a'), 1.8);
  },

  // Flour: a paper sack with a wheat ear on it, in a puff of flour.
  icon_powder: (c) => {
    // puffs of flour
    for (const [x, y, r] of [[13, 84, 9], [24, 89, 6], [83, 83, 9], [73, 89, 6], [6, 72, 4], [91, 70, 4]]) {
      el(c, x, y, r, r * 0.8);
      paint(c, 'rgba(255,255,255,0.92)', 1.2, 'rgba(120,130,150,0.6)');
    }
    // sack
    c.beginPath();
    c.moveTo(27, 32);
    c.lineTo(69, 32);
    c.quadraticCurveTo(80, 58, 78, 82);
    c.quadraticCurveTo(78, 90, 70, 90);
    c.lineTo(26, 90);
    c.quadraticCurveTo(18, 90, 18, 82);
    c.quadraticCurveTo(16, 58, 27, 32);
    c.closePath();
    paint(c, lg(c, 18, 32, 78, 90, '#fffaf0', '#f1e4c6', '#d3bf93'));
    // band and wheat ear
    c.save();
    c.clip();
    c.fillStyle = lg(c, 0, 76, 0, 82, '#4f86c6', '#2f5d94');
    c.fillRect(10, 76, 76, 6);
    c.restore();
    line(c, 48, 74, 48, 48, 2.4, '#b9862a');
    for (let k = 0; k < 4; k++) {
      for (const side of [-1, 1]) {
        el(c, 48 + side * 5.5, 51 + k * 6, 5, 2.7, side * -0.7);
        paint(c, lg(c, 40, 44, 56, 74, '#ffd66b', '#d99a1e'), 1.2, '#8a5d0c');
      }
    }
    el(c, 48, 44, 2.8, 5);
    paint(c, '#ffd66b', 1.2, '#8a5d0c');
    // rolled top and its tie
    rr(c, 24, 21, 48, 13, 5);
    paint(c, lg(c, 24, 21, 24, 34, '#fff6e2', '#d9c79c'));
    line(c, 30, 25.5, 66, 25.5, 1.3, 'rgba(120,95,50,0.5)');
    rr(c, 22, 30, 52, 5.5, 2.7);
    paint(c, lg(c, 22, 30, 22, 36, '#ff6b5e', '#c9302a'), 2);
    spark(c, 84, 22, 6);
    spark(c, 10, 40, 4.5);
  },

  // The electric drill: only its bit, big, twisted and gold-tipped, with sparks.
  icon_drill: (c) => {
    c.save();
    c.translate(46, 50);
    c.rotate(-0.7);
    const body = (): void => {
      c.beginPath();
      c.moveTo(-42, -5.5);
      c.lineTo(-22, -5.5);
      c.lineTo(-19, -10);
      c.lineTo(26, -10);
      c.lineTo(44, 0);
      c.lineTo(26, 10);
      c.lineTo(-19, 10);
      c.lineTo(-22, 5.5);
      c.lineTo(-42, 5.5);
      c.closePath();
    };
    body();
    paint(c, lg(c, 0, -10, 0, 10, '#fbfcfd', '#b3bbc4', '#5f6873'));
    // twisted flutes on the fluted part
    c.save();
    pl(c, [-19, -10, 26, -10, 44, 0, 26, 10, -19, 10]);
    c.clip();
    for (let x = -26; x < 48; x += 11) {
      line(c, x, -11, x + 9, 11, 5, 'rgba(34,40,50,0.8)');
      line(c, x + 4.2, -11, x + 13.2, 11, 1.5, 'rgba(255,255,255,0.75)');
    }
    // gold tip
    pl(c, [26, -10, 44, 0, 26, 10]);
    c.fillStyle = 'rgba(232,180,50,0.75)';
    c.fill();
    c.restore();
    body();
    paint(c, null);
    line(c, -40, -2.5, -24, -2.5, 1.5, 'rgba(255,255,255,0.8)');
    c.restore();
    // sparks at the tip, and a curl to show it spinning
    spark(c, 86, 12, 6.5);
    spark(c, 70, 8, 3.5);
    spark(c, 90, 32, 3.5);
    c.beginPath();
    c.arc(22, 70, 15, 0.9, 2.6);
    paint(c, null, 2.2, 'rgba(255,255,255,0.75)');
    c.beginPath();
    c.arc(22, 70, 21, 1.1, 2.3);
    paint(c, null, 2, 'rgba(255,255,255,0.5)');
  },

  // A crate of beer: brown bottles with gold caps in a wooden crate.
  icon_beer: (c) => {
    for (const x of [28, 48, 68]) {
      rr(c, x - 9, 24, 18, 30, 6);
      paint(c, lg(c, x - 9, 24, x + 9, 24, '#e39a2a', '#a85c06', '#7a3f02'));
      rr(c, x - 4.2, 8, 8.4, 20, 3);
      paint(c, lg(c, x - 4, 8, x + 4, 8, '#e39a2a', '#a85c06'));
      rr(c, x - 6, 3.5, 12, 6.5, 2.2);
      paint(c, lg(c, x - 6, 3, x - 6, 10, '#fff09a', '#e0a000'), 1.8);
      rr(c, x - 6.5, 27, 2.6, 16, 1.3);
      shine(c, 0.55);
    }
    rr(c, 10, 44, 76, 46, 6);
    paint(c, lg(c, 10, 44, 86, 90, '#d59a55', '#a06a30'));
    c.save();
    rr(c, 10, 44, 76, 46, 6);
    c.clip();
    line(c, 10, 59, 86, 59, 1.6, 'rgba(70,40,12,0.55)');
    line(c, 10, 75, 86, 75, 1.6, 'rgba(70,40,12,0.55)');
    c.fillStyle = 'rgba(255,255,255,0.22)';
    c.fillRect(10, 44, 76, 5);
    c.restore();
    rr(c, 34, 62, 28, 9.5, 4.7);
    paint(c, '#4a2b0e', 2);
    for (const [x, y] of [[16, 51], [80, 51], [16, 83], [80, 83]]) {
      el(c, x, y, 1.8);
      paint(c, '#5a3714', 0);
    }
    rr(c, 10, 44, 76, 46, 6);
    paint(c, null);
  },

  // A fake crate: an item crate like any other, with a warning badge.
  icon_fakeCrate: (c) => {
    crateFront(c, 8, 10, 72);
    el(c, 44, 46, 18);
    paint(c, rg(c, 39, 40, 22, '#fff09a', '#ffd21f', '#e0a000'), 2.2);
    c.fillStyle = '#3a2a08';
    c.font = 'bold 27px "Trebuchet MS", Verdana, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('?', 44, 47.5);
    // the badge
    el(c, 74, 74, 16);
    paint(c, rg(c, 69, 68, 20, '#ff8a7a', '#e23b2f', '#a81f18'));
    rr(c, 71, 62.5, 6, 14, 3);
    paint(c, '#ffffff', 0);
    el(c, 74, 82.5, 3.3);
    paint(c, '#ffffff', 0);
  },

  // A silicone gun: a cartridge in its metal frame, squeezing out a bead of glue.
  icon_silicone: (c) => {
    // plunger rod
    line(c, 5, 35, 22, 35, 6.5, OUT);
    line(c, 5, 35, 22, 35, 2.6, '#b3bbc4');
    el(c, 6, 35, 4.5);
    paint(c, STEEL(c, 2, 31, 10, 39), 2);
    // handle and trigger
    pl(c, [24, 46, 39, 46, 35, 84, 20, 84]);
    paint(c, DARK(c, 20, 46, 39, 84));
    pl(c, [42, 49, 52, 49, 46, 72, 40, 70]);
    paint(c, STEEL(c, 40, 49, 52, 72), 2);
    // cartridge
    rr(c, 17, 24, 50, 22, 6);
    paint(c, lg(c, 17, 24, 17, 46, '#ffffff', '#e3e8ed', '#aab3bc'));
    c.save();
    rr(c, 17, 24, 50, 22, 6);
    c.clip();
    c.fillStyle = lg(c, 0, 24, 0, 46, '#5aa2e8', '#2f6fb5');
    c.fillRect(30, 24, 22, 22);
    c.fillStyle = 'rgba(255,255,255,0.5)';
    c.fillRect(17, 27, 50, 3.5);
    c.restore();
    rr(c, 17, 24, 50, 22, 6);
    paint(c, null);
    // frame, front ring and nozzle
    rr(c, 14, 44, 56, 5.5, 2.5);
    paint(c, DARK(c, 14, 44, 14, 50), 2);
    rr(c, 63, 22, 7, 26, 2.5);
    paint(c, lg(c, 63, 22, 63, 48, '#ffb066', '#e8742a'), 2);
    pl(c, [70, 29, 70, 41, 90, 35]);
    paint(c, lg(c, 70, 29, 70, 41, '#fff6e2', '#e3c98a'));
    // the bead of glue
    const bead = (): void => {
      c.beginPath();
      c.moveTo(89, 36);
      c.bezierCurveTo(96, 48, 76, 56, 84, 68);
      c.bezierCurveTo(88, 75, 80, 80, 84, 88);
    };
    tube(c, bead, 5, lg(c, 76, 36, 92, 88, '#fff6a8', '#f2df6a'), 1.8);
  },

  // Magic mushrooms: a purple cap with spots of every colour.
  icon_mushroom: (c) => {
    // stem
    c.beginPath();
    c.moveTo(37, 52);
    c.quadraticCurveTo(33, 82, 39, 89);
    c.lineTo(57, 89);
    c.quadraticCurveTo(63, 82, 59, 52);
    c.closePath();
    paint(c, lg(c, 34, 52, 62, 52, '#fffaf0', '#f1e2bf', '#cfbb8e'));
    // cap
    const cap = (): void => {
      c.beginPath();
      c.moveTo(6, 54);
      c.bezierCurveTo(6, 16, 90, 16, 90, 54);
      c.quadraticCurveTo(90, 61, 82, 61);
      c.lineTo(14, 61);
      c.quadraticCurveTo(6, 61, 6, 54);
      c.closePath();
    };
    cap();
    paint(c, rg(c, 38, 30, 56, '#ff8be8', '#c044dc', '#6a1f9a'));
    c.save();
    cap();
    c.clip();
    c.fillStyle = 'rgba(40,0,70,0.28)';
    c.fillRect(0, 53, 96, 10);
    for (const [x, y, r, col] of [[28, 37, 8.5, '#ffe14a'], [52, 30, 6.5, '#5ce1ff'], [72, 42, 7.5, '#7dff7a'], [43, 48, 4.5, '#ff8a3c'], [16, 49, 4.5, '#5ce1ff'], [84, 54, 4, '#ffe14a']] as const) {
      el(c, x, y, r);
      paint(c, col, 1.6, 'rgba(60,10,90,0.85)');
      el(c, x - r * 0.3, y - r * 0.35, r * 0.3);
      shine(c, 0.8);
    }
    el(c, 36, 31, 17, 5, -0.35);
    shine(c, 0.22);
    c.restore();
    cap();
    paint(c, null);
    spark(c, 86, 14, 6, '#ffd6ff');
    spark(c, 10, 22, 4.5, '#d6f6ff');
    spark(c, 78, 78, 4, '#fff3b0');
  },

  // Electrical failure: a lightning bolt between the two ends of a snapped cable.
  icon_blackout: (c) => {
    el(c, 48, 48, 40);
    c.fillStyle = rg(c, 48, 48, 42, 'rgba(255,230,90,0.55)', 'rgba(255,230,90,0)');
    c.fill();
    // the two ends of the cable, strands showing
    for (const [x0, y0, x1, y1] of [[2, 72, 30, 60], [94, 24, 66, 36]]) {
      tube(c, () => { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); }, 8, lg(c, x0, y0 - 5, x0, y0 + 5, '#5b6878', '#2b3440'));
      const dx = x1 > x0 ? 1 : -1;
      for (const k of [-1, 0, 1]) line(c, x1, y1, x1 + dx * 7, y1 - dx * 3 + k * 4.5, 2, '#e89a48');
    }
    // the bolt
    pl(c, [58, 3, 24, 53, 44, 53, 34, 93, 74, 39, 53, 39, 66, 3]);
    paint(c, lg(c, 30, 3, 60, 93, '#fffbc4', '#ffd91f', '#ff9a0a'), 3);
    pl(c, [57, 9, 35, 46, 47, 46]);
    shine(c, 0.5);
    spark(c, 82, 62, 6);
    spark(c, 14, 36, 5);
    spark(c, 72, 84, 3.5);
  },

  // Ultimate raclette: a half wheel of cheese melting over a potato and a slice of ham.
  icon_raclette: (c) => {
    // ham
    el(c, 70, 74, 18, 12, 0.2);
    paint(c, rg(c, 66, 70, 20, '#ffc2cf', '#f58aa2', '#d9607c'));
    el(c, 70, 74, 14.5, 8.5, 0.2);
    paint(c, null, 1.6, 'rgba(255,255,255,0.85)');
    line(c, 62, 76, 76, 71, 1.6, 'rgba(255,255,255,0.7)');
    // potato
    el(c, 32, 72, 23, 15.5, -0.15);
    paint(c, rg(c, 26, 65, 28, '#f0c988', '#c4924a', '#93652a'));
    for (const [x, y] of [[22, 76], [38, 80], [44, 70]]) {
      el(c, x, y, 1.6);
      paint(c, '#6e4718', 0);
    }
    el(c, 23, 65, 6, 3, -0.4);
    shine(c, 0.4);
    // the half wheel, flat side down
    c.beginPath();
    c.arc(48, 38, 37, Math.PI, Math.PI * 2);
    c.closePath();
    paint(c, lg(c, 12, 4, 80, 40, '#fff09a', '#ffd21f', '#f0a312'));
    c.save();
    c.beginPath();
    c.arc(48, 38, 37, Math.PI, Math.PI * 2);
    c.closePath();
    c.clip();
    c.beginPath();
    c.arc(48, 38, 34.5, Math.PI, Math.PI * 2);
    paint(c, null, 5, '#d9801a');
    for (const [x, y, r] of [[30, 26, 5], [50, 14, 4], [64, 27, 6], [44, 30, 3], [20, 34, 3]]) {
      el(c, x, y, r, r * 0.8);
      paint(c, '#e09a12', 1.2, 'rgba(140,80,0,0.7)');
    }
    c.restore();
    c.beginPath();
    c.arc(48, 38, 37, Math.PI, Math.PI * 2);
    c.closePath();
    paint(c, null);
    // melted cheese running down
    union(c, [
      () => rr(c, 12, 34, 72, 9, 4.5),
      () => rr(c, 20, 36, 10, 26, 5),
      () => rr(c, 37, 36, 8.5, 16, 4.2),
      () => rr(c, 52, 36, 11, 31, 5.5),
      () => rr(c, 70, 36, 8, 14, 4),
    ], lg(c, 0, 34, 0, 68, '#ffe45c', '#ffc21f'));
    rr(c, 22, 40, 3, 16, 1.5);
    shine(c, 0.6);
    rr(c, 54.5, 40, 3, 20, 1.5);
    shine(c, 0.6);
  },

  // A clogged toilet, a cloud of stink rising out of it.
  icon_toilet: (c) => {
    // tank
    rr(c, 27, 34, 42, 22, 5);
    paint(c, lg(c, 27, 34, 69, 56, '#ffffff', '#dfe5ea', '#b4bec8'));
    rr(c, 24, 30, 48, 8, 4);
    paint(c, lg(c, 24, 30, 24, 38, '#ffffff', '#cfd7de'));
    el(c, 48, 46, 3.5);
    paint(c, STEEL(c, 44, 42, 52, 50), 1.6);
    // bowl
    c.beginPath();
    c.moveTo(17, 57);
    c.lineTo(79, 57);
    c.bezierCurveTo(79, 80, 66, 86, 60, 86);
    c.lineTo(36, 86);
    c.bezierCurveTo(30, 86, 17, 80, 17, 57);
    c.closePath();
    paint(c, lg(c, 17, 57, 79, 86, '#ffffff', '#e3e8ed', '#aeb8c2'));
    rr(c, 33, 84, 30, 8, 3.5);
    paint(c, lg(c, 33, 84, 33, 92, '#f4f6f8', '#b4bec8'));
    // rim and what's in it
    el(c, 48, 57, 34, 10.5);
    paint(c, lg(c, 14, 47, 82, 67, '#ffffff', '#d5dce3'));
    el(c, 48, 57.5, 25.5, 6.5);
    paint(c, lg(c, 22, 51, 74, 64, '#a9cc48', '#5f7f1f'), 2);
    for (const [x, y, r] of [[38, 56, 3], [52, 59, 3.8], [62, 56, 2.6]]) {
      el(c, x, y, r);
      paint(c, '#c8e070', 1.2, '#4f6e1f');
    }
    // the stink
    union(c, [
      () => el(c, 31, 21, 10.5),
      () => el(c, 47, 13.5, 12.5),
      () => el(c, 64, 21, 10.5),
      () => el(c, 40, 25, 9),
      () => el(c, 56, 26, 9),
    ], rg(c, 44, 12, 34, '#cfe77a', '#9bbd3c', '#6f8f26'), 2.2, '#3f5a16');
    el(c, 42, 10, 5, 3, -0.4);
    shine(c, 0.45);
    for (const x of [12, 84]) {
      c.beginPath();
      c.moveTo(x, 44);
      c.bezierCurveTo(x - 6, 38, x + 6, 32, x, 24);
      paint(c, null, 2.4, '#6f8f26');
    }
  },

  // A Kärcher: a yellow pressure washer gun, its lance, and a fan of water.
  icon_karcher: (c) => {
    // the spray
    pl(c, [78, 42, 93, 16, 93, 68]);
    c.fillStyle = lg(c, 78, 42, 93, 42, 'rgba(190,232,255,0.95)', 'rgba(190,232,255,0.35)');
    c.fill();
    for (const dy of [-22, -11, 0, 11, 22]) line(c, 80, 42, 92, 42 + dy, 2.2, 'rgba(255,255,255,0.9)');
    for (const [x, y, r] of [[88, 11, 2.4], [91, 27, 1.8], [90, 59, 2.2], [87, 73, 2]]) {
      el(c, x, y, r);
      paint(c, '#ffffff', 1, 'rgba(60,120,170,0.8)');
    }
    // hose
    tube(c, () => { c.beginPath(); c.moveTo(21, 82); c.bezierCurveTo(21, 94, 36, 92, 44, 93); }, 4.5, '#3a4048');
    // handle and trigger
    pl(c, [14, 52, 30, 52, 27, 84, 13, 84]);
    paint(c, DARK(c, 13, 52, 30, 84));
    pl(c, [33, 54, 41, 54, 37, 69, 32, 68]);
    paint(c, STEEL(c, 32, 54, 41, 69), 2);
    // lance and nozzle
    rr(c, 48, 38, 26, 8.5, 2.5);
    paint(c, STEEL(c, 48, 38, 48, 47));
    rr(c, 71, 34.5, 9, 15, 3);
    paint(c, lg(c, 71, 34, 71, 50, '#6eb3ef', '#2f6fb5'));
    // body
    rr(c, 4, 28, 48, 28, 11);
    paint(c, lg(c, 4, 28, 4, 56, '#fff09a', '#f8c81c', '#c79200'));
    rr(c, 10, 31.5, 30, 5, 2.5);
    shine(c, 0.5);
    rr(c, 12, 41, 24, 9, 3.5);
    paint(c, DARK(c, 12, 41, 12, 50), 1.8);
  },

  // Glue: a bottle turned over, a long drip, and a puddle.
  icon_glue: (c) => {
    union(c, [
      () => el(c, 48, 83, 35, 9.5),
      () => rr(c, 43.5, 50, 9, 32, 4.5),
    ], lg(c, 14, 74, 82, 92, '#fff8b0', '#f2e06a', '#c9b440'), 2.4, '#7a6818');
    el(c, 38, 80, 12, 2.6);
    shine(c, 0.65);
    rr(c, 45.5, 54, 2.4, 18, 1.2);
    shine(c, 0.7);
    // nozzle
    pl(c, [37, 43, 59, 43, 52, 57, 44, 57]);
    paint(c, lg(c, 37, 43, 59, 57, '#ffb066', '#e06a1c'));
    // bottle
    rr(c, 25, 5, 46, 40, 10);
    paint(c, lg(c, 25, 5, 71, 45, '#ffffff', '#e3e8ed', '#aab3bc'));
    c.save();
    rr(c, 25, 5, 46, 40, 10);
    c.clip();
    c.fillStyle = lg(c, 0, 15, 0, 33, '#5aa2e8', '#2f6fb5');
    c.fillRect(25, 15, 46, 18);
    c.fillStyle = '#ffffff';
    for (const x of [40, 48, 56]) {
      c.beginPath();
      c.arc(x, 24, 2.8, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = 'rgba(255,255,255,0.5)';
    c.fillRect(29, 5, 5, 40);
    c.restore();
    rr(c, 25, 5, 46, 40, 10);
    paint(c, null);
  },

  // Dicke Titten: a giant cartoon pair, wobbling.
  icon_titten: (c) => {
    el(c, 48, 86, 38, 5.5);
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.fill();
    for (const x of [29, 67]) {
      el(c, x, 54, 26);
      paint(c, rg(c, x - 9, 44, 34, '#ffe6d4', '#f4c3a2', '#cf8f6c'));
      el(c, x + 3, 58, 9.5);
      c.fillStyle = rg(c, x + 3, 58, 9.5, '#c4675a', '#d98a78', 'rgba(217,138,120,0)');
      c.fill();
      el(c, x + 3, 58, 3.8);
      paint(c, '#a8483e', 0);
      el(c, x + 2, 56.8, 1.2);
      shine(c, 0.7);
      el(c, x - 11, 42, 6, 4, -0.6);
      shine(c, 0.55);
    }
    c.beginPath();
    c.arc(48, 39, 9, Math.PI * 0.18, Math.PI * 0.82);
    paint(c, null, 2.4);
    // wobble lines and a heart
    for (const [x, d] of [[5, 1], [91, -1]] as const) {
      c.beginPath();
      c.arc(x + d * 8, 26, 10, d > 0 ? Math.PI * 0.85 : -Math.PI * 0.35, d > 0 ? Math.PI * 1.35 : Math.PI * 0.15);
      paint(c, null, 2.8, '#ff6fa8');
    }
    c.beginPath();
    c.moveTo(48, 22);
    c.bezierCurveTo(36, 12, 40, 2, 48, 9);
    c.bezierCurveTo(56, 2, 60, 12, 48, 22);
    c.closePath();
    paint(c, lg(c, 40, 4, 56, 22, '#ff9cc4', '#ff4f93'), 2);
  },

  // A giant black dildo, glossy.
  icon_dildo: (c) => {
    c.save();
    c.translate(48, 50);
    c.rotate(-0.72);
    const shaft = (): void => {
      c.beginPath();
      c.moveTo(-34, -9);
      c.lineTo(20, -9.5);
      c.quadraticCurveTo(23, -13, 29, -13);
      c.quadraticCurveTo(42, -12, 42, 0);
      c.quadraticCurveTo(42, 12, 29, 13);
      c.quadraticCurveTo(23, 13, 20, 9.5);
      c.lineTo(-34, 9);
      c.closePath();
    };
    shaft();
    paint(c, lg(c, 0, -13, 0, 13, '#5a5a68', '#22222a', '#08080c'), LW, '#000000');
    // ridges
    for (const x of [-16, 0]) {
      c.beginPath();
      c.moveTo(x, -8.5);
      c.quadraticCurveTo(x + 3, 0, x, 8.5);
      paint(c, null, 1.4, 'rgba(110,110,125,0.9)');
    }
    // the base: a flared foot
    rr(c, -44, -15, 13, 30, 6);
    paint(c, lg(c, -44, -15, -44, 15, '#4a4a56', '#16161c'), LW, '#000000');
    // the shine
    c.lineCap = 'round';
    line(c, -28, -4.5, 18, -5, 2.6, 'rgba(255,255,255,0.6)');
    el(c, 31, -6, 3.2, 2.2);
    shine(c, 0.8);
    c.restore();
    spark(c, 84, 14, 5.5, '#ffffff');
    spark(c, 14, 30, 4, '#ffffff');
  },

  // A nail gun, firing three nails.
  icon_nailGun: (c) => {
    // the magazine, from the nose down to the foot of the handle
    pl(c, [58, 42, 71, 42, 45, 86, 32, 86]);
    paint(c, STEEL(c, 32, 42, 71, 86));
    for (let k = 0; k < 6; k++) line(c, 60 - k * 4.2, 49 + k * 6.2, 65 - k * 4.2, 52 + k * 6.2, 1.5, 'rgba(40,46,54,0.7)');
    // handle and trigger
    pl(c, [20, 42, 37, 42, 35, 84, 18, 84]);
    paint(c, DARK(c, 18, 42, 37, 84));
    rr(c, 39, 46, 6, 11, 2.5);
    paint(c, lg(c, 39, 46, 45, 57, '#ff7b66', '#c9302a'), 1.8);
    // nose
    rr(c, 60, 24, 13, 16, 3);
    paint(c, DARK(c, 60, 24, 60, 40));
    rr(c, 71, 28.5, 6.5, 7, 2);
    paint(c, STEEL(c, 71, 28, 71, 36), 2);
    // body
    rr(c, 6, 18, 58, 28, 10);
    paint(c, lg(c, 6, 18, 6, 46, '#ffbb6a', '#ee7c2a', '#b5521a'));
    rr(c, 4, 21, 11, 22, 5);
    paint(c, DARK(c, 4, 21, 4, 43), 2);
    rr(c, 18, 21.5, 34, 5, 2.5);
    shine(c, 0.5);
    for (let x = 24; x < 50; x += 6) line(c, x, 33, x, 40, 1.6, 'rgba(90,35,5,0.55)');
    // nails
    for (const [x, y] of [[80, 16], [82, 32], [80, 48]]) {
      line(c, x - 9, y, x - 4, y, 1.6, 'rgba(255,255,255,0.7)');
      pl(c, [x, y - 1.8, x + 10, y - 1.8, x + 14, y, x + 10, y + 1.8, x, y + 1.8]);
      paint(c, STEEL(c, x, y - 2, x, y + 2), 1.4);
      rr(c, x - 1.5, y - 4, 3, 8, 1.2);
      paint(c, '#8f98a2', 1.4);
    }
  },

  // Gas siphoning: a jerrycan, a hose, the last drop, and a gauge on empty.
  icon_siphon: (c) => {
    // carrying handle
    rr(c, 18, 15, 30, 17, 6);
    paint(c, lg(c, 18, 15, 18, 32, '#e2483a', '#9c2a22'));
    c.save();
    c.globalCompositeOperation = 'destination-out';
    rr(c, 25, 20, 16, 7, 3.5);
    c.fill();
    c.restore();
    rr(c, 25, 20, 16, 7, 3.5);
    paint(c, null, 2);
    // spout
    rr(c, 48, 14, 13, 18, 3.5);
    paint(c, lg(c, 48, 14, 61, 14, '#fff09a', '#e0a000'));
    // the can
    rr(c, 10, 30, 54, 60, 9);
    paint(c, lg(c, 10, 30, 64, 90, '#ff7566', '#d23b2f', '#952620'));
    c.save();
    rr(c, 10, 30, 54, 60, 9);
    c.clip();
    c.lineCap = 'round';
    line(c, 18, 40, 56, 82, 4, 'rgba(110,20,15,0.55)');
    line(c, 56, 40, 18, 82, 4, 'rgba(110,20,15,0.55)');
    c.fillStyle = 'rgba(255,255,255,0.3)';
    c.fillRect(14, 30, 6, 60);
    c.restore();
    rr(c, 10, 30, 54, 60, 9);
    paint(c, null);
    // the hose
    tube(c, () => { c.beginPath(); c.moveTo(54.5, 15); c.bezierCurveTo(56, 0, 84, 0, 84, 18); c.lineTo(84, 64); }, 4.5, lg(c, 54, 0, 86, 64, '#b6f0d2', '#63c79a'));
    // the last drop
    c.beginPath();
    c.moveTo(84, 67);
    c.bezierCurveTo(93, 79, 91, 90, 84, 90);
    c.bezierCurveTo(77, 90, 75, 79, 84, 67);
    c.closePath();
    paint(c, lg(c, 78, 68, 90, 90, '#ffd66b', '#c9801a'), 2);
    el(c, 81.5, 82, 1.6, 2.6);
    shine(c, 0.7);
    // the gauge
    el(c, 37, 60, 14);
    paint(c, rg(c, 33, 55, 18, '#ffffff', '#dfe5ea'), 2.2);
    c.lineCap = 'round';
    for (const a of [-2.6, -1.57, -0.54]) line(c, 37 + Math.cos(a) * 9, 60 + Math.sin(a) * 9, 37 + Math.cos(a) * 12, 60 + Math.sin(a) * 12, 1.6, '#3b434d');
    line(c, 37, 60, 28, 54.5, 2.6, '#d62f2f');
    el(c, 37, 60, 2.6);
    paint(c, OUT, 0);
  },

  // A tugboat steaming to the right, a tow rope trailing behind.
  icon_tugboat: (c) => {
    // smoke
    for (const [x, y, r] of [[68, 9, 6.5], [79, 6, 5], [88, 10, 3.8]]) {
      el(c, x, y, r);
      paint(c, rg(c, x - 2, y - 2, r * 1.3, '#ffffff', '#c3ccd5'), 1.4, 'rgba(60,70,85,0.8)');
    }
    // funnel
    rr(c, 49, 9, 14, 24, 3);
    paint(c, lg(c, 49, 9, 63, 9, '#ff7566', '#c9302a'));
    c.save();
    rr(c, 49, 9, 14, 24, 3);
    c.clip();
    c.fillStyle = OUT;
    c.fillRect(49, 9, 14, 6.5);
    c.fillStyle = '#f6f8fa';
    c.fillRect(49, 19, 14, 3.5);
    c.restore();
    // wheelhouse
    rr(c, 32, 31, 38, 25, 4);
    paint(c, lg(c, 32, 31, 32, 56, '#ffffff', '#dbe2e9'));
    rr(c, 28, 27, 46, 7.5, 3.5);
    paint(c, lg(c, 28, 27, 28, 35, '#ff7566', '#c9302a'));
    for (const x of [37, 53]) {
      rr(c, x, 37.5, 11, 10, 2.5);
      paint(c, lg(c, x, 37, x + 11, 48, '#bfe6ff', '#5aa2e8'), 1.8);
      line(c, x + 2.5, 45.5, x + 6, 39.5, 1.5, 'rgba(255,255,255,0.85)');
    }
    // tow rope
    tube(c, () => { c.beginPath(); c.moveTo(11, 57); c.quadraticCurveTo(4, 62, 1, 74); }, 2.4, '#d9b77a', 1.6);
    // hull
    const hull = (): void => {
      c.beginPath();
      c.moveTo(7, 54);
      c.lineTo(88, 54);
      c.lineTo(95, 47);
      c.lineTo(84, 77);
      c.lineTo(17, 77);
      c.closePath();
    };
    hull();
    paint(c, lg(c, 7, 54, 7, 77, '#4f86c6', '#27507f'));
    c.save();
    hull();
    c.clip();
    c.fillStyle = '#c9302a';
    c.fillRect(0, 71, 96, 8);
    c.fillStyle = OUT;
    c.fillRect(0, 53, 96, 5);
    c.restore();
    hull();
    paint(c, null);
    for (const x of [28, 46, 64]) {
      el(c, x, 65, 5.2);
      paint(c, '#23272e', 1.6);
      el(c, x, 65, 2);
      paint(c, '#59616c', 0);
    }
    // the water
    c.beginPath();
    c.moveTo(0, 82);
    for (let x = 0; x <= 96; x += 12) c.quadraticCurveTo(x + 6, 76, x + 12, 82);
    c.lineTo(96, 96);
    c.lineTo(0, 96);
    c.closePath();
    paint(c, lg(c, 0, 78, 0, 96, '#8fd0ff', '#3f8fd0'), 2, '#1f4f80');
    c.beginPath();
    c.moveTo(4, 90);
    for (let x = 4; x <= 88; x += 12) c.quadraticCurveTo(x + 6, 86, x + 12, 90);
    paint(c, null, 1.8, 'rgba(255,255,255,0.8)');
  },

  // The beer dispenser: a bar tap filling a glass to the brim, and the shield it gives.
  icon_beerDispenser: (c) => {
    // the tap: column, arm, spout and lever
    tube(c, () => { c.beginPath(); c.moveTo(33, 15); c.lineTo(37, 4); }, 4.5, '#2c323b');
    el(c, 37.5, 4.5, 4.2);
    paint(c, lg(c, 34, 1, 41, 8, '#fff09a', '#e0a000'), 1.8);
    rr(c, 12, 12, 16, 66, 6);
    paint(c, lg(c, 12, 12, 28, 12, '#f6f8fa', '#b3bbc4', '#6f7882'));
    rr(c, 12, 12, 42, 13, 6.5);
    paint(c, lg(c, 12, 12, 12, 25, '#f6f8fa', '#b3bbc4', '#6f7882'));
    rr(c, 43, 20, 11, 15, 3);
    paint(c, lg(c, 43, 20, 54, 20, '#f6f8fa', '#8f98a2'));
    rr(c, 6, 76, 28, 11, 4.5);
    paint(c, lg(c, 6, 76, 6, 87, '#dfe5ea', '#6f7882'));
    rr(c, 15, 28, 3, 44, 1.5);
    shine(c, 0.7);
    // the pour
    c.fillStyle = '#f2a71a';
    c.fillRect(46.5, 35, 4, 12);
    // the glass: handle, body, foam
    tube(c, () => { c.beginPath(); c.moveTo(77, 57); c.bezierCurveTo(93, 57, 93, 80, 76, 80); }, 4.5, '#ffe9a8');
    pl(c, [35, 48, 79, 48, 76, 91, 38, 91]);
    paint(c, lg(c, 35, 48, 35, 91, '#ffe066', '#f5ae0e', '#c47700'));
    rr(c, 41, 56, 5, 29, 2.5);
    shine(c, 0.5);
    for (const [x, y, r] of [[56, 72, 1.8], [64, 62, 1.4], [68, 80, 2], [52, 84, 1.3]]) {
      el(c, x, y, r);
      shine(c, 0.6);
    }
    union(c, [
      () => rr(c, 33, 43, 48, 9, 4.5),
      () => el(c, 40, 44, 7),
      () => el(c, 51, 40, 9.5),
      () => el(c, 64, 41, 9.5),
      () => el(c, 75, 45, 6.5),
      () => rr(c, 34.5, 48, 7, 14, 3.5),
    ], lg(c, 0, 30, 0, 62, '#ffffff', '#fff3d6'), 2.2);
    // the shield: a head of foam that takes the next hit
    c.beginPath();
    c.moveTo(80, 4);
    c.lineTo(93, 8);
    c.lineTo(93, 20);
    c.bezierCurveTo(93, 28, 86, 32, 80, 35);
    c.bezierCurveTo(74, 32, 67, 28, 67, 20);
    c.lineTo(67, 8);
    c.closePath();
    paint(c, lg(c, 67, 4, 93, 35, '#8fd4ff', '#2f7fd0'), 2.2);
    rr(c, 77.8, 10, 4.4, 17, 1.5);
    paint(c, '#ffffff', 0);
    rr(c, 71.5, 16.3, 17, 4.4, 1.5);
    paint(c, '#ffffff', 0);
  },

  // A vacuum cleaner: a red canister, its hose, and everything flying into the nozzle.
  icon_vacuum: (c) => {
    // what it sucks in
    c.save();
    c.lineCap = 'round';
    for (const [x0, y0, x1, y1, a] of [[95, 4, 84, 10, 0.9], [96, 20, 85, 19, 0.75], [92, 36, 83, 28, 0.6], [78, 2, 76, 9, 0.6]]) line(c, x0, y0, x1, y1, 3, `rgba(170,225,255,${a})`);
    c.restore();
    el(c, 90, 12, 2);
    paint(c, '#ffe14a', 1, 'rgba(90,60,0,0.8)');
    el(c, 93, 28, 1.6);
    paint(c, '#ffffff', 1, 'rgba(60,120,170,0.8)');
    // hose
    const hose = (): void => {
      c.beginPath();
      c.moveTo(46, 58);
      c.bezierCurveTo(58, 54, 50, 34, 66, 24);
    };
    tube(c, hose, 6, '#8f98a2');
    c.save();
    c.setLineDash([2, 3.5]);
    hose();
    c.lineWidth = 6;
    c.strokeStyle = 'rgba(40,46,54,0.5)';
    c.stroke();
    c.restore();
    // nozzle
    c.save();
    c.translate(70, 21);
    c.rotate(-0.55);
    rr(c, -8, -5.5, 14, 11, 3.5);
    paint(c, DARK(c, -8, -5, -8, 6));
    pl(c, [5, -6, 18, -13, 18, 13, 5, 6]);
    paint(c, DARK(c, 5, -13, 18, 13));
    line(c, 18, -11, 18, 11, 2, '#8f98a2');
    c.restore();
    // wheels
    el(c, 20, 82, 9.5);
    paint(c, DARK(c, 10, 72, 30, 92));
    el(c, 20, 82, 3.6);
    paint(c, '#aab3bc', 1.4);
    el(c, 47, 86, 5.5);
    paint(c, DARK(c, 42, 80, 52, 92));
    // canister
    rr(c, 5, 48, 52, 34, 15);
    paint(c, lg(c, 5, 48, 5, 82, '#ff8273', '#d9392d', '#952620'));
    rr(c, 12, 52, 30, 6, 3);
    shine(c, 0.5);
    for (let x = 14; x < 30; x += 5) line(c, x, 66, x, 74, 1.8, 'rgba(90,15,10,0.55)');
    el(c, 43, 68, 4);
    paint(c, rg(c, 42, 67, 5, '#b9ff9a', '#3fbf3a'), 1.6);
    // carrying handle
    c.beginPath();
    c.arc(26, 49, 11, Math.PI * 1.08, Math.PI * 1.92);
    paint(c, null, 3.4);
  },
  // A sauna: a wooden bucket and ladle beside a basket of hot stones, steam rolling up.
  icon_sauna: (c) => {
    // steam
    c.save();
    c.lineCap = 'round';
    for (const [x, a] of [[52, 0], [66, 1.4], [80, 2.6]] as const) {
      const wave = (): void => {
        c.beginPath();
        c.moveTo(x, 52);
        for (let y = 52; y >= 6; y -= 2) c.lineTo(x + Math.sin(y / 7 + a) * 5, y);
      };
      wave();
      c.lineWidth = 9;
      c.strokeStyle = 'rgba(120,140,160,0.35)';
      c.stroke();
      wave();
      c.lineWidth = 5;
      c.strokeStyle = 'rgba(255,255,255,0.95)';
      c.stroke();
    }
    c.restore();
    // the stove's basket of stones
    rr(c, 44, 60, 46, 28, 5);
    paint(c, DARK(c, 44, 60, 44, 88));
    for (const [x, y, r] of [[52, 60, 8], [64, 57, 9], [77, 59, 8.5], [58, 52, 6.5], [72, 50, 7]] as const) {
      el(c, x, y, r, r * 0.78);
      paint(c, rg(c, x - r * 0.3, y - r * 0.3, r * 1.3, '#d8dde2', '#8b939c', '#4f565e'), 1.8);
    }
    el(c, 66, 55, 4, 2.6);
    paint(c, 'rgba(255,140,60,0.75)', 0);
    // the bucket: wooden staves, two steel bands
    pl(c, [6, 54, 40, 54, 36, 90, 10, 90]);
    paint(c, lg(c, 6, 54, 40, 54, '#e3a865', '#b9773a', '#8c5424'));
    c.save();
    pl(c, [6, 54, 40, 54, 36, 90, 10, 90]);
    c.clip();
    for (let x = 12; x < 40; x += 6) line(c, x, 54, x - 1, 90, 1.3, 'rgba(80,40,10,0.45)');
    line(c, 4, 62, 42, 62, 3.4, '#9aa3ad');
    line(c, 4, 82, 42, 82, 3.4, '#9aa3ad');
    c.restore();
    el(c, 23, 54, 17, 4.5);
    paint(c, lg(c, 6, 50, 40, 58, '#6fb8e8', '#2f78b0'), 2);
    // the ladle
    tube(c, () => {
      c.beginPath();
      c.moveTo(22, 54);
      c.lineTo(44, 24);
    }, 4.5, '#c58a4c');
    el(c, 20, 56, 7, 4);
    paint(c, lg(c, 13, 52, 27, 60, '#d79a5a', '#9b6230'), 2);
  },

  // A noise complaint: a loudspeaker blasting sound waves, a police light flashing.
  icon_noise: (c) => {
    // sound waves
    c.save();
    c.lineCap = 'round';
    for (const [r, a] of [[16, 1], [27, 0.85], [38, 0.65]] as const) {
      c.beginPath();
      c.arc(46, 60, r, -0.75, 0.75);
      c.lineWidth = 6.5;
      c.strokeStyle = OUT;
      c.stroke();
      c.beginPath();
      c.arc(46, 60, r, -0.75, 0.75);
      c.lineWidth = 3.6;
      c.strokeStyle = `rgba(255,214,74,${a})`;
      c.stroke();
    }
    c.restore();
    // the speaker box
    rr(c, 6, 32, 40, 58, 6);
    paint(c, DARK(c, 6, 32, 46, 90));
    for (const [y, r] of [[47, 9], [74, 13]] as const) {
      el(c, 26, y, r);
      paint(c, rg(c, 24, y - 2, r, '#6d7680', '#3a414a', '#20252c'), 2);
      el(c, 26, y, r * 0.38);
      paint(c, rg(c, 25, y - 1, r * 0.4, '#c9d0d7', '#7d868f'), 1.4);
    }
    rr(c, 10, 35, 30, 5, 2.5);
    shine(c, 0.25);
    // the police light
    rr(c, 62, 22, 26, 6, 2);
    paint(c, DARK(c, 62, 22, 62, 28), 2);
    c.beginPath();
    c.moveTo(64, 23);
    c.lineTo(65, 10);
    c.quadraticCurveTo(75, 0, 85, 10);
    c.lineTo(86, 23);
    c.closePath();
    paint(c, lg(c, 64, 4, 86, 22, '#9fd8ff', '#2f7fd8', '#1d4f9a'), 2.2);
    c.beginPath();
    c.moveTo(69, 18);
    c.quadraticCurveTo(70, 8, 76, 7);
    c.lineWidth = 2.6;
    c.strokeStyle = 'rgba(255,255,255,0.75)';
    c.stroke();
    for (const [x0, y0, x1, y1] of [[58, 8, 52, 3], [92, 8, 96, 2], [56, 18, 50, 18], [94, 18, 99, 18]] as const) line(c, x0, y0, x1, y1, 2.4, '#9fd8ff');
  },

  // Lazy volunteers: a floating couch, a volunteer lounging on it with a drink.
  icon_lazyVolunteers: (c) => {
    // the water under it
    el(c, 48, 86, 44, 7);
    paint(c, 'rgba(90,170,230,0.75)', 0);
    c.save();
    c.lineCap = 'round';
    for (const [x0, x1, y] of [[8, 22, 86], [30, 46, 89], [60, 78, 87], [82, 90, 84]] as const) line(c, x0, y, x1, y, 2, 'rgba(255,255,255,0.8)');
    c.restore();
    // couch: back, seat, arms
    rr(c, 10, 40, 76, 26, 8);
    paint(c, lg(c, 10, 40, 10, 66, '#e2574a', '#b2342a'));
    rr(c, 8, 60, 80, 20, 7);
    paint(c, lg(c, 8, 60, 8, 80, '#d24538', '#8f2820'));
    rr(c, 4, 52, 15, 28, 6);
    paint(c, lg(c, 4, 52, 19, 80, '#e2574a', '#9c2b22'));
    rr(c, 77, 52, 15, 28, 6);
    paint(c, lg(c, 77, 52, 92, 80, '#e2574a', '#9c2b22'));
    rr(c, 14, 43, 68, 6, 3);
    shine(c, 0.25);
    // the volunteer, lying along the seat: legs over the arm, hands behind the head
    tube(c, () => {
      c.beginPath();
      c.moveTo(56, 60);
      c.lineTo(80, 54);
      c.lineTo(90, 60);
    }, 7, '#3c5a8c');
    el(c, 92, 61, 4, 3);
    paint(c, '#2b2f36', 1.6);
    rr(c, 26, 50, 34, 15, 7);
    paint(c, lg(c, 26, 50, 26, 65, '#ffd23f', '#f29a1d'), 2.2);
    line(c, 38, 51, 38, 64, 2.2, 'rgba(255,255,255,0.9)');
    line(c, 48, 51, 48, 64, 2.2, 'rgba(255,255,255,0.9)');
    el(c, 20, 52, 8.5);
    paint(c, rg(c, 18, 49, 10, '#ffd9b0', '#e3a878'), 2.2);
    // sunglasses and a smile
    rr(c, 13, 48, 13, 4.5, 2);
    paint(c, '#1b2330', 0);
    c.beginPath();
    c.arc(20, 55, 3, 0.2, Math.PI - 0.2);
    paint(c, null, 1.4);
    // a drink in hand
    pl(c, [56, 36, 66, 36, 64, 50, 58, 50]);
    paint(c, lg(c, 56, 36, 66, 50, '#ffe58a', '#f2b81e'), 2);
    rr(c, 55, 33, 12, 4, 2);
    paint(c, '#ffffff', 1.4);
    line(c, 63, 34, 68, 22, 2, '#ff6f9a');
    // zzz
    c.font = 'bold 13px sans-serif';
    c.fillStyle = '#ffffff';
    c.strokeStyle = OUT;
    c.lineWidth = 3;
    for (const [ch, x, y] of [['z', 26, 30], ['z', 33, 22], ['Z', 41, 13]] as const) {
      c.strokeText(ch, x, y);
      c.fillText(ch, x, y);
    }
  },

  // A painting workshop: a tipped pot pouring paint, a brush, splashes of every colour.
  icon_paint: (c) => {
    // splashes
    for (const [x, y, r, col] of [[20, 80, 14, '#e8433a'], [50, 86, 12, '#2f8fe0'], [78, 78, 13, '#38b25a'], [84, 52, 8, '#f2c12e'], [12, 54, 7, '#b24ad8']] as const) {
      c.beginPath();
      for (let k = 0; k <= 10; k++) {
        const a = (k / 10) * Math.PI * 2, rr2 = r * (k % 2 ? 0.72 : 1.05);
        if (k === 0) c.moveTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2 * 0.6);
        else c.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2 * 0.6);
      }
      c.closePath();
      paint(c, col, 1.8);
    }
    // the pot, tipped over to the right, pouring
    c.save();
    c.translate(36, 38);
    c.rotate(0.55);
    rr(c, -16, -18, 32, 36, 4);
    paint(c, STEEL(c, -16, -18, 16, 18));
    rr(c, -16, -6, 32, 13, 0);
    paint(c, lg(c, -16, -6, 16, 7, '#ff8a6a', '#e8433a'), 1.6);
    el(c, 0, -18, 16, 4.5);
    paint(c, '#e8433a', 2);
    c.beginPath();
    c.arc(0, -10, 19, Math.PI * 1.1, Math.PI * 1.9);
    paint(c, null, 2.4);
    c.restore();
    // the pour
    tube(c, () => {
      c.beginPath();
      c.moveTo(48, 26);
      c.quadraticCurveTo(62, 34, 60, 62);
    }, 7, '#e8433a');
    // the brush, laid across
    c.save();
    c.translate(70, 30);
    c.rotate(-0.85);
    rr(c, -4, -26, 8, 26, 3);
    paint(c, lg(c, -4, -26, 4, -26, '#d79a5a', '#9b6230'), 2);
    rr(c, -6, 0, 12, 7, 1.5);
    paint(c, STEEL(c, -6, 0, 6, 7), 1.8);
    c.beginPath();
    c.moveTo(-6, 7);
    c.lineTo(6, 7);
    c.lineTo(5, 20);
    c.quadraticCurveTo(0, 24, -5, 20);
    c.closePath();
    paint(c, lg(c, -6, 7, 6, 22, '#4fb0ff', '#2f6fd0'), 2);
    c.restore();
  },

  // Lost in Translation: two speech bubbles that don't understand each other.
  icon_translation: (c) => {
    const bubble = (x: number, y: number, w: number, h: number, tailX: number, tailDir: number, fill: Fill): void => {
      c.beginPath();
      c.moveTo(x + 10, y);
      c.arcTo(x + w, y, x + w, y + h, 10);
      c.arcTo(x + w, y + h, x, y + h, 10);
      c.lineTo(tailX + 8 * tailDir, y + h);
      c.lineTo(tailX - 2 * tailDir, y + h + 13);
      c.lineTo(tailX - 4 * tailDir, y + h);
      c.arcTo(x, y + h, x, y, 10);
      c.arcTo(x, y, x + w, y, 10);
      c.closePath();
      paint(c, fill);
    };
    bubble(4, 8, 56, 40, 20, 1, lg(c, 4, 8, 4, 48, '#7cc4ff', '#2f7fd8'));
    bubble(36, 42, 56, 38, 76, -1, lg(c, 36, 42, 36, 80, '#ffe58a', '#f2a81e'));
    c.font = 'bold 26px sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineWidth = 4;
    c.strokeStyle = OUT;
    c.fillStyle = '#ffffff';
    c.strokeText('Hi!', 32, 29);
    c.fillText('Hi!', 32, 29);
    c.fillStyle = '#5a3a00';
    c.font = 'bold 24px sans-serif';
    c.fillText('¿Was?', 64, 62);
    c.textAlign = 'start';
    c.textBaseline = 'alphabetic';
  },

  // Premature Celebration: a bottle of champagne, the cork flying off, foam everywhere.
  icon_champagne: (c) => {
    // foam spraying out
    c.save();
    c.lineCap = 'round';
    for (const [x1, y1] of [[70, 6], [84, 16], [90, 32], [58, 4]]) line(c, 62, 30, x1, y1, 5, 'rgba(255,250,220,0.95)');
    c.restore();
    for (const [x, y, r] of [[72, 10, 4], [86, 22, 3.5], [64, 8, 3], [88, 36, 3]] as const) {
      el(c, x, y, r);
      paint(c, '#fffbe6', 1.2, 'rgba(150,120,40,0.8)');
    }
    // the cork, flying
    c.save();
    c.translate(84, 8);
    c.rotate(0.6);
    rr(c, -5, -6, 10, 12, 3);
    paint(c, lg(c, -5, -6, 5, 6, '#e8c08a', '#b07a3a'), 2);
    c.restore();
    // the bottle, tilted
    c.save();
    c.translate(36, 62);
    c.rotate(0.65);
    c.beginPath();
    c.moveTo(-6, -40);
    c.lineTo(6, -40);
    c.lineTo(6, -24);
    c.quadraticCurveTo(15, -18, 15, -6);
    c.lineTo(15, 30);
    c.quadraticCurveTo(15, 34, 11, 34);
    c.lineTo(-11, 34);
    c.quadraticCurveTo(-15, 34, -15, 30);
    c.lineTo(-15, -6);
    c.quadraticCurveTo(-15, -18, -6, -24);
    c.closePath();
    paint(c, lg(c, -15, 0, 15, 0, '#2f7a3a', '#165a26', '#0b3a18'));
    // gold foil on the neck, a label
    c.beginPath();
    c.moveTo(-6, -40);
    c.lineTo(6, -40);
    c.lineTo(7, -26);
    c.lineTo(-7, -26);
    c.closePath();
    paint(c, lg(c, -6, -40, 6, -40, '#ffe58a', '#d9a520'), 1.8);
    rr(c, -12, 2, 24, 18, 3);
    paint(c, '#fdf6e0', 1.8);
    line(c, -8, 8, 8, 8, 1.6, '#c9a030');
    line(c, -8, 14, 8, 14, 1.6, '#c9a030');
    rr(c, -11, -4, 4, 34, 2);
    shine(c, 0.25);
    c.restore();
    spark(c, 18, 18, 4);
    spark(c, 88, 54, 3.5);
  },
};

/** Draw every icon into its own canvas texture (once). */
export function generateItemIcons(scene: Phaser.Scene): void {
  for (const [key, draw] of Object.entries(ICONS)) {
    if (scene.textures.exists(key)) continue;
    const size = 96 * SCALE;
    // The icon on a layer of its own, then onto the texture with a soft shadow under all of it.
    const layer = document.createElement('canvas');
    layer.width = layer.height = size;
    const c = layer.getContext('2d')!;
    c.scale(SCALE, SCALE);
    c.lineJoin = 'round';
    c.lineCap = 'butt';
    draw(c);
    const tex = scene.textures.createCanvas(key, size, size);
    if (!tex) continue;
    const out = tex.getContext();
    out.shadowColor = 'rgba(0,0,0,0.45)';
    out.shadowBlur = 3 * SCALE;
    out.shadowOffsetY = 1.5 * SCALE;
    out.drawImage(layer, 0, 0);
    tex.refresh();
  }
}
