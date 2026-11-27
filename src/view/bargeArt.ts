/**
 * The working barges of the traffic, seen from above, bow to the right, drawn with the Canvas 2D
 * API in design units (TUNING.traffic.length x width). Three kinds, in their own colours:
 * 0 a cargo barge with its hold under green tarpaulins, 1 a barge loaded with sand, 2 a small
 * tanker. All have the wheelhouse at the stern, where the family lives: a car on the deck,
 * washing on a line, pots of flowers.
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

function fill(c: Ctx, color: string | CanvasGradient, x: number, y: number, w: number, h: number, r = 0): void {
  rr(c, x, y, w, h, r);
  c.fillStyle = color;
  c.fill();
}

function disc(c: Ctx, color: string, x: number, y: number, r: number): void {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = color;
  c.fill();
}

function raised(c: Ctx, blur: number, draw: () => void): void {
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.5)';
  c.shadowBlur = blur * c.getTransform().a;
  draw();
  c.restore();
}

/** Lighter along the middle, the same on both sides (the barge turns, the sun doesn't). */
function crowned(c: Ctx, y0: number, y1: number, edge: string, mid: string): CanvasGradient {
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, edge);
  g.addColorStop(0.5, mid);
  g.addColorStop(1, edge);
  return g;
}

function hullPath(c: Ctx, L: number, W: number, inset: number): void {
  const bow = 18;
  c.beginPath();
  c.moveTo(inset + 5, inset);
  c.lineTo(L - bow, inset);
  c.bezierCurveTo(L - bow * 0.15 - inset, inset, L - inset, W * 0.22, L - inset, W / 2);
  c.bezierCurveTo(L - inset, W * 0.78, L - bow * 0.15 - inset, W - inset, L - bow, W - inset);
  c.lineTo(inset + 5, W - inset);
  c.quadraticCurveTo(inset, W - inset, inset, W - inset - 5);
  c.lineTo(inset, inset + 5);
  c.quadraticCurveTo(inset, inset, inset + 5, inset);
  c.closePath();
}

