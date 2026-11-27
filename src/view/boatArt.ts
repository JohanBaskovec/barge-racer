import type { BoatDef, BoatShape } from '../data/boats';

/**
 * The boats, drawn from above with the bow to the right, using the Canvas 2D API (curves,
 * gradients, soft shadows), in design units: the boat's game size, scaled up by the caller.
 *
 * Each boat is two layers:
 * - **paint**: the part that takes the racer's colour (usually the hull). Drawn in white and greys;
 *   the game tints it, so grey becomes a darker shade of the racer's colour.
 * - **detail**: everything else in its own colours, drawn over the paint (decks, cabins, cargo,
 *   people-sized clutter). Where the paint must show through something drawn on the detail layer
 *   (a roof on top of a hull), a hole is punched in the detail layer.
 *
 * Shading is symmetric about the centre line or soft and all-round, never from one side: the boats
 * turn in every direction, so a baked-in sun would spin with them.
 */

type Ctx = CanvasRenderingContext2D;

/** Space kept free around the hull so outlines and fenders aren't cut by the texture's edge. */
export const BOAT_ART_PAD = 1.5;

const rgb = (hex: number, a = 1): string => `rgba(${(hex >> 16) & 255},${(hex >> 8) & 255},${hex & 255},${a})`;

/** Tiny deterministic random, so scattered details (coal lumps, flowers) are the same every time. */
function rand(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

function fillRR(c: Ctx, color: string, x: number, y: number, w: number, h: number, r: number): void {
  rr(c, x, y, w, h, r);
  c.fillStyle = color;
  c.fill();
}

function strokeRR(c: Ctx, color: string, lw: number, x: number, y: number, w: number, h: number, r: number): void {
  rr(c, x, y, w, h, r);
  c.strokeStyle = color;
  c.lineWidth = lw;
  c.stroke();
}

function disc(c: Ctx, color: string, x: number, y: number, r: number): void {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = color;
  c.fill();
}

function ring(c: Ctx, color: string, x: number, y: number, r: number, lw: number): void {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.strokeStyle = color;
  c.lineWidth = lw;
  c.stroke();
}

function line(c: Ctx, color: string, lw: number, x0: number, y0: number, x1: number, y1: number): void {
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x1, y1);
  c.strokeStyle = color;
  c.lineWidth = lw;
  c.lineCap = 'round';
  c.stroke();
}

/** Run `draw` with a soft all-round shadow under what it fills (things standing on a deck). */
function raised(c: Ctx, blur: number, alpha: number, draw: () => void): void {
  c.save();
  const scale = c.getTransform().a; // shadow sizes are in canvas pixels, not design units
  c.shadowColor = `rgba(0,0,0,${alpha})`;
  c.shadowBlur = blur * scale;
  draw();
  c.restore();
}

/** Erase what's inside the current path from the layer, so the paint layer shows through. */
function punch(c: Ctx): void {
  c.save();
  c.globalCompositeOperation = 'destination-out';
  c.fillStyle = '#000';
  c.fill();
  c.restore();
}

interface HullShape {
  /** Length of the curved bow. */
  bow: number;
  /** Half-width of the flat tip of the bow (0 = pointed). */
  tip: number;
  /** Corner radius at the stern. */
  stern: number;
  /** How full the bow is: 0.5 = fine, 0.9 = bluff. */
  full?: number;
}

/** The outline of a hull as the current path, `inset` design units inside the L x W box. */
function hullPath(c: Ctx, L: number, W: number, s: HullShape, inset = 0): void {
  const x0 = inset, x1 = L - inset, y0 = inset, y1 = W - inset, mid = W / 2;
  const tip = Math.max(0, s.tip - inset * 0.5);
  const xb = Math.max(x0 + 1, L - s.bow);
  const sr = Math.max(0.1, Math.min(s.stern - inset * 0.4, (y1 - y0) / 2));
  const f = s.full ?? 0.6;
  c.beginPath();
  c.moveTo(x0 + sr, y0);
  c.lineTo(xb, y0);
  c.bezierCurveTo(xb + (x1 - xb) * f, y0, x1, mid - tip - (mid - tip - y0) * (1 - f) * 0.9, x1, mid - tip);
  c.lineTo(x1, mid + tip);
  c.bezierCurveTo(x1, mid + tip + (y1 - mid - tip) * (1 - f) * 0.9, xb + (x1 - xb) * f, y1, xb, y1);
  c.lineTo(x0 + sr, y1);
  c.quadraticCurveTo(x0, y1, x0, y1 - sr);
  c.lineTo(x0, y0 + sr);
  c.quadraticCurveTo(x0, y0, x0 + sr, y0);
  c.closePath();
}

