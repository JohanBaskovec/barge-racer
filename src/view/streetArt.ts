/**
 * The street life seen from above, in design units (game pixels, 10 per metre on the Reims map):
 * cars (4.5 x 2 m) pointing right, and people (about 0.7 m across) facing right. Drawn with the
 * Canvas 2D API; the caller scales the canvas up for sharp textures.
 */

type Ctx = CanvasRenderingContext2D;

function rr(c: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  c.moveTo(x + k, y);
  c.arcTo(x + w, y, x + w, y + h, k);
  c.arcTo(x + w, y + h, x, y + h, k);
  c.arcTo(x, y + h, x, y, k);
  c.arcTo(x, y, x + w, y, k);
  c.closePath();
}

function disc(c: Ctx, color: string, x: number, y: number, r: number): void {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = color;
  c.fill();
}

/** Canvas pixels per design unit for these textures: sprites show them at 1 / STREET_ART_SCALE. */
export const STREET_ART_SCALE = 3;

export const CAR = { length: 44, width: 20 };
export const CAR_COLORS = ['#c0392b', '#f2f2f2', '#2f6fd8', '#2b2f35', '#f4c20d', '#8f969d', '#2d8f5a', '#e07b2a'];

/**
 * A car seen from above, 44 x 20 inside a 48 x 24 canvas (2 px margin): body in `color`, darker
 * windows, a lighter roof, headlights at the front (right). `kind` 0 a hatchback, 1 a saloon, 2 a van.
 */
export function drawCar(c: Ctx, color: string, kind: number): void {
  const L = CAR.length, W = CAR.width;
  c.translate(2, 2);
  // shadow
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.45)';
  c.shadowBlur = 2 * c.getTransform().a;
  rr(c, kind === 2 ? -2 : 0, 0, kind === 2 ? L + 2 : L, W, 5);
  c.fillStyle = color;
  c.fill();
  c.restore();
  c.strokeStyle = 'rgba(0,0,0,0.55)';
  c.lineWidth = 0.7;
  rr(c, kind === 2 ? -2 : 0, 0, kind === 2 ? L + 2 : L, W, 5);
  c.stroke();
  // shading: a little darker at the sides, the same on both (cars turn)
  const g = c.createLinearGradient(0, 0, 0, W);
  g.addColorStop(0, 'rgba(0,0,0,0.22)');
  g.addColorStop(0.25, 'rgba(0,0,0,0)');
  g.addColorStop(0.75, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.22)');
  rr(c, 0, 0, L, W, 5);
  c.fillStyle = g;
  c.fill();
  const glass = 'rgba(25,38,55,0.92)';
  if (kind === 2) {
    // van: a long flat roof, a short bonnet
    rr(c, L - 13, 2, 6, W - 4, 2);
    c.fillStyle = glass;
    c.fill();
    rr(c, 2, 2.5, L - 16, W - 5, 2);
    c.fillStyle = 'rgba(255,255,255,0.25)';
    c.fill();
  } else {
    const front = kind === 0 ? L - 15 : L - 17;
    const back = kind === 0 ? 7 : 6;
    rr(c, front, 2.5, 6, W - 5, 2.5); // windscreen
    c.fillStyle = glass;
    c.fill();
    rr(c, back, 3, 4, W - 6, 2); // rear window
    c.fill();
    rr(c, back + 4, 3, front - back - 4, W - 6, 2); // roof
    c.fillStyle = 'rgba(255,255,255,0.22)';
    c.fill();
    c.fillStyle = glass; // side windows, a thin dark band
    c.fillRect(back + 4, 2.2, front - back - 4, 1.1);
    c.fillRect(back + 4, W - 3.3, front - back - 4, 1.1);
  }
  // lights
  disc(c, '#fff6c8', L - 1.6, 3.6, 1.4);
  disc(c, '#fff6c8', L - 1.6, W - 3.6, 1.4);
  disc(c, '#d9302c', 1.2, 3.4, 1.1);
  disc(c, '#d9302c', 1.2, W - 3.4, 1.1);
  // mirrors
  c.fillStyle = color;
  c.fillRect(L - 17, -1.2, 2.2, 1.5);
  c.fillRect(L - 17, W - 0.3, 2.2, 1.5);
}