export function drawBarge(c: Ctx, kind: number, L: number, W: number): void {
  const hullColor = ['#1d2a22', '#4a1f1a', '#1d2433'][kind] ?? '#1d2433';
  // Hull, gunwale, side decks
  hullPath(c, L, W, 0);
  c.fillStyle = hullColor;
  c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.9)';
  c.lineWidth = 0.9;
  c.stroke();
  hullPath(c, L, W, 1.2);
  c.strokeStyle = 'rgba(230,230,220,0.55)';
  c.lineWidth = 0.6;
  c.stroke();
  hullPath(c, L, W, 2.4);
  c.fillStyle = crowned(c, 0, W, '#3b4049', '#535a64');
  c.fill();

  // The load, between the bow deck and the living quarters
  const hx = 52, hw = L - 52 - 26, hy = 4.5, hh = W - 9;
  if (kind === 0) {
    // Cargo hold under tarpaulins: a row of green panels with ropes across
    raised(c, 1.2, () => fill(c, '#2f5a33', hx, hy, hw, hh, 2));
    const panels = 9;
    for (let i = 0; i < panels; i++) {
      const x = hx + (hw * i) / panels;
      fill(c, crowned(c, hy, hy + hh, i % 2 ? '#2b5130' : '#336138', i % 2 ? '#3d7344' : '#478450'), x + 0.5, hy + 0.5, hw / panels - 1, hh - 1, 1.5);
      c.strokeStyle = 'rgba(0,0,0,0.35)';
      c.lineWidth = 0.4;
      c.beginPath();
      c.moveTo(x + hw / panels / 2, hy + 1);
      c.lineTo(x + hw / panels / 2, hy + hh - 1);
      c.stroke();
    }
    c.strokeStyle = 'rgba(230,215,170,0.8)';
    c.lineWidth = 0.5;
    for (let i = 1; i < panels; i++) {
      const x = hx + (hw * i) / panels;
      c.beginPath();
      c.moveTo(x - 2, hy);
      c.lineTo(x + 2, hy + hh);
      c.stroke();
    }
  } else if (kind === 1) {
    // Open hold heaped with sand
    raised(c, 1.2, () => fill(c, '#8a8f96', hx - 1, hy - 1, hw + 2, hh + 2, 2));
    fill(c, '#c9a96a', hx, hy, hw, hh, 1.5);
    c.save();
    rr(c, hx, hy, hw, hh, 1.5);
    c.clip();
    for (const [mx, r] of [[0.18, 16], [0.45, 18], [0.75, 17]] as const) {
      const g = c.createRadialGradient(hx + hw * mx - 3, W / 2 - 3, 1, hx + hw * mx, W / 2, r);
      g.addColorStop(0, 'rgba(240,215,160,0.95)');
      g.addColorStop(1, 'rgba(180,145,90,0)');
      c.fillStyle = g;
      c.fillRect(hx + hw * mx - r, W / 2 - r, r * 2, r * 2);
    }
    let seed = 3;
    for (let i = 0; i < 160; i++) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      const x = hx + ((seed >>> 8) % 1000) / 1000 * hw;
      seed = (seed * 1103515245 + 12345) >>> 0;
      const y = hy + ((seed >>> 8) % 1000) / 1000 * hh;
      c.fillStyle = i % 3 ? 'rgba(140,110,60,0.35)' : 'rgba(255,240,200,0.4)';
      c.fillRect(x, y, 0.8, 0.8);
    }
    c.restore();
    // cross beams
    c.fillStyle = '#6f757d';
    for (const t of [0.33, 0.66]) c.fillRect(hx + hw * t - 0.7, hy - 1, 1.4, hh + 2);
  } else {
    // Tanker: a flat deck with pipes, valves and a catwalk down the middle
    fill(c, crowned(c, hy, hy + hh, '#5d6a7a', '#7d8a9a'), hx, hy, hw, hh, 2);
    c.strokeStyle = '#c0392b';
    c.lineWidth = 1.6;
    for (const y of [hy + 4, hy + hh - 4]) {
      c.beginPath();
      c.moveTo(hx + 2, y);
      c.lineTo(hx + hw - 2, y);
      c.stroke();
    }
    fill(c, '#3d4652', hx + 2, W / 2 - 2, hw - 4, 4, 1);
    c.strokeStyle = 'rgba(255,255,255,0.35)';
    c.lineWidth = 0.3;
    for (let x = hx + 4; x < hx + hw - 2; x += 3) {
      c.beginPath();
      c.moveTo(x, W / 2 - 2);
      c.lineTo(x, W / 2 + 2);
      c.stroke();
    }
    for (let i = 0; i < 5; i++) {
      const x = hx + 14 + i * ((hw - 28) / 4);
      raised(c, 0.6, () => disc(c, '#d9dde2', x, hy + 9, 2.4));
      disc(c, '#c0392b', x, hy + 9, 1.2);
      raised(c, 0.6, () => disc(c, '#d9dde2', x, hy + hh - 9, 2.4));
      disc(c, '#c0392b', x, hy + hh - 9, 1.2);
    }
  }

  // Bow deck: winch, anchor chain, bollards
  raised(c, 0.8, () => fill(c, '#5c636c', L - 30, W / 2 - 3.5, 7, 7, 1));
  c.strokeStyle = '#9aa3ad';
  c.lineWidth = 0.7;
  c.beginPath();
  c.moveTo(L - 23, W / 2);
  c.lineTo(L - 9, W / 2);
  c.stroke();
  for (const y of [6, W - 6]) raised(c, 0.6, () => disc(c, '#2f343b', L - 40, y, 1.6));

  // Living quarters at the stern: the wheelhouse (white, blue roof), a car on the deck, washing
  fill(c, '#a07850', 4, 3.5, 46, W - 7, 2); // wooden deck
  c.strokeStyle = 'rgba(70,45,20,0.45)';
  c.lineWidth = 0.3;
  for (let y = 6; y < W - 4; y += 2.2) {
    c.beginPath();
    c.moveTo(5, y);
    c.lineTo(49, y);
    c.stroke();
  }
  raised(c, 1.8, () => fill(c, '#e9ecef', 6, 6, 20, W - 12, 2.5));
  fill(c, crowned(c, 6, W - 6, '#2f6fb0', '#4a8fd0'), 7.5, 7.5, 17, W - 15, 2);
  fill(c, '#1b2a3d', 24, 8, 2.2, W - 16, 0.8); // windows facing forward
  disc(c, '#f26a1b', 11, 8.8, 1.6); // life ring
  // the car (a little hatchback) parked on deck
  const carC = ['#c0392b', '#f2f2f2', '#2f6fd8'][kind] ?? '#c0392b';
  raised(c, 1, () => fill(c, carC, 30, W / 2 - 5, 15, 10, 3));
  fill(c, 'rgba(30,45,60,0.9)', 37, W / 2 - 4, 3.5, 8, 1); // windscreen
  fill(c, 'rgba(30,45,60,0.8)', 31.5, W / 2 - 4, 2.5, 8, 1); // rear window
  fill(c, 'rgba(255,255,255,0.35)', 33.5, W / 2 - 4, 3.5, 8, 1); // roof
  // washing on a line
  c.strokeStyle = 'rgba(240,240,240,0.8)';
  c.lineWidth = 0.3;
  c.beginPath();
  c.moveTo(28, 4.5);
  c.lineTo(49, 4.5);
  c.stroke();
  const cols = ['#ff6b81', '#ffd23f', '#7ee081', '#ffffff', '#63c7ff'];
  for (let i = 0; i < 5; i++) fill(c, cols[i], 29 + i * 4, 4.5, 2.6, 2.2, 0.4);
  // flower pots by the wheelhouse
  for (const [x, y, col] of [[3.5, 6, '#ff5d73'], [3.5, W - 6, '#ffd23f']] as const) {
    disc(c, '#6a4526', x + 1, y, 1.6);
    disc(c, col, x + 1, y, 0.9);
  }
}