/** The painted hull: white, darker towards both sides so it reads as rounded once tinted. */
function paintHull(p: Ctx, L: number, W: number, s: HullShape, edge = 0.32): void {
  hullPath(p, L, W, s);
  p.fillStyle = '#ffffff';
  p.fill();
  p.save();
  p.clip();
  const g = p.createLinearGradient(0, 0, 0, W);
  g.addColorStop(0, `rgba(0,0,0,${edge})`);
  g.addColorStop(0.2, 'rgba(0,0,0,0)');
  g.addColorStop(0.8, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${edge})`);
  p.fillStyle = g;
  p.fillRect(0, 0, L, W);
  p.restore();
}

/** A dark outline round the hull and a thin light line just inside it (the gunwale catching light). */
function outlineHull(d: Ctx, L: number, W: number, s: HullShape): void {
  hullPath(d, L, W, s);
  d.strokeStyle = 'rgba(12,18,28,0.9)';
  d.lineWidth = 1;
  d.stroke();
  hullPath(d, L, W, s, 1.1);
  d.strokeStyle = 'rgba(255,255,255,0.35)';
  d.lineWidth = 0.45;
  d.stroke();
}

/** A fill that is lighter along the centre line, for roofs and decks (symmetric, so it turns well). */
function crowned(c: Ctx, y0: number, y1: number, edge: number, centre: number): CanvasGradient {
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, rgb(edge));
  g.addColorStop(0.5, rgb(centre));
  g.addColorStop(1, rgb(edge));
  return g;
}

/** An old tyre hung over the side as a fender. */
function tyre(d: Ctx, x: number, y: number, r = 1.9): void {
  ring(d, '#17181b', x, y, r, r * 0.75);
  ring(d, 'rgba(255,255,255,0.18)', x, y, r, 0.25);
}

/** A coil of rope lying on deck. */
function ropeCoil(d: Ctx, x: number, y: number, r: number, color = 0xcdb27a): void {
  for (let k = r; k > 0.5; k -= 0.85) ring(d, rgb(color, 0.95), x, y, k, 0.5);
  ring(d, 'rgba(60,40,10,0.5)', x, y, r + 0.25, 0.25);
}

/** A mooring bollard: a pair of steel posts. */
function bollard(d: Ctx, x: number, y: number): void {
  raised(d, 0.8, 0.5, () => {
    disc(d, '#3b4048', x - 0.9, y, 0.95);
    disc(d, '#3b4048', x + 0.9, y, 0.95);
  });
  disc(d, '#9aa3ad', x - 0.9, y - 0.2, 0.4);
  disc(d, '#9aa3ad', x + 0.9, y - 0.2, 0.4);
}

/** A life ring: orange with white bands. */
function lifeRing(d: Ctx, x: number, y: number, r = 2): void {
  ring(d, '#f26a1b', x, y, r, r * 0.55);
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + Math.PI / 4;
    d.beginPath();
    d.arc(x, y, r, a - 0.22, a + 0.22);
    d.strokeStyle = '#ffffff';
    d.lineWidth = r * 0.55;
    d.stroke();
  }
}

/** A row of cabin windows seen from above: a dark glazed band with a glint. */
function glass(d: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const g = d.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, '#1b2a3d');
  g.addColorStop(0.5, '#35587a');
  g.addColorStop(1, '#16202e');
  rr(d, x, y, w, h, r);
  d.fillStyle = g;
  d.fill();
  d.strokeStyle = 'rgba(255,255,255,0.45)';
  d.lineWidth = 0.25;
  d.stroke();
}

// ------------------------------------------------------------------------------------------ boats

/** Coal Barge: a blunt steel barge, its open hold heaped with coal, a small wheelhouse at the stern. */
function coalBarge(p: Ctx, d: Ctx, L: number, W: number): void {
  const s: HullShape = { bow: 15, tip: 7, stern: 5, full: 0.85 };
  paintHull(p, L, W, s);

  // Steel deck inside the broad painted gunwale
  hullPath(d, L, W, s, 3.3);
  d.fillStyle = crowned(d, 0, W, 0x2a2f37, 0x3c434d);
  d.fill();
  d.strokeStyle = 'rgba(0,0,0,0.55)';
  d.lineWidth = 0.4;
  d.stroke();

  // Hold: a pale steel coaming round a heap of coal
  const hx = 23, hw = L - 23 - 19, hy = 6.2, hh = W - 12.4;
  raised(d, 1.2, 0.55, () => fillRR(d, '#9299a3', hx - 1.3, hy - 1.3, hw + 2.6, hh + 2.6, 2.6));
  fillRR(d, '#0f1114', hx, hy, hw, hh, 1.6);
  d.save();
  rr(d, hx, hy, hw, hh, 1.6);
  d.clip();
  // mounds
  for (const [mx, my, mr] of [[hx + hw * 0.2, W / 2 - 1, 10], [hx + hw * 0.52, W / 2 + 1.5, 11.5], [hx + hw * 0.82, W / 2 - 0.5, 9.5]] as const) {
    const g = d.createRadialGradient(mx, my, 0.5, mx, my, mr);
    g.addColorStop(0, 'rgba(78,84,94,0.95)');
    g.addColorStop(0.55, 'rgba(38,42,49,0.9)');
    g.addColorStop(1, 'rgba(15,17,20,0)');
    d.fillStyle = g;
    d.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
  }
  // lumps, some catching the light
  const r = rand(11);
  for (let i = 0; i < 230; i++) {
    const x = hx + r() * hw, y = hy + r() * hh, k = 0.5 + r() * 0.9;
    const shade = r();
    d.fillStyle = shade > 0.86 ? 'rgba(150,158,170,0.85)' : shade > 0.5 ? 'rgba(58,63,72,0.95)' : 'rgba(8,9,11,0.95)';
    d.beginPath();
    d.moveTo(x - k, y);
    d.lineTo(x - k * 0.2, y - k * 0.8);
    d.lineTo(x + k, y - k * 0.1);
    d.lineTo(x + k * 0.3, y + k * 0.8);
    d.closePath();
    d.fill();
  }
  d.restore();
  // cross beams over the hold
  for (const t of [0.34, 0.67]) {
    raised(d, 0.6, 0.6, () => {
      d.fillStyle = '#7b828c';
      d.fillRect(hx + hw * t - 0.6, hy - 1.3, 1.2, hh + 2.6);
    });
  }

  // Wheelhouse at the stern: white roof, a dark window band facing forward
  raised(d, 1.6, 0.6, () => fillRR(d, '#dfe3e8', 5, 7.5, 13.5, W - 15, 2));
  // its roof is in the racer's colour
  rr(d, 6.2, 8.7, 10.6, W - 17.4, 1.4);
  punch(d);
  strokeRR(d, 'rgba(0,0,0,0.35)', 0.3, 6.2, 8.7, 10.6, W - 17.4, 1.4);
  strokeRR(d, 'rgba(255,255,255,0.4)', 0.3, 6.9, 9.4, 9.2, W - 18.8, 1);
  glass(d, 17.2, 9, 1.6, W - 18, 0.6);
  lifeRing(d, 9, W / 2 - 4.2, 1.7);
  disc(d, '#24272c', 12.5, W / 2 + 4, 1.5); // exhaust stack
  disc(d, '#07080a', 12.5, W / 2 + 4, 0.9);
  fillRR(d, '#8a929c', 8, W / 2 + 0.6, 4.6, 0.9, 0.4); // radar bar
  disc(d, '#c7ccd3', 10.3, W / 2 + 1.05, 0.75);

  // Bow: winch, bollards, a coil of rope
  raised(d, 0.8, 0.5, () => fillRR(d, '#596069', L - 15.5, W / 2 - 2.6, 4.2, 5.2, 0.8));
  line(d, '#aeb5bd', 0.5, L - 14.6, W / 2 - 1.4, L - 12.2, W / 2 - 1.4);
  line(d, '#aeb5bd', 0.5, L - 14.6, W / 2, L - 12.2, W / 2);
  line(d, '#aeb5bd', 0.5, L - 14.6, W / 2 + 1.4, L - 12.2, W / 2 + 1.4);
  bollard(d, L - 8.5, 8);
  bollard(d, L - 8.5, W - 8);
  ropeCoil(d, L - 6.2, W / 2, 2.2);

  outlineHull(d, L, W, s);
  for (const x of [30, 52, 74]) {
    tyre(d, x, 0.4);
    tyre(d, x, W - 0.4);
  }
}

/** Tugboat: short and round, ringed with a fat rubber fender and tyres, a tall wheelhouse and a funnel. */
function tug(p: Ctx, d: Ctx, L: number, W: number): void {
  const s: HullShape = { bow: 30, tip: 3, stern: 15, full: 0.72 };
  paintHull(p, L, W, s, 0.25);

  // Rubber fender all round
  hullPath(d, L, W, s, 1.2);
  d.strokeStyle = '#15171a';
  d.lineWidth = 2.6;
  d.stroke();
  hullPath(d, L, W, s, 0.5);
  d.strokeStyle = 'rgba(255,255,255,0.22)';
  d.lineWidth = 0.3;
  d.stroke();

  // Deck: painted like the hull, a shade darker, with a pale line round its edge
  hullPath(d, L, W, s, 4.6);
  d.fillStyle = 'rgba(0,0,0,0.2)';
  d.fill();
  d.strokeStyle = 'rgba(0,0,0,0.55)';
  d.lineWidth = 0.35;
  d.stroke();
  hullPath(d, L, W, s, 5.6);
  d.strokeStyle = 'rgba(255,255,255,0.3)';
  d.lineWidth = 0.35;
  d.stroke();

  // Aft deck: towing winch with its cable, the H-bitt, a coil of rope
  raised(d, 1, 0.55, () => fillRR(d, '#4d545d', 9, W / 2 - 4.2, 6.2, 8.4, 1));
  for (let k = 0; k < 6; k++) line(d, '#b9bfc7', 0.45, 10, W / 2 - 3.2 + k * 1.28, 14.2, W / 2 - 3.2 + k * 1.28);
  line(d, '#8f969f', 0.5, 9, W / 2, 4.2, W / 2);
  raised(d, 0.6, 0.5, () => {
    fillRR(d, '#2f343b', 4.4, W / 2 - 3.4, 1.2, 6.8, 0.5);
  });
  ropeCoil(d, 12.5, 9.4, 2.3);
  bollard(d, 12, W - 8.8);

  // Wheelhouse, forward of midships, with windows all round the front
  const cx = 26, cw = 19, cy = 8, ch = W - 16;
  raised(d, 2, 0.6, () => fillRR(d, '#cfd5db', cx, cy, cw, ch, 5));
  glass(d, cx + cw - 5.2, cy + 1.4, 4.2, ch - 2.8, 2.2);
  glass(d, cx + 3, cy + 0.5, cw - 9, 1.2, 0.5);
  glass(d, cx + 3, cy + ch - 1.7, cw - 9, 1.2, 0.5);
  rr(d, cx + 1.4, cy + 2.2, cw - 7.6, ch - 4.4, 3.2);
  d.fillStyle = crowned(d, cy + 2, cy + ch - 2, 0xdfe4e9, 0xffffff);
  d.fill();
  d.strokeStyle = 'rgba(0,0,0,0.25)';
  d.lineWidth = 0.3;
  d.stroke();
  // on the roof: searchlight, radar, horn
  raised(d, 0.6, 0.5, () => disc(d, '#30353c', cx + 9.2, W / 2 - 3.6, 1.5));
  disc(d, '#fff4c2', cx + 9.6, W / 2 - 3.6, 0.85);
  raised(d, 0.5, 0.5, () => fillRR(d, '#7f8892', cx + 3.6, W / 2 + 2.6, 6.6, 1, 0.5));
  disc(d, '#c9ced5', cx + 6.9, W / 2 + 3.1, 0.9);
  // Funnel behind the wheelhouse: black top, a yellow band
  raised(d, 1.6, 0.6, () => {
    d.beginPath();
    d.ellipse(21.5, W / 2, 4.4, 5.2, 0, 0, Math.PI * 2);
    d.fillStyle = '#e2ad2f';
    d.fill();
  });
  d.beginPath();
  d.ellipse(21.5, W / 2, 3.4, 4.2, 0, 0, Math.PI * 2);
  d.fillStyle = '#1d2024';
  d.fill();
  d.beginPath();
  d.ellipse(21.5, W / 2, 2.2, 2.9, 0, 0, Math.PI * 2);
  d.fillStyle = '#050607';
  d.fill();

  // Foredeck: bitts and anchor chain
  bollard(d, L - 12.5, W / 2);
  line(d, '#8f969f', 0.5, L - 10.6, W / 2, L - 5.4, W / 2);

  hullPath(d, L, W, s);
  d.strokeStyle = 'rgba(8,10,14,0.9)';
  d.lineWidth = 0.9;
  d.stroke();
  // Tyres round the bow and along the sides
  for (const [x, y] of [[L - 1.2, W / 2], [L - 4.4, 6.6], [L - 4.4, W - 6.6], [L - 12, 1.8], [L - 12, W - 1.8], [L - 26, 0.3], [L - 26, W - 0.3], [16, 0.9], [16, W - 0.9]] as const) tyre(d, x, y, 2);
}

/** Narrowboat: a long painted cabin with flowers, a chimney and a solar panel on the roof; tiller at the stern. */
function narrowboat(p: Ctx, d: Ctx, L: number, W: number): void {
  const s: HullShape = { bow: 15, tip: 1.2, stern: 9.5, full: 0.62 };
  // The roof takes the racer's colour (a boatman's pride); hull and decks are painted on the detail layer.
  const rx = 15.5, rw = L - 15.5 - 16.5, ry = 3.1, rh = W - 6.2;
  rr(p, rx, ry, rw, rh, 1.8);
  p.fillStyle = '#ffffff';
  p.fill();
  p.save();
  p.clip();
  const g = p.createLinearGradient(0, ry, 0, ry + rh);
  g.addColorStop(0, 'rgba(0,0,0,0.3)');
  g.addColorStop(0.22, 'rgba(0,0,0,0)');
  g.addColorStop(0.78, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.3)');
  p.fillStyle = g;
  p.fillRect(rx, ry, rw, rh);
  p.restore();

  // Black hull with a cream gunwale line
  hullPath(d, L, W, s);
  d.fillStyle = '#14171c';
  d.fill();
  hullPath(d, L, W, s, 1.5);
  d.strokeStyle = '#efe2b8';
  d.lineWidth = 0.55;
  d.stroke();
  hullPath(d, L, W, s, 2.1);
  d.fillStyle = '#2a3038';
  d.fill();

  // Well deck at the bow: planks, a dark cratch cover, the gas locker lid
  d.save();
  hullPath(d, L, W, s, 2.4);
  d.clip();
  d.fillStyle = '#b78752';
  d.fillRect(L - 17, 0, 17, W);
  for (let y = 3; y < W - 2; y += 1.7) line(d, 'rgba(90,58,26,0.55)', 0.25, L - 17, y, L, y);
  d.restore();
  d.beginPath();
  d.moveTo(L - 16.5, 3.4);
  d.lineTo(L - 9.5, W / 2 - 1.4);
  d.lineTo(L - 9.5, W / 2 + 1.4);
  d.lineTo(L - 16.5, W - 3.4);
  d.closePath();
  d.fillStyle = '#26323f';
  d.fill();
  line(d, 'rgba(255,255,255,0.25)', 0.3, L - 16.4, W / 2, L - 9.6, W / 2);
  fillRR(d, '#7b1f1f', L - 6.2, W / 2 - 1.5, 3, 3, 0.7);
  disc(d, '#d9b54a', L - 4.7, W / 2, 0.45);

  // Stern: semi-circular counter, wooden deck boards, the tiller
  d.save();
  hullPath(d, L, W, s, 2.4);
  d.clip();
  d.fillStyle = '#8d6238';
  d.fillRect(0, 0, 15.5, W);
  for (let x = 2; x < 15; x += 1.8) line(d, 'rgba(60,36,14,0.5)', 0.25, x, 0, x, W);
  d.restore();
  raised(d, 0.6, 0.5, () => line(d, '#f1f1ee', 0.9, 2.2, W / 2, 10.4, W / 2));
  for (let k = 0; k < 3; k++) line(d, '#c2302c', 0.9, 4 + k * 2.2, W / 2, 4.9 + k * 2.2, W / 2);
  disc(d, '#d9b54a', 10.6, W / 2, 0.75);

  // Cabin: punch the roof out so the racer's colour shows, then lay things on it
  raised(d, 1.4, 0.65, () => fillRR(d, '#0f1216', rx - 0.5, ry - 0.5, rw + 1, rh + 1, 2.2));
  rr(d, rx, ry, rw, rh, 1.8);
  punch(d);
  // handrails, and the cream side panels showing at the edges
  strokeRR(d, 'rgba(255,255,255,0.55)', 0.35, rx + 1, ry + 0.9, rw - 2, rh - 1.8, 1.2);
  strokeRR(d, 'rgba(0,0,0,0.5)', 0.35, rx, ry, rw, rh, 1.8);
  // sliding hatch at the stern end
  raised(d, 0.6, 0.4, () => fillRR(d, '#3a2a1c', rx + 1.4, W / 2 - 3.4, 6.4, 6.8, 0.8));
  line(d, 'rgba(255,255,255,0.2)', 0.25, rx + 2.2, W / 2 - 2.2, rx + 7, W / 2 - 2.2);
  // chimney with a brass band
  raised(d, 0.8, 0.6, () => disc(d, '#17191c', rx + 13, ry + 3.2, 1.5));
  ring(d, '#d9b54a', rx + 13, ry + 3.2, 1.05, 0.35);
  disc(d, '#050506', rx + 13, ry + 3.2, 0.6);
  // mushroom vents
  for (const x of [rx + 20, rx + 44]) {
    raised(d, 0.5, 0.5, () => disc(d, '#d9b54a', x, W / 2, 1.05));
    disc(d, '#fff0b0', x - 0.3, W / 2 - 0.3, 0.35);
  }
  // planters full of flowers
  const r = rand(5);
  for (const [x, y, w] of [[rx + 24, ry + 1.6, 9], [rx + 24, ry + rh - 4.4, 9], [rx + 48, ry + 1.6, 7]] as const) {
    raised(d, 0.6, 0.5, () => fillRR(d, '#6a4526', x, y, w, 2.8, 0.6));
    fillRR(d, '#3e7a35', x + 0.4, y + 0.4, w - 0.8, 2, 0.5);
    for (let i = 0; i < w * 1.6; i++) disc(d, ['#ff5d73', '#ffd23f', '#ffffff', '#ff8fc7'][Math.floor(r() * 4)], x + 0.8 + r() * (w - 1.6), y + 0.7 + r() * 1.4, 0.42);
  }
  // solar panel
  raised(d, 0.6, 0.5, () => fillRR(d, '#182a4a', rx + 34, W / 2 - 3.4, 8.5, 6.8, 0.5));
  d.strokeStyle = 'rgba(140,180,255,0.55)';
  d.lineWidth = 0.2;
  for (let k = 1; k < 4; k++) {
    d.beginPath();
    d.moveTo(rx + 34 + k * 2.125, W / 2 - 3.4);
    d.lineTo(rx + 34 + k * 2.125, W / 2 + 3.4);
    d.stroke();
  }
  line(d, 'rgba(140,180,255,0.55)', 0.2, rx + 34, W / 2, rx + 42.5, W / 2);
  // life ring, boat pole and plank
  lifeRing(d, rx + rw - 5.5, W / 2, 1.9);
  line(d, '#c9a56a', 0.6, rx + 46, ry + rh - 2.4, rx + rw - 9, ry + rh - 2.4);
  line(d, '#9c7a48', 0.9, rx + 9, ry + rh - 1.9, rx + 21, ry + rh - 1.9);

  hullPath(d, L, W, s);
  d.strokeStyle = 'rgba(0,0,0,0.9)';
  d.lineWidth = 0.8;
  d.stroke();
  tyre(d, 30, 0.3, 1.4);
  tyre(d, 62, W - 0.3, 1.4);
}

/** Cigarette speedboat: a long needle of a hull, racing stripes, a small cockpit and two big outboards. */
function speedboat(p: Ctx, d: Ctx, L: number, W: number): void {
  const s: HullShape = { bow: 46, tip: 0.4, stern: 2.2, full: 0.55 };
  paintHull(p, L, W, s, 0.38);

  // Twin outboards hanging off the transom
  for (const y of [W / 2 - 4.6, W / 2 + 4.6]) {
    raised(d, 0.8, 0.5, () => fillRR(d, '#15171b', -1.2, y - 2.6, 6.4, 5.2, 1.6));
    fillRR(d, '#3d434c', 0.2, y - 1.5, 3.6, 3, 1);
    line(d, '#e23b3b', 0.5, 0.6, y - 2, 3.6, y - 2);
  }

  // Racing stripes down the foredeck, converging on the bow
  d.save();
  hullPath(d, L, W, s, 1.2);
  d.clip();
  for (const [off, w, a] of [[0, 3.4, 0.95], [3.3, 0.8, 0.9]] as const) {
    for (const sign of off ? [-1, 1] : [1]) {
      d.beginPath();
      d.moveTo(48, W / 2 + sign * off - w / 2);
      d.lineTo(L, W / 2 + sign * off * 0.1 - w * 0.12);
      d.lineTo(L, W / 2 + sign * off * 0.1 + w * 0.12);
      d.lineTo(48, W / 2 + sign * off + w / 2);
      d.closePath();
      d.fillStyle = `rgba(255,255,255,${a})`;
      d.fill();
    }
  }
  // glossy highlight along the centre of the foredeck
  const hl = d.createLinearGradient(0, W / 2 - 5, 0, W / 2 + 5);
  hl.addColorStop(0, 'rgba(255,255,255,0)');
  hl.addColorStop(0.5, 'rgba(255,255,255,0.16)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  d.fillStyle = hl;
  d.fillRect(46, 0, L, W);
  d.restore();

  // Engine hatch with louvres
  raised(d, 0.8, 0.45, () => fillRR(d, '#e9ecef', 6.5, 4.2, 14, W - 8.4, 1.6));
  for (let x = 9; x < 19; x += 1.7) {
    line(d, 'rgba(0,0,0,0.45)', 0.4, x, 6.2, x, W / 2 - 1.2);
    line(d, 'rgba(0,0,0,0.45)', 0.4, x, W / 2 + 1.2, x, W - 6.2);
  }

  // Cockpit: dark tub, two bucket seats, a bench, wheel and dash, under a wrap-round windscreen
  fillRR(d, '#111419', 22, 3.6, 24, W - 7.2, 3.2);
  strokeRR(d, 'rgba(255,255,255,0.3)', 0.3, 22, 3.6, 24, W - 7.2, 3.2);
  fillRR(d, '#f1ebdc', 23.4, 5.2, 4.6, W - 10.4, 1.2); // bench
  line(d, '#c0392b', 0.4, 25.7, 5.6, 25.7, W - 5.6);
  for (const y of [W / 2 - 4.7, W / 2 + 4.7]) {
    raised(d, 0.5, 0.5, () => fillRR(d, '#f1ebdc', 31, y - 2.5, 6.4, 5, 1.6));
    fillRR(d, '#c0392b', 31, y - 2.5, 1.5, 5, 0.7);
  }
  fillRR(d, '#2b3038', 41, 5, 2.6, W - 10, 1); // dash
  ring(d, '#d8dde3', 39.6, W / 2 - 4.7, 1.5, 0.45); // wheel
  // windscreen
  d.beginPath();
  d.moveTo(43.2, 3.2);
  d.quadraticCurveTo(51.5, W / 2, 43.2, W - 3.2);
  d.quadraticCurveTo(47.2, W / 2, 43.2, 3.2);
  d.closePath();
  d.fillStyle = 'rgba(150,215,255,0.6)';
  d.fill();
  d.strokeStyle = 'rgba(255,255,255,0.85)';
  d.lineWidth = 0.35;
  d.stroke();

  // Chrome: cleats and the bow rail
  for (const [x, y] of [[62, 4.4], [62, W - 4.4], [10, 2.6], [10, W - 2.6]] as const) fillRR(d, '#e6eaee', x, y - 0.45, 2.2, 0.9, 0.4);
  disc(d, '#e6eaee', L - 4, W / 2, 0.7);

  hullPath(d, L, W, s);
  d.strokeStyle = 'rgba(10,14,22,0.9)';
  d.lineWidth = 0.9;
  d.stroke();
  hullPath(d, L, W, s, 1.2);
  d.strokeStyle = 'rgba(255,255,255,0.4)';
  d.lineWidth = 0.4;
  d.stroke();
}

/** Party pontoon: two aluminium tubes under a wide deck with sofas, a table of drinks, fairy lights and a striped canopy. */
function pontoon(p: Ctx, d: Ctx, L: number, W: number): void {
  // The canopy takes the racer's colour.
  const kx = 13, kw = 27, ky = 5.2, kh = W - 10.4;
  rr(p, kx, ky, kw, kh, 2.4);
  p.fillStyle = '#ffffff';
  p.fill();
  p.save();
  p.clip();
  const pg = p.createLinearGradient(kx, 0, kx + kw, 0);
  pg.addColorStop(0, 'rgba(0,0,0,0.26)');
  pg.addColorStop(0.5, 'rgba(0,0,0,0)');
  pg.addColorStop(1, 'rgba(0,0,0,0.26)');
  p.fillStyle = pg;
  p.fillRect(kx, ky, kw, kh);
  p.restore();

  // Tubes: brushed aluminium, pointed at the bow
  for (const y0 of [0, W - 11.5]) {
    d.beginPath();
    d.moveTo(2.5, y0);
    d.lineTo(L - 9, y0);
    d.quadraticCurveTo(L, y0 + 2, L, y0 + 5.75);
    d.quadraticCurveTo(L, y0 + 9.5, L - 9, y0 + 11.5);
    d.lineTo(2.5, y0 + 11.5);
    d.quadraticCurveTo(0, y0 + 11.5, 0, y0 + 9);
    d.lineTo(0, y0 + 2.5);
    d.quadraticCurveTo(0, y0, 2.5, y0);
    d.closePath();
    const g = d.createLinearGradient(0, y0, 0, y0 + 11.5);
    g.addColorStop(0, '#6f7780');
    g.addColorStop(0.35, '#dfe4e9');
    g.addColorStop(0.6, '#aab2bb');
    g.addColorStop(1, '#59616a');
    d.fillStyle = g;
    d.fill();
    d.strokeStyle = 'rgba(10,14,20,0.85)';
    d.lineWidth = 0.7;
    d.stroke();
  }
  // Outboard at the stern
  raised(d, 0.8, 0.5, () => fillRR(d, '#16181c', -1, W / 2 - 3.2, 6, 6.4, 1.8));
  fillRR(d, '#3d434c', 0.4, W / 2 - 1.8, 3.2, 3.6, 1);

  // Deck
  const dx = 3.5, dw = L - 9.5, dy = 3.4, dh = W - 6.8;
  raised(d, 1.4, 0.55, () => fillRR(d, '#cdbb93', dx, dy, dw, dh, 3));
  d.save();
  rr(d, dx, dy, dw, dh, 3);
  d.clip();
  d.fillStyle = crowned(d, dy, dy + dh, 0xc9b78e, 0xe3d5b3);
  d.fillRect(dx, dy, dw, dh);
  for (let x = dx + 2.4; x < dx + dw; x += 2.4) line(d, 'rgba(110,84,44,0.4)', 0.22, x, dy, x, dy + dh);
  d.restore();
  // rail with a gap at the stern gate
  strokeRR(d, '#f4f6f8', 0.55, dx + 1, dy + 1, dw - 2, dh - 2, 2.2);
  strokeRR(d, 'rgba(0,0,0,0.35)', 0.2, dx + 0.6, dy + 0.6, dw - 1.2, dh - 1.2, 2.5);

  // Bow lounge: an L-shaped sofa round a table of drinks
  const sofa = '#f3f0e8';
  raised(d, 0.8, 0.5, () => {
    fillRR(d, sofa, dx + dw - 7.2, dy + 2.4, 5, dh - 4.8, 1.6);
    fillRR(d, sofa, dx + dw - 18, dy + 2.4, 12, 4.6, 1.6);
    fillRR(d, sofa, dx + dw - 18, dy + dh - 7, 12, 4.6, 1.6);
  });
  for (let k = 0; k < 4; k++) line(d, 'rgba(0,0,0,0.18)', 0.25, dx + dw - 7.2, dy + 2.4 + ((dh - 4.8) * (k + 1)) / 5, dx + dw - 2.2, dy + 2.4 + ((dh - 4.8) * (k + 1)) / 5);
  for (const y of [dy + 2.4, dy + dh - 7]) for (let k = 1; k < 3; k++) line(d, 'rgba(0,0,0,0.18)', 0.25, dx + dw - 18 + k * 4, y, dx + dw - 18 + k * 4, y + 4.6);
  for (const [x, y, col] of [[dx + dw - 15, dy + 4.7, '#ff7a59'], [dx + dw - 10.5, dy + dh - 4.7, '#4db6ff'], [dx + dw - 4.7, W / 2, '#ffd23f']] as const) fillRR(d, col, x - 1.3, y - 1.3, 2.6, 2.6, 0.8); // cushions
  raised(d, 0.8, 0.5, () => disc(d, '#8a5a34', dx + dw - 13, W / 2, 4));
  ring(d, '#a8733f', dx + dw - 13, W / 2, 3.4, 0.4);
  for (const [ox, oy, col] of [[-1.6, -1.2, '#ff4d6d'], [1.4, -1.6, '#7ee081'], [1.7, 1.3, '#ffd23f'], [-1.2, 1.6, '#63c7ff'], [0.1, 0, '#ffffff']] as const) {
    disc(d, 'rgba(0,0,0,0.3)', dx + dw - 13 + ox + 0.15, W / 2 + oy + 0.2, 0.75);
    disc(d, col, dx + dw - 13 + ox, W / 2 + oy, 0.7);
  }

  // Aft: a cooler, the barbecue, the helm
  raised(d, 0.6, 0.5, () => fillRR(d, '#2f7fd6', dx + 2.6, dy + 2.6, 5.2, 3.6, 0.8));
  fillRR(d, '#f4f6f8', dx + 2.6, dy + 2.6, 5.2, 1.1, 0.5);
  raised(d, 0.6, 0.5, () => disc(d, '#1c1e22', dx + 5.2, dy + dh - 4.6, 2.3));
  ring(d, '#5c636c', dx + 5.2, dy + dh - 4.6, 1.5, 0.3);
  for (const [ox, oy] of [[-0.6, -0.4], [0.6, 0.2], [-0.1, 0.8]] as const) disc(d, '#b5532a', dx + 5.2 + ox, dy + dh - 4.6 + oy, 0.45);

  // Canopy: cut the detail away so the racer's colour shows, then stripes and the frame
  raised(d, 1.8, 0.6, () => fillRR(d, '#20242a', kx - 0.4, ky - 0.4, kw + 0.8, kh + 0.8, 2.8));
  rr(d, kx, ky, kw, kh, 2.4);
  punch(d);
  d.save();
  rr(d, kx, ky, kw, kh, 2.4);
  d.clip();
  for (let x = kx + 3.4; x < kx + kw; x += 6.8) {
    d.fillStyle = 'rgba(255,255,255,0.82)';
    d.fillRect(x, ky, 3.4, kh);
  }
  d.restore();
  for (const x of [kx + kw * 0.33, kx + kw * 0.67]) line(d, 'rgba(0,0,0,0.3)', 0.4, x, ky + 0.5, x, ky + kh - 0.5);
  strokeRR(d, 'rgba(0,0,0,0.55)', 0.4, kx, ky, kw, kh, 2.4);

  // Fairy lights along both rails
  const cols = ['#ff4d6d', '#ffd23f', '#7ee081', '#63c7ff', '#ff9ff3'];
  for (let k = 0; k < 13; k++) {
    const x = dx + 3 + (k * (dw - 6)) / 12;
    for (const y of [dy + 1, dy + dh - 1]) {
      disc(d, 'rgba(255,255,255,0.35)', x, y, 1.05);
      disc(d, cols[k % cols.length], x, y, 0.6);
    }
  }
}

/** Fire boat: a sturdy hull with a white wheelhouse, a blue beacon, hose reels and water cannons fore and aft. */
function fireboat(p: Ctx, d: Ctx, L: number, W: number): void {
  const s: HullShape = { bow: 27, tip: 1.6, stern: 4.5, full: 0.68 };
  paintHull(p, L, W, s);

  // Black rubbing strake, then a grey non-slip deck
  hullPath(d, L, W, s, 0.9);
  d.strokeStyle = '#191b1f';
  d.lineWidth = 0.9;
  d.stroke();
  hullPath(d, L, W, s, 4.3);
  d.fillStyle = crowned(d, 4, W - 4, 0x808890, 0xa2aab2);
  d.fill();
  d.strokeStyle = 'rgba(0,0,0,0.45)';
  d.lineWidth = 0.35;
  d.stroke();
  // hazard stripes across the stern
  d.save();
  hullPath(d, L, W, s, 4.5);
  d.clip();
  for (let y = -4; y < W + 4; y += 3) {
    d.beginPath();
    d.moveTo(4.4, y);
    d.lineTo(7.2, y + 1.5);
    d.lineTo(7.2, y + 3);
    d.lineTo(4.4, y + 1.5);
    d.closePath();
    d.fillStyle = '#f4c20d';
    d.fill();
  }
  d.restore();

  // A water cannon: a round base, a barrel pointing forward
  const monitor = (x: number, y: number, k: number): void => {
    raised(d, 0.8, 0.55, () => disc(d, '#b3261e', x, y, 2 * k));
    ring(d, '#e3564d', x, y, 1.45 * k, 0.35);
    raised(d, 0.5, 0.5, () => line(d, '#c9ced5', 1.15 * k, x, y, x + 5 * k, y));
    line(d, '#8b929b', 1.5 * k, x + 4.6 * k, y, x + 5.6 * k, y);
    disc(d, '#2a2d33', x, y, 0.7 * k);
  };

  // Aft deck: two hose reels and the pump housing
  for (const y of [W / 2 - 5.6, W / 2 + 5.6]) {
    raised(d, 0.8, 0.5, () => disc(d, '#b3261e', 14, y, 3.4));
    for (let k = 2.7; k > 0.9; k -= 0.75) ring(d, '#ecd08a', 14, y, k, 0.42);
    disc(d, '#5c636c', 14, y, 0.8);
  }
  raised(d, 1, 0.5, () => fillRR(d, '#b3261e', 20, W / 2 - 4.6, 9, 9.2, 1.2));
  fillRR(d, '#d7473d', 21, W / 2 - 3.6, 7, 7.2, 0.8);
  for (const y of [W / 2 - 1.8, W / 2, W / 2 + 1.8]) line(d, 'rgba(0,0,0,0.4)', 0.35, 22, y, 27, y);
  monitor(8.2, W / 2, 0.85);

  // Wheelhouse: white, glazed all round, with the big monitor and a blue beacon on the roof
  const cx = 32, cw = 20, cy = 6.4, ch = W - 12.8;
  raised(d, 2, 0.6, () => fillRR(d, '#d4d9df', cx, cy, cw, ch, 3.4));
  glass(d, cx + cw - 4.8, cy + 1.2, 3.9, ch - 2.4, 1.8);
  glass(d, cx + 2.6, cy + 0.45, cw - 8.4, 1.15, 0.5);
  glass(d, cx + 2.6, cy + ch - 1.6, cw - 8.4, 1.15, 0.5);
  rr(d, cx + 1.3, cy + 2.1, cw - 7.2, ch - 4.2, 2.2);
  d.fillStyle = crowned(d, cy + 2, cy + ch - 2, 0xe2e6ea, 0xffffff);
  d.fill();
  d.strokeStyle = 'rgba(0,0,0,0.25)';
  d.lineWidth = 0.3;
  d.stroke();
  // a broad stripe along the roof in the racer's colour
  rr(d, cx + 1.3, W / 2 - 2.6, cw - 7.2, 5.2, 0.5);
  punch(d);
  line(d, 'rgba(0,0,0,0.3)', 0.25, cx + 1.3, W / 2 - 2.6, cx + cw - 5.9, W / 2 - 2.6);
  line(d, 'rgba(0,0,0,0.3)', 0.25, cx + 1.3, W / 2 + 2.6, cx + cw - 5.9, W / 2 + 2.6);
  monitor(cx + 4.4, W / 2, 1.05);
  for (const y of [cy + 4.4, cy + ch - 4.4]) {
    disc(d, 'rgba(80,170,255,0.35)', cx + 11.4, y, 1.9);
    disc(d, '#2f8cff', cx + 11.4, y, 1.05);
    disc(d, '#d6ecff', cx + 11.1, y - 0.3, 0.4);
  }
  // life raft canister
  raised(d, 0.5, 0.5, () => fillRR(d, '#f4f6f8', cx - 3.6, cy + 1.2, 2.6, 5, 1.2));
  line(d, '#c0392b', 0.3, cx - 3.6, cy + 3.7, cx - 1, cy + 3.7);

  // Foredeck: two monitors and the anchor winch
  monitor(L - 22, W / 2 - 5, 0.8);
  monitor(L - 22, W / 2 + 5, 0.8);
  bollard(d, L - 10.5, W / 2);
  line(d, '#70777f', 0.5, L - 8.6, W / 2, L - 4.4, W / 2);

  outlineHull(d, L, W, s);
  for (const x of [18, 40]) {
    tyre(d, x, 0.35, 1.6);
    tyre(d, x, W - 0.35, 1.6);
  }
}

/** Hovercraft: a black rubber skirt round a flat deck, a bubble cabin, and two big ducted fans at the stern. */
function hovercraft(p: Ctx, d: Ctx, L: number, W: number): void {
  const body = (c: Ctx, inset: number): void => {
    // A rounded lozenge: fuller at the stern, rounder at the bow.
    const x0 = inset, x1 = L - inset, y0 = inset, y1 = W - inset, mid = W / 2;
    c.beginPath();
    c.moveTo(x0 + 9, y0);
    c.lineTo(x1 - 20, y0);
    c.bezierCurveTo(x1 - 6, y0, x1, mid - 9, x1, mid);
    c.bezierCurveTo(x1, mid + 9, x1 - 6, y1, x1 - 20, y1);
    c.lineTo(x0 + 9, y1);
    c.quadraticCurveTo(x0, y1, x0, y1 - 9);
    c.lineTo(x0, y0 + 9);
    c.quadraticCurveTo(x0, y0, x0 + 9, y0);
    c.closePath();
  };
  // Deck in the racer's colour
  body(p, 4.4);
  p.fillStyle = '#ffffff';
  p.fill();
  p.save();
  p.clip();
  const pg = p.createRadialGradient(L * 0.5, W / 2, W * 0.18, L * 0.5, W / 2, L * 0.62);
  pg.addColorStop(0, 'rgba(0,0,0,0)');
  pg.addColorStop(1, 'rgba(0,0,0,0.34)');
  p.fillStyle = pg;
  p.fillRect(0, 0, L, W);
  p.restore();

  // Skirt: black rubber, bulging, cut into fingers
  body(d, 0);
  d.fillStyle = '#131518';
  d.fill();
  body(d, 2.2);
  d.strokeStyle = 'rgba(255,255,255,0.16)';
  d.lineWidth = 1.5;
  d.stroke();
  d.save();
  body(d, 0);
  d.clip();
  for (let k = 0; k < 44; k++) {
    const a = (k / 44) * Math.PI * 2;
    line(d, 'rgba(0,0,0,0.7)', 0.35, L / 2 + Math.cos(a) * 16, W / 2 + Math.sin(a) * 12, L / 2 + Math.cos(a) * 46, W / 2 + Math.sin(a) * 46);
  }
  d.restore();
  body(d, 4.4);
  punch(d);
  body(d, 4.4);
  d.strokeStyle = 'rgba(0,0,0,0.6)';
  d.lineWidth = 0.5;
  d.stroke();
  body(d, 5.3);
  d.strokeStyle = 'rgba(255,255,255,0.35)';
  d.lineWidth = 0.35;
  d.stroke();

  // Two ducted fans at the stern, with rudders in the slipstream
  for (const y of [W / 2 - 10.2, W / 2 + 10.2]) {
    for (const oy of [-2.6, 0, 2.6]) line(d, '#e9ecef', 0.6, 5.2, y + oy, 9.6, y + oy);
    raised(d, 1.6, 0.6, () => disc(d, '#22262c', 15.4, y, 8.4));
    disc(d, '#0b0c0e', 15.4, y, 6.9);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + 0.3;
      d.beginPath();
      d.moveTo(15.4, y);
      d.arc(15.4, y, 6.6, a, a + 0.5);
      d.closePath();
      d.fillStyle = 'rgba(190,198,208,0.9)';
      d.fill();
    }
    disc(d, '#f4c20d', 15.4, y, 1.7);
    ring(d, '#7f8892', 15.4, y, 7.7, 0.7);
    ring(d, 'rgba(255,255,255,0.3)', 15.4, y, 8.3, 0.25);
  }
  // Engine cover between the fans
  raised(d, 0.8, 0.5, () => fillRR(d, '#d9dde2', 11.5, W / 2 - 2.2, 12, 4.4, 1.4));
  for (let x = 13.5; x < 22; x += 1.6) line(d, 'rgba(0,0,0,0.4)', 0.3, x, W / 2 - 1.3, x, W / 2 + 1.3);

  // Cabin: a white bubble with a dark wrap-round windscreen
  raised(d, 2, 0.6, () => {
    d.beginPath();
    d.ellipse(38, W / 2, 12.5, 9.2, 0, 0, Math.PI * 2);
    d.fillStyle = '#d5dae0';
    d.fill();
  });
  d.beginPath();
  d.ellipse(38, W / 2, 12.5, 9.2, 0, -1.15, 1.15);
  d.ellipse(36.5, W / 2, 9.4, 7, 0, 1.2, -1.2, true);
  d.closePath();
  const wg = d.createLinearGradient(40, 0, 51, 0);
  wg.addColorStop(0, '#1a2838');
  wg.addColorStop(1, '#3f6d94');
  d.fillStyle = wg;
  d.fill();
  d.strokeStyle = 'rgba(255,255,255,0.5)';
  d.lineWidth = 0.3;
  d.stroke();
  d.beginPath();
  d.ellipse(35.6, W / 2, 8.6, 6.4, 0, 0, Math.PI * 2);
  const rg = d.createRadialGradient(34.5, W / 2, 1, 35.6, W / 2, 9);
  rg.addColorStop(0, '#ffffff');
  rg.addColorStop(1, '#dfe4e9');
  d.fillStyle = rg;
  d.fill();
  disc(d, '#ff8a1f', 31.5, W / 2, 1.1); // beacon
  disc(d, '#ffe2b0', 31.2, W / 2 - 0.3, 0.4);
  line(d, '#30353c', 0.35, 35, W / 2 + 3.2, 39.5, W / 2 + 3.2); // aerial

  // Foredeck: hazard chevrons and the bow light
  for (const k of [0, 1]) {
    d.beginPath();
    d.moveTo(L - 11.5 + k * 2.6, W / 2 - 4.2 + k * 1.2);
    d.lineTo(L - 9 + k * 2.6, W / 2);
    d.lineTo(L - 11.5 + k * 2.6, W / 2 + 4.2 - k * 1.2);
    d.strokeStyle = '#f4c20d';
    d.lineWidth = 0.9;
    d.lineCap = 'round';
    d.lineJoin = 'round';
    d.stroke();
  }
  disc(d, '#eef2f5', L - 5.8, W / 2, 0.8);

  body(d, 0);
  d.strokeStyle = 'rgba(0,0,0,0.9)';
  d.lineWidth = 0.8;
  d.stroke();
}

const ART: Partial<Record<BoatShape, (p: Ctx, d: Ctx, L: number, W: number) => void>> = {
  barge: coalBarge,
  tug,
  narrow: narrowboat,
  speedboat,
  pontoon,
  fireboat,
  hovercraft,
};

/** Whether this boat is drawn here (the péniche Cabourg has its own drawing code). */
export const hasBoatArt = (def: BoatDef): boolean => def.shape in ART;

/**
 * Draw a boat's two layers. Both contexts must already be scaled to design units and translated
 * by BOAT_ART_PAD, on canvases of (length + 2 pad) x (width + 2 pad) design units.
 */
export function drawBoatArt(paint: Ctx, detail: Ctx, def: BoatDef): void {
  ART[def.shape]?.(paint, detail, def.size.length, def.size.width);
}