export const SHIRTS = ['#c0392b', '#2f6fd8', '#f4c20d', '#2d8f5a', '#8e44ad', '#f2f2f2', '#2b2f35', '#e07b2a', '#ff7ab8', '#1f8a8a'];
const HAIR = ['#2b1d12', '#5a3b1f', '#c9a15a', '#1a1a1a', '#9a9a9a', '#8a3a1a'];

/** A person seen from above, 10 x 10 canvas: shoulders in a shirt colour, a head of hair, facing right. */
export function drawWalker(c: Ctx, shirt: string, hairIndex: number): void {
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.45)';
  c.shadowBlur = 1 * c.getTransform().a;
  c.beginPath();
  c.ellipse(5, 5, 2.4, 3.6, 0, 0, Math.PI * 2);
  c.fillStyle = shirt;
  c.fill();
  c.restore();
  c.strokeStyle = 'rgba(0,0,0,0.5)';
  c.lineWidth = 0.4;
  c.stroke();
  disc(c, '#e8bf98', 5.8, 5, 1.55); // face side
  disc(c, HAIR[hairIndex % HAIR.length], 5.2, 5, 1.6);
}

/** A cyclist from above, 22 x 10: the bike's two wheels and frame, the rider's back and helmet. */
export function drawCyclist(c: Ctx, shirt: string): void {
  c.strokeStyle = '#2b2f35';
  c.lineCap = 'round';
  c.lineWidth = 1.4;
  c.beginPath();
  c.moveTo(2, 5);
  c.lineTo(8, 5);
  c.moveTo(14, 5);
  c.lineTo(20, 5);
  c.stroke(); // wheels seen edge-on
  c.lineWidth = 0.8;
  c.strokeStyle = '#8f969d';
  c.beginPath();
  c.moveTo(6, 5);
  c.lineTo(17, 5);
  c.moveTo(17, 3);
  c.lineTo(17, 7); // handlebar
  c.stroke();
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.4)';
  c.shadowBlur = 1 * c.getTransform().a;
  c.beginPath();
  c.ellipse(11, 5, 3.2, 2.6, 0, 0, Math.PI * 2);
  c.fillStyle = shirt;
  c.fill();
  c.restore();
  disc(c, '#f4f4f4', 13.6, 5, 1.6); // helmet
  disc(c, '#2f6fd8', 13.9, 5, 0.6);
}

/** A small dog from above, 10 x 6, facing right. */
export function drawDog(c: Ctx): void {
  c.beginPath();
  c.ellipse(4.5, 3, 3, 1.6, 0, 0, Math.PI * 2);
  c.fillStyle = '#9a6a3a';
  c.fill();
  disc(c, '#7a4e26', 8, 3, 1.3); // head
  c.strokeStyle = '#7a4e26';
  c.lineWidth = 0.6;
  c.beginPath();
  c.moveTo(1.6, 3);
  c.lineTo(0.3, 2.2); // tail
  c.stroke();
}

/** An angler sitting on the quay, 40 x 14: on a folding stool, the rod reaching out to the right over the water, a float. */
export function drawAngler(c: Ctx, shirt: string): void {
  disc(c, '#3a5a2a', 4, 7, 3.2); // green stool / bag
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.45)';
  c.shadowBlur = 1 * c.getTransform().a;
  c.beginPath();
  c.ellipse(6, 7, 2.6, 3.4, 0, 0, Math.PI * 2);
  c.fillStyle = shirt;
  c.fill();
  c.restore();
  disc(c, '#4a5a3a', 6.4, 7, 1.7); // a fishing hat
  disc(c, '#5d6e48', 6.4, 7, 1.0);
  c.strokeStyle = '#2b2f35';
  c.lineWidth = 0.7;
  c.beginPath();
  c.moveTo(7, 7);
  c.lineTo(32, 5);
  c.stroke(); // rod
  c.strokeStyle = 'rgba(255,255,255,0.7)';
  c.lineWidth = 0.3;
  c.beginPath();
  c.moveTo(32, 5);
  c.lineTo(37, 8);
  c.stroke(); // line
  disc(c, '#ff4d4d', 37, 8, 0.9); // float
  disc(c, '#ffffff', 37.3, 7.7, 0.4);
}
