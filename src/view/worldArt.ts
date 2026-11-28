/**
 * The things boats meet on the water, drawn with the Canvas 2D API in design units (game pixels):
 * item crates, thrown volunteers, the flying drill, glue blobs and puddles, the jigsaw blade.
 * Everything that moves points to the right.
 */

type Ctx = CanvasRenderingContext2D;

function rr(c: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function disc(c: Ctx, color: string, x: number, y: number, r: number): void {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = color;
  c.fill();
}

function shadowed(c: Ctx, blur: number, alpha: number, draw: () => void): void {
  c.save();
  c.shadowColor = `rgba(0,0,0,${alpha})`;
  c.shadowBlur = blur * c.getTransform().a;
  draw();
  c.restore();
}

/** An item crate floating in the water, 44 x 44: planks, a frame, steel corners and a question mark. */
export function drawCrate(c: Ctx): void {
  const x = 4, y = 4, s = 36;
  // a ring of ripples where it sits in the water
  c.strokeStyle = 'rgba(255,255,255,0.35)';
  c.lineWidth = 1;
  rr(c, x - 2.5, y - 2.5, s + 5, s + 5, 6);
  c.stroke();
  shadowed(c, 2, 0.5, () => {
    rr(c, x, y, s, s, 4);
    c.fillStyle = '#a8743c';
    c.fill();
  });
  c.save();
  rr(c, x, y, s, s, 4);
  c.clip();
  // planks
  const g = c.createLinearGradient(x, y, x + s, y + s);
  g.addColorStop(0, '#c08a4a');
  g.addColorStop(1, '#93622f');
  c.fillStyle = g;
  c.fillRect(x, y, s, s);
  c.strokeStyle = 'rgba(70,40,12,0.55)';
  c.lineWidth = 0.8;
  for (let k = 1; k < 5; k++) {
    c.beginPath();
    c.moveTo(x, y + (s * k) / 5);
    c.lineTo(x + s, y + (s * k) / 5);
    c.stroke();
  }
  // wood grain
  c.strokeStyle = 'rgba(255,225,170,0.22)';
  c.lineWidth = 0.5;
  for (let k = 0; k < 5; k++) {
    c.beginPath();
    c.moveTo(x + 3 + k * 2, y + (s * k) / 5 + 2.4);
    c.lineTo(x + s - 6 - k * 3, y + (s * k) / 5 + 2.4);
    c.stroke();
  }
  // diagonal brace
  c.strokeStyle = '#7d5026';
  c.lineWidth = 5;
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x + s, y + s);
  c.stroke();
  c.strokeStyle = 'rgba(255,225,170,0.25)';
  c.lineWidth = 0.6;
  c.beginPath();
  c.moveTo(x + 1.6, y - 1);
  c.lineTo(x + s + 1.6, y + s - 1);
  c.stroke();
  // frame
  c.strokeStyle = '#6f4520';
  c.lineWidth = 7;
  rr(c, x, y, s, s, 4);
  c.stroke();
  c.strokeStyle = 'rgba(255,225,170,0.3)';
  c.lineWidth = 0.6;
  rr(c, x + 3.6, y + 3.6, s - 7.2, s - 7.2, 1.5);
  c.stroke();
  c.restore();
  // steel corners with a rivet
  for (const [cx, cy] of [[x, y], [x + s, y], [x, y + s], [x + s, y + s]] as const) {
    const dx = cx === x ? 1 : -1, dy = cy === y ? 1 : -1;
    c.beginPath();
    c.moveTo(cx + dx * 0.6, cy + dy * 0.6);
    c.lineTo(cx + dx * 9, cy + dy * 0.6);
    c.lineTo(cx + dx * 0.6, cy + dy * 9);
    c.closePath();
    c.fillStyle = '#59606a';
    c.fill();
    disc(c, '#c9d0d8', cx + dx * 3, cy + dy * 3, 0.9);
  }
  rr(c, x, y, s, s, 4);
  c.strokeStyle = 'rgba(30,16,4,0.9)';
  c.lineWidth = 1.1;
  c.stroke();
  // the badge
  shadowed(c, 1.5, 0.5, () => disc(c, '#ffd23f', 22, 22, 9.5));
  c.beginPath();
  c.arc(22, 22, 9.5, 0, Math.PI * 2);
  c.strokeStyle = '#8a5a12';
  c.lineWidth = 1.2;
  c.stroke();
  disc(c, 'rgba(255,255,255,0.45)', 19, 18.5, 3.2);
  c.fillStyle = '#5b3b1c';
  c.font = 'bold 15px "Trebuchet MS", Verdana, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('?', 22, 22.8);
}

/** A volunteer flying through the air, 28 x 28, seen from above, head first to the right, arms stretched out. */
export function drawVolunteer(c: Ctx): void {
  const skin = '#f2c9a0';
  shadowed(c, 1.5, 0.45, () => {
    // legs trailing behind
    c.strokeStyle = '#2b4a7a';
    c.lineWidth = 3.2;
    c.lineCap = 'round';
    for (const dy of [-2.6, 2.6]) {
      c.beginPath();
      c.moveTo(11, 14 + dy);
      c.lineTo(3.2, 14 + dy * 1.5);
      c.stroke();
    }
    // arms reaching forward
    c.strokeStyle = '#ff8a1f';
    c.lineWidth = 3;
    for (const dy of [-1, 1]) {
      c.beginPath();
      c.moveTo(15, 14 + dy * 5);
      c.lineTo(21.5, 14 + dy * 7.6);
      c.stroke();
    }
    // torso in a hi-vis vest
    c.beginPath();
    c.ellipse(13.5, 14, 5.6, 6.4, 0, 0, Math.PI * 2);
    c.fillStyle = '#ff8a1f';
    c.fill();
  });
  for (const dy of [-1, 1]) disc(c, skin, 22.6, 14 + dy * 8, 1.7); // hands
  for (const dy of [-1.5, 1.5]) disc(c, '#3a2a1c', 2.6, 14 + dy * 2.6, 1.6); // boots
  // reflective bands
  c.strokeStyle = '#fff36b';
  c.lineWidth = 1.3;
  for (const dx of [-2.2, 1.6]) {
    c.beginPath();
    c.moveTo(13.5 + dx, 8.4);
    c.lineTo(13.5 + dx, 19.6);
    c.stroke();
  }
  c.strokeStyle = 'rgba(120,50,0,0.7)';
  c.lineWidth = 0.7;
  c.beginPath();
  c.ellipse(13.5, 14, 5.6, 6.4, 0, 0, Math.PI * 2);
  c.stroke();
  // head with a yellow hard hat
  shadowed(c, 1, 0.5, () => disc(c, '#ffd23f', 19.6, 14, 4.2));
  disc(c, '#fff0a8', 18.6, 12.8, 1.6);
  c.strokeStyle = '#9a7410';
  c.lineWidth = 0.6;
  c.beginPath();
  c.arc(19.6, 14, 4.2, 0, Math.PI * 2);
  c.stroke();
  c.beginPath();
  c.moveTo(16.2, 14);
  c.lineTo(23.2, 14);
  c.stroke();
  // the hat's peak, pointing where he's going
  c.beginPath();
  c.ellipse(23.2, 14, 1.8, 3, 0, -Math.PI / 2, Math.PI / 2);
  c.fillStyle = '#e8b520';
  c.fill();
}

/** A puddle of glue spreading on the water, 128 x 128: an uneven splat, glossy, with strings and bubbles. */
export function drawGluePuddle(c: Ctx): void {
  const splat = (scale: number): void => {
    c.beginPath();
    const n = 14;
    const rad = (k: number): number => (46 + [9, -3, 6, 11, -5, 4, 12, -2, 7, -6, 10, 2, -4, 8][k % 14]) * scale;
    for (let k = 0; k <= n; k++) {
      const a0 = ((k - 1) / n) * Math.PI * 2, a1 = (k / n) * Math.PI * 2, am = (a0 + a1) / 2;
      const r0 = rad((k - 1 + n) % n), r1 = rad(k % n);
      const x1 = 64 + Math.cos(a1) * r1, y1 = 64 + Math.sin(a1) * r1;
      if (k === 0) c.moveTo(x1, y1);
      else c.quadraticCurveTo(64 + Math.cos(am) * ((r0 + r1) / 2) * 1.12, 64 + Math.sin(am) * ((r0 + r1) / 2) * 1.12, x1, y1);
    }
    c.closePath();
  };
  shadowed(c, 3, 0.3, () => {
    splat(1);
    c.fillStyle = 'rgba(236,220,120,0.9)';
    c.fill();
  });
  c.save();
  splat(1);
  c.clip();
  const g = c.createRadialGradient(54, 52, 6, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,250,205,0.95)');
  g.addColorStop(0.6, 'rgba(244,229,130,0.9)');
  g.addColorStop(1, 'rgba(201,180,74,0.95)');
  c.fillStyle = g;
  c.fillRect(0, 0, 128, 128);
  // thicker ridges
  c.strokeStyle = 'rgba(190,165,60,0.5)';
  c.lineWidth = 2;
  splat(0.72);
  c.stroke();
  splat(0.4);
  c.stroke();
  c.restore();
  splat(1);
  c.strokeStyle = 'rgba(150,125,30,0.9)';
  c.lineWidth = 2;
  c.stroke();
  // gloss
  c.strokeStyle = 'rgba(255,255,255,0.75)';
  c.lineWidth = 3.5;
  c.lineCap = 'round';
  c.beginPath();
  c.arc(64, 64, 40, Math.PI * 1.08, Math.PI * 1.42);
  c.stroke();
  disc(c, 'rgba(255,255,255,0.8)', 44, 38, 4);
  // bubbles
  for (const [x, y, r] of [[84, 52, 5], [70, 90, 4], [42, 78, 3.2], [92, 78, 2.6]] as const) {
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.strokeStyle = 'rgba(150,125,30,0.65)';
    c.lineWidth = 1;
    c.stroke();
    disc(c, 'rgba(255,255,255,0.7)', x - r * 0.35, y - r * 0.35, r * 0.3);
  }
}

/** A ball of glue in flight, 30 x 30, stretched into a drop with its tail behind. */
export function drawGlueBlob(c: Ctx): void {
  shadowed(c, 1.5, 0.4, () => {
    c.beginPath();
    c.moveTo(2, 15);
    c.quadraticCurveTo(10, 5.5, 19, 5.5);
    c.arc(19, 15, 9.5, -Math.PI / 2, Math.PI / 2);
    c.quadraticCurveTo(10, 24.5, 2, 15);
    c.closePath();
    const g = c.createRadialGradient(17, 11.5, 1, 19, 15, 11);
    g.addColorStop(0, '#fffbd0');
    g.addColorStop(0.6, '#f2e27a');
    g.addColorStop(1, '#c9b44a');
    c.fillStyle = g;
    c.fill();
  });
  c.strokeStyle = 'rgba(140,116,26,0.95)';
  c.lineWidth = 1.2;
  c.stroke();
  disc(c, 'rgba(255,255,255,0.85)', 21.5, 11, 2.4);
  disc(c, 'rgba(255,255,255,0.6)', 16, 9.4, 1.1);
}

/** The jigsaw fitted to a bow, 56 x 40: an orange motor housing and a long toothed blade. */
export function drawSaw(c: Ctx): void {
  shadowed(c, 1.5, 0.45, () => {
    rr(c, 0, 9, 16, 22, 4);
    const g = c.createLinearGradient(0, 9, 0, 31);
    g.addColorStop(0, '#ffc04a');
    g.addColorStop(0.5, '#ef9a14');
    g.addColorStop(1, '#b06c06');
    c.fillStyle = g;
    c.fill();
  });
  c.strokeStyle = 'rgba(70,40,0,0.85)';
  c.lineWidth = 1;
  rr(c, 0, 9, 16, 22, 4);
  c.stroke();
  c.fillStyle = '#2a2d33';
  rr(c, 3, 13, 8, 14, 2.5);
  c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.3)';
  c.lineWidth = 0.8;
  for (let y = 16; y < 26; y += 3) {
    c.beginPath();
    c.moveTo(5, y);
    c.lineTo(9, y);
    c.stroke();
  }
  // blade with teeth on both edges
  c.beginPath();
  c.moveTo(16, 15);
  for (let x = 16; x < 52; x += 4.5) {
    c.lineTo(x + 2.2, 10.5);
    c.lineTo(x + 4.5, 15);
  }
  c.lineTo(56, 20);
  c.lineTo(52, 25);
  for (let x = 52; x > 16; x -= 4.5) {
    c.lineTo(x - 2.3, 29.5);
    c.lineTo(x - 4.5, 25);
  }
  c.closePath();
  const bg = c.createLinearGradient(0, 10, 0, 30);
  bg.addColorStop(0, '#f6f8fa');
  bg.addColorStop(0.5, '#b9c0c8');
  bg.addColorStop(1, '#7c848d');
  c.fillStyle = bg;
  c.fill();
  c.strokeStyle = 'rgba(30,34,40,0.85)';
  c.lineWidth = 0.9;
  c.stroke();
  c.strokeStyle = 'rgba(255,255,255,0.6)';
  c.lineWidth = 0.9;
  c.beginPath();
  c.moveTo(18, 18);
  c.lineTo(50, 18);
  c.stroke();
  disc(c, '#59606a', 22, 20, 1.6);
}

/**
 * The water's surface, 256 x 256, seamless: soft bright streaks of ripples in loose rows, a few
 * glints. Drawn in white with transparency; the game tints it and slides it over the water colour.
 */
export function drawWaterTile(c: Ctx): void {
  const S = 256;
  let seed = 7;
  const rnd = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  c.lineCap = 'round';
  // Each ripple is drawn nine times, shifted by the tile size, so the tile repeats without seams.
  const tiled = (draw: (ox: number, oy: number) => void): void => {
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) draw(ox, oy);
  };
  for (let i = 0; i < 46; i++) {
    const x = rnd() * S, y = rnd() * S, len = 14 + rnd() * 30, amp = 1.5 + rnd() * 2.5, a = 0.1 + rnd() * 0.16, lw = 1.2 + rnd() * 1.6;
    const dark = rnd() < 0.3;
    tiled((ox, oy) => {
      c.beginPath();
      c.moveTo(x + ox, y + oy);
      c.bezierCurveTo(x + ox + len * 0.3, y + oy - amp, x + ox + len * 0.7, y + oy + amp, x + ox + len, y + oy);
      c.strokeStyle = dark ? `rgba(0,20,50,${a * 0.9})` : `rgba(255,255,255,${a})`;
      c.lineWidth = lw;
      c.stroke();
    });
  }
  for (let i = 0; i < 14; i++) {
    const x = rnd() * S, y = rnd() * S, r = 0.8 + rnd() * 1.2;
    tiled((ox, oy) => disc(c, 'rgba(255,255,255,0.4)', x + ox, y + oy, r));
  }
}

/** A potato in flight, 28 x 24: a lumpy brown spud with eyes and a bite of steam, pointing right. */
export function drawPotato(c: Ctx): void {
  shadowed(c, 1.5, 0.45, () => {
    c.beginPath();
    c.moveTo(3, 13);
    c.bezierCurveTo(2, 5, 12, 2.5, 20, 4);
    c.bezierCurveTo(27, 5.5, 27, 17, 21, 20);
    c.bezierCurveTo(14, 23, 4, 22, 3, 13);
    c.closePath();
    const g = c.createRadialGradient(15, 9, 1, 14, 12, 14);
    g.addColorStop(0, '#e8c27a');
    g.addColorStop(0.6, '#c49a55');
    g.addColorStop(1, '#8a6532');
    c.fillStyle = g;
    c.fill();
  });
  c.strokeStyle = 'rgba(70,45,15,0.85)';
  c.lineWidth = 0.9;
  c.stroke();
  // eyes and a scar
  for (const [x, y] of [[9, 9], [17, 15], [20, 8], [11, 16]] as const) {
    disc(c, 'rgba(90,60,25,0.75)', x, y, 1.1);
    disc(c, 'rgba(255,235,190,0.5)', x - 0.4, y - 0.4, 0.4);
  }
  c.strokeStyle = 'rgba(90,60,25,0.6)';
  c.lineWidth = 0.7;
  c.beginPath();
  c.moveTo(13, 7);
  c.quadraticCurveTo(15, 11, 14, 13);
  c.stroke();
  disc(c, 'rgba(255,245,215,0.65)', 8, 7, 2); // highlight
}

/** A slice of ham in flight, 32 x 24: pink, with a fat rim, a wobbly edge and marbling, pointing right. */
export function drawHam(c: Ctx): void {
  shadowed(c, 1.5, 0.45, () => {
    c.beginPath();
    c.moveTo(3, 12);
    c.bezierCurveTo(2, 4, 12, 1.5, 21, 3);
    c.bezierCurveTo(29, 4.5, 31, 10, 30, 14);
    c.bezierCurveTo(29, 20, 22, 22.5, 14, 22);
    c.bezierCurveTo(6, 21.5, 3, 18, 3, 12);
    c.closePath();
    const g = c.createLinearGradient(0, 2, 0, 22);
    g.addColorStop(0, '#f6b3b8');
    g.addColorStop(1, '#e07f8a');
    c.fillStyle = g;
    c.fill();
  });
  c.strokeStyle = '#f7e7dc'; // the rim of fat
  c.lineWidth = 2.2;
  c.stroke();
  c.strokeStyle = 'rgba(120,40,50,0.6)';
  c.lineWidth = 0.7;
  c.stroke();
  // marbling
  c.strokeStyle = 'rgba(255,235,225,0.75)';
  c.lineWidth = 1;
  for (const [x0, y0, x1, y1] of [[8, 9, 16, 7], [10, 15, 22, 13], [17, 11, 25, 15]] as const) {
    c.beginPath();
    c.moveTo(x0, y0);
    c.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 - 2, x1, y1);
    c.stroke();
  }
  disc(c, 'rgba(255,255,255,0.4)', 9, 6.5, 2);
}

/** A puddle of melted cheese on the water, 160 x 160: orange-yellow, glossy, full of holes, with stretchy strings. */
export function drawCheesePuddle(c: Ctx): void {
  const splat = (scale: number): void => {
    c.beginPath();
    const n = 12;
    const rad = (k: number): number => (58 + [8, -4, 12, 3, -6, 10, 0, -3, 11, 5, -5, 9][k % 12]) * scale;
    for (let k = 0; k <= n; k++) {
      const a0 = ((k - 1) / n) * Math.PI * 2, a1 = (k / n) * Math.PI * 2, am = (a0 + a1) / 2;
      const r0 = rad((k - 1 + n) % n), r1 = rad(k % n);
      const x1 = 80 + Math.cos(a1) * r1, y1 = 80 + Math.sin(a1) * r1;
      if (k === 0) c.moveTo(x1, y1);
      else c.quadraticCurveTo(80 + Math.cos(am) * ((r0 + r1) / 2) * 1.15, 80 + Math.sin(am) * ((r0 + r1) / 2) * 1.15, x1, y1);
    }
    c.closePath();
  };
  shadowed(c, 3, 0.3, () => {
    splat(1);
    c.fillStyle = '#f0a81e';
    c.fill();
  });
  c.save();
  splat(1);
  c.clip();
  const g = c.createRadialGradient(68, 66, 6, 80, 80, 78);
  g.addColorStop(0, '#ffe58a');
  g.addColorStop(0.55, '#fbc233');
  g.addColorStop(1, '#e08e12');
  c.fillStyle = g;
  c.fillRect(0, 0, 160, 160);
  // holes
  for (const [x, y, r] of [[56, 60, 8], [98, 52, 6], [86, 96, 9], [52, 100, 5.5], [112, 88, 4.5], [76, 70, 4]] as const) {
    disc(c, 'rgba(160,90,0,0.55)', x, y, r);
    disc(c, 'rgba(255,230,140,0.55)', x - r * 0.25, y - r * 0.25, r * 0.6);
  }
  c.strokeStyle = 'rgba(210,130,10,0.6)';
  c.lineWidth = 2;
  splat(0.7);
  c.stroke();
  c.restore();
  splat(1);
  c.strokeStyle = 'rgba(150,80,0,0.9)';
  c.lineWidth = 2;
  c.stroke();
  c.strokeStyle = 'rgba(255,255,255,0.75)';
  c.lineWidth = 3.5;
  c.lineCap = 'round';
  c.beginPath();
  c.arc(80, 80, 50, Math.PI * 1.1, Math.PI * 1.4);
  c.stroke();
  // a few drips of cheese around it
  for (const [x, y, r] of [[22, 40, 4], [140, 62, 3.5], [128, 128, 4.5]] as const) disc(c, '#f7b52a', x, y, r);
}

/** A cloud of toxic smoke, 220 x 220: sickly green-brown billows, darker at the heart, with stink swirls. Drawn translucent. */
export function drawToxicSmoke(c: Ctx): void {
  const puffs: [number, number, number][] = [
    [110, 110, 70], [70, 90, 46], [150, 96, 48], [88, 148, 50], [140, 146, 46], [108, 60, 40], [58, 130, 36], [162, 130, 34], [110, 170, 34], [112, 108, 52],
  ];
  for (const [x, y, r] of puffs) {
    const g = c.createRadialGradient(x - r * 0.2, y - r * 0.2, r * 0.1, x, y, r);
    g.addColorStop(0, 'rgba(150,160,60,0.62)');
    g.addColorStop(0.6, 'rgba(96,120,40,0.5)');
    g.addColorStop(1, 'rgba(70,90,30,0)');
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // darker brown at the heart
  const h = c.createRadialGradient(110, 112, 4, 110, 112, 54);
  h.addColorStop(0, 'rgba(70,52,20,0.55)');
  h.addColorStop(1, 'rgba(70,52,20,0)');
  c.fillStyle = h;
  c.fillRect(50, 50, 120, 120);
  // swirls
  c.strokeStyle = 'rgba(210,225,120,0.45)';
  c.lineWidth = 3;
  c.lineCap = 'round';
  for (const [cx, cy, r, a0] of [[82, 100, 26, 0.3], [140, 126, 30, 2.4], [112, 150, 20, 4.4]] as const) {
    c.beginPath();
    c.arc(cx, cy, r, a0, a0 + 3.4);
    c.stroke();
    c.beginPath();
    c.arc(cx, cy, r * 0.55, a0 + 0.8, a0 + 3.6);
    c.stroke();
  }
  // bubbles
  for (const [x, y, r] of [[96, 80, 5], [136, 100, 4], [118, 140, 6], [80, 140, 3.5], [150, 70, 3]] as const) {
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.strokeStyle = 'rgba(230,240,150,0.55)';
    c.lineWidth = 1.3;
    c.stroke();
  }
}

/**
 * Melted cheese over the screen, 1280 x 900 (drawn once): overlapping blobs that reach from the top
 * down in long drips, with holes and a gloss. It covers most of the view but not all of it.
 */
export function drawCheeseScreen(c: Ctx): void {
  let seed = 11;
  const rnd = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const cheese = (): CanvasGradient => {
    const g = c.createLinearGradient(0, 0, 0, 900);
    g.addColorStop(0, '#ffd965');
    g.addColorStop(0.6, '#fbc233');
    g.addColorStop(1, '#e8a01c');
    return g;
  };
  c.fillStyle = cheese();
  c.strokeStyle = 'rgba(150,80,0,0.55)';
  c.lineWidth = 5;
  const blob = (x: number, y: number, rx: number, ry: number): void => {
    c.beginPath();
    c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    c.fill();
  };
  // big overlapping blobs
  for (let i = 0; i < 38; i++) blob(rnd() * 1280, 40 + rnd() * 720, 90 + rnd() * 150, 70 + rnd() * 110);
  // drips running down
  for (let i = 0; i < 22; i++) {
    const x = rnd() * 1280, w = 22 + rnd() * 38, len = 160 + rnd() * 380, y0 = 100 + rnd() * 400;
    rr(c, x - w / 2, y0, w, len, w / 2);
    c.fill();
    blob(x, y0 + len, w * 0.78, w * 0.9);
  }
  // an unmelted edge round the screen
  const edge = c.createRadialGradient(640, 450, 300, 640, 450, 800);
  edge.addColorStop(0, 'rgba(160,90,0,0)');
  edge.addColorStop(1, 'rgba(160,90,0,0.5)');
  c.fillStyle = edge;
  c.fillRect(0, 0, 1280, 900);
  // holes: where the view shows through a little
  c.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 16; i++) {
    const x = 60 + rnd() * 1160, y = 60 + rnd() * 700, r = 14 + rnd() * 28;
    c.fillStyle = 'rgba(0,0,0,0.92)';
    c.beginPath();
    c.ellipse(x, y, r, r * 0.85, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.globalCompositeOperation = 'source-over';
  // gloss
  c.strokeStyle = 'rgba(255,255,255,0.45)';
  c.lineWidth = 9;
  c.lineCap = 'round';
  for (let i = 0; i < 14; i++) {
    const x = rnd() * 1280, y = rnd() * 700, len = 40 + rnd() * 100;
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(x + len * 0.3, y + len * 0.5, x + len * 0.1, y + len);
    c.stroke();
  }
}

/**
 * Dicke Titten seen from above, 72 x 136: two giant breasts of radius 32 side by side (across the
 * canal, along y), skin with soft shading, areolas, a shine, and a ring of ripples where they sit.
 */
export function drawBoobs(c: Ctx): void {
  const R = 32, cx = 36;
  for (const cy of [R + 4, 3 * R + 4]) {
    c.strokeStyle = 'rgba(255,255,255,0.4)';
    c.lineWidth = 1.2;
    c.beginPath();
    c.arc(cx, cy, R + 2.5, 0, Math.PI * 2);
    c.stroke();
    shadowed(c, 3, 0.5, () => disc(c, '#e9b08c', cx, cy, R));
    const g = c.createRadialGradient(cx - R * 0.35, cy - R * 0.35, R * 0.1, cx, cy, R);
    g.addColorStop(0, '#ffe2cf');
    g.addColorStop(0.55, '#f2c09f');
    g.addColorStop(1, '#cf8f6c');
    c.fillStyle = g;
    c.beginPath();
    c.arc(cx, cy, R, 0, Math.PI * 2);
    c.fill();
    const a = c.createRadialGradient(cx + 2, cy + 1, 1, cx + 2, cy + 1, 13);
    a.addColorStop(0, '#b9584c');
    a.addColorStop(0.7, '#cf7a68');
    a.addColorStop(1, 'rgba(207,122,104,0)');
    c.fillStyle = a;
    c.beginPath();
    c.arc(cx + 2, cy + 1, 13, 0, Math.PI * 2);
    c.fill();
    disc(c, '#a3463d', cx + 2, cy + 1, 4.4);
    disc(c, 'rgba(255,255,255,0.55)', cx + 1, cy - 0.5, 1.2);
    disc(c, 'rgba(255,255,255,0.45)', cx - R * 0.42, cy - R * 0.42, 5);
    c.strokeStyle = 'rgba(120,60,40,0.55)';
    c.lineWidth = 1;
    c.beginPath();
    c.arc(cx, cy, R, 0, Math.PI * 2);
    c.stroke();
  }
  // where they press together
  c.strokeStyle = 'rgba(140,70,50,0.6)';
  c.lineWidth = 1.4;
  c.beginPath();
  c.moveTo(cx - 10, 2 * R + 4);
  c.quadraticCurveTo(cx, 2 * R + 7, cx + 10, 2 * R + 4);
  c.stroke();
}

/** A giant black dildo pointing right, 82 x 24: a flared base, a long glossy shaft and a rounded tip. */
export function drawDildo(c: Ctx): void {
  const y = 12;
  shadowed(c, 2, 0.5, () => {
    c.beginPath();
    c.moveTo(10, y - 7);
    c.lineTo(64, y - 7.5);
    c.quadraticCurveTo(66, y - 10.5, 72, y - 10.5);
    c.quadraticCurveTo(81, y - 10, 81, y);
    c.quadraticCurveTo(81, y + 10, 72, y + 10.5);
    c.quadraticCurveTo(66, y + 10.5, 64, y + 7.5);
    c.lineTo(10, y + 7);
    c.closePath();
    const g = c.createLinearGradient(0, y - 10, 0, y + 10);
    g.addColorStop(0, '#3a3a44');
    g.addColorStop(0.35, '#1c1c22');
    g.addColorStop(1, '#0c0c10');
    c.fillStyle = g;
    c.fill();
  });
  // the base: a flared disc seen edge-on
  shadowed(c, 2, 0.5, () => {
    rr(c, 0, y - 12, 11, 24, 5);
    c.fillStyle = '#26262d';
    c.fill();
  });
  c.strokeStyle = 'rgba(0,0,0,0.9)';
  c.lineWidth = 1;
  rr(c, 0, y - 12, 11, 24, 5);
  c.stroke();
  // ridges and veins
  c.strokeStyle = 'rgba(80,80,92,0.9)';
  c.lineWidth = 0.9;
  for (const x of [24, 40]) {
    c.beginPath();
    c.moveTo(x, y - 6.5);
    c.quadraticCurveTo(x + 2, y, x, y + 6.5);
    c.stroke();
  }
  c.beginPath();
  c.moveTo(18, y + 2);
  c.bezierCurveTo(30, y + 5, 42, y - 1, 58, y + 3);
  c.stroke();
  // the shine
  c.strokeStyle = 'rgba(255,255,255,0.55)';
  c.lineWidth = 2;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(14, y - 4);
  c.lineTo(62, y - 4.5);
  c.stroke();
  disc(c, 'rgba(255,255,255,0.7)', 74, y - 5, 2.4);
}

/** A nail pointing right, 24 x 8: a flat head, a steel shank and a sharp point. */
export function drawNail(c: Ctx): void {
  shadowed(c, 1, 0.4, () => {
    c.beginPath();
    c.moveTo(3, 2.6);
    c.lineTo(19, 2.8);
    c.lineTo(23.5, 4);
    c.lineTo(19, 5.2);
    c.lineTo(3, 5.4);
    c.closePath();
    const g = c.createLinearGradient(0, 2.5, 0, 5.5);
    g.addColorStop(0, '#f4f6f8');
    g.addColorStop(0.5, '#a9b0b8');
    g.addColorStop(1, '#6c737b');
    c.fillStyle = g;
    c.fill();
  });
  rr(c, 0.5, 0.5, 3.2, 7, 1.2);
  c.fillStyle = '#8f969d';
  c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.6)';
  c.lineWidth = 0.5;
  c.stroke();
}

/**
 * A police boat seen from above, 96 x 34, bow to the right: a white hull with a blue and yellow
 * band, a wheelhouse with POLICE on its roof and a light bar (the lights flash: drawn by the view).
 */
export function drawPolice(c: Ctx): void {
  const L = 96, W = 34;
  const hull = (): void => {
    c.beginPath();
    c.moveTo(6, 2);
    c.lineTo(L - 22, 2);
    c.quadraticCurveTo(L, 4, L, W / 2);
    c.quadraticCurveTo(L, W - 4, L - 22, W - 2);
    c.lineTo(6, W - 2);
    c.quadraticCurveTo(1, W - 2, 1, W - 8);
    c.lineTo(1, 8);
    c.quadraticCurveTo(1, 2, 6, 2);
    c.closePath();
  };
  shadowed(c, 2.5, 0.5, () => {
    hull();
    c.fillStyle = '#f4f6f8';
    c.fill();
  });
  c.strokeStyle = 'rgba(0,0,0,0.75)';
  c.lineWidth = 1;
  hull();
  c.stroke();
  // the band: blue and yellow checks along each side
  for (const y of [3.5, W - 7.5]) {
    for (let x = 8; x < L - 24; x += 8) {
      c.fillStyle = ((x / 8) | 0) % 2 ? '#1f4fa8' : '#f2c12e';
      c.fillRect(x, y, 8, 4);
    }
  }
  c.fillStyle = '#e1e6eb';
  rr(c, 10, 9, L - 40, W - 18, 3);
  c.fill();
  // the wheelhouse
  shadowed(c, 1.5, 0.4, () => {
    rr(c, 34, 7, 30, W - 14, 4);
    c.fillStyle = '#1f4fa8';
    c.fill();
  });
  c.fillStyle = 'rgba(160,210,255,0.9)';
  rr(c, 60, 9, 3.5, W - 18, 1);
  c.fill();
  c.fillStyle = '#ffffff';
  c.font = 'bold 6.5px sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('POLICE', 46, W / 2 + 0.5);
  // the light bar
  c.fillStyle = '#2b2f35';
  rr(c, 51, W / 2 - 9, 5, 18, 1.5);
  c.fill();
  // bollards and a life ring
  disc(c, '#ff8a1f', 18, W / 2, 3);
  disc(c, '#e1e6eb', 18, W / 2, 1.4);
  disc(c, '#3b4048', L - 18, 8, 1.5);
  disc(c, '#3b4048', L - 18, W - 8, 1.5);
}

/** A police bullet: a bright tracer pointing right, 16 x 4. */
export function drawBullet(c: Ctx): void {
  const g = c.createLinearGradient(0, 0, 16, 0);
  g.addColorStop(0, 'rgba(255,220,120,0)');
  g.addColorStop(0.6, 'rgba(255,220,120,0.9)');
  g.addColorStop(1, '#fff6d0');
  c.fillStyle = g;
  rr(c, 0, 0.8, 16, 2.4, 1.2);
  c.fill();
  disc(c, '#c08a2a', 14.5, 2, 1.6);
}

/** A duck seen from above, facing right, 18 x 12: `kind` 0 a drake (green head), 1 a brown hen. */
export function drawDuck(c: Ctx, kind: number): void {
  shadowed(c, 1, 0.35, () => {
    c.beginPath();
    c.ellipse(8, 6, 7, 4.4, 0, 0, Math.PI * 2);
    c.fillStyle = kind === 0 ? '#b9b2a6' : '#9a7652';
    c.fill();
  });
  c.beginPath();
  c.ellipse(6.5, 6, 4.5, 3, 0, 0, Math.PI * 2);
  c.fillStyle = kind === 0 ? '#8a7f70' : '#7a5a3c';
  c.fill(); // folded wings
  disc(c, kind === 0 ? '#2f6b3a' : '#8a6644', 13.5, 6, 2.8); // head
  c.fillStyle = '#f2b02e';
  rr(c, 15.6, 5, 2.4, 2, 0.8);
  c.fill(); // bill
  disc(c, '#1a1a1a', 14.2, 4.9, 0.5);
  disc(c, '#1a1a1a', 14.2, 7.1, 0.5);
  c.fillStyle = kind === 0 ? '#ffffff' : '#c9a57a';
  c.fillRect(11, 3.5, 0.8, 5); // neck ring
}

/**
 * A rowing four seen from above, bow to the right, 96 x 64: a long thin shell, four rowers in
 * club colours and their oars. `frame` 0: oars forward (catch), 1: oars back (finish).
 */
export function drawRowboat(c: Ctx, frame: number): void {
  const cy = 32, L = 92;
  // oars first, under the rowers
  for (let k = 0; k < 4; k++) {
    const x = 20 + k * 17;
    const side = k % 2 ? 1 : -1;
    const sweep = frame === 0 ? 7 : -7;
    c.strokeStyle = '#d9d2c4';
    c.lineWidth = 1.3;
    c.beginPath();
    c.moveTo(x, cy);
    c.lineTo(x + sweep, cy + side * 26);
    c.stroke();
    c.fillStyle = '#c0392b';
    c.save();
    c.translate(x + sweep, cy + side * 27);
    c.rotate(Math.atan2(side * 26, sweep));
    rr(c, -1, -2.2, 6, 4.4, 1.5);
    c.fill();
    c.restore();
  }
  shadowed(c, 1.5, 0.45, () => {
    c.beginPath();
    c.moveTo(2, cy);
    c.quadraticCurveTo(10, cy - 5, 46, cy - 5);
    c.quadraticCurveTo(84, cy - 5, L, cy);
    c.quadraticCurveTo(84, cy + 5, 46, cy + 5);
    c.quadraticCurveTo(10, cy + 5, 2, cy);
    c.closePath();
    c.fillStyle = '#f2f2f2';
    c.fill();
  });
  c.strokeStyle = 'rgba(0,0,0,0.5)';
  c.lineWidth = 0.6;
  c.stroke();
  for (let k = 0; k < 4; k++) {
    const x = 20 + k * 17 - (frame === 0 ? 2 : -2);
    c.beginPath();
    c.ellipse(x, cy, 3.6, 4.6, 0, 0, Math.PI * 2);
    c.fillStyle = '#1f4fa8';
    c.fill(); // back in club colours
    disc(c, '#e8bf98', x + 2.6, cy, 2.3); // head
    disc(c, ['#2b1d12', '#c9a15a', '#5a3b1f', '#1a1a1a'][k], x + 2.1, cy, 2.2);
  }
}

/** A swimmer seen from above, facing right, 26 x 26: a head in a cap, arms mid-stroke (two frames), a ring of ripples. */
export function drawSwimmer(c: Ctx, frame: number, cap: string): void {
  const cx = 13, cy = 13;
  c.strokeStyle = 'rgba(255,255,255,0.5)';
  c.lineWidth = 0.8;
  c.beginPath();
  c.ellipse(cx - 2, cy, 10, 7, 0, 0, Math.PI * 2);
  c.stroke();
  c.fillStyle = 'rgba(232,191,152,0.55)';
  c.beginPath();
  c.ellipse(cx - 5, cy, 6, 3.6, 0, 0, Math.PI * 2);
  c.fill(); // body under the water
  c.strokeStyle = '#e8bf98';
  c.lineWidth = 2.2;
  c.lineCap = 'round';
  c.beginPath();
  if (frame === 0) {
    c.moveTo(cx - 1, cy - 2);
    c.lineTo(cx + 8, cy - 6);
    c.moveTo(cx - 1, cy + 2);
    c.lineTo(cx - 8, cy + 6);
  } else {
    c.moveTo(cx - 1, cy + 2);
    c.lineTo(cx + 8, cy + 6);
    c.moveTo(cx - 1, cy - 2);
    c.lineTo(cx - 8, cy - 6);
  }
  c.stroke();
  shadowed(c, 1, 0.35, () => disc(c, cap, cx + 1.5, cy, 3.6));
  disc(c, 'rgba(255,255,255,0.6)', cx + 0.6, cy - 1.2, 1);
}

/** A splash of blood on the water, 96 x 96: blobs and drops around the middle (in shades of red). */
export function drawBloodSplat(c: Ctx): void {
  let seed = 7;
  const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2, d = Math.pow(rnd(), 0.7) * 40;
    const r = (1 - d / 48) * 9 + 1.5;
    disc(c, i % 3 ? 'rgba(170,16,24,0.85)' : 'rgba(120,8,14,0.9)', 48 + Math.cos(a) * d, 48 + Math.sin(a) * d, r);
  }
  disc(c, 'rgba(150,10,20,0.9)', 48, 48, 14);
  for (let i = 0; i < 6; i++) disc(c, 'rgba(255,120,120,0.35)', 44 + rnd() * 8, 44 + rnd() * 8, 2);
}

/** A chunk (for the mess): a red lump with a paler bit, 10 x 8. */
export function drawGib(c: Ctx): void {
  c.beginPath();
  c.ellipse(5, 4, 4.4, 3.2, 0.4, 0, Math.PI * 2);
  c.fillStyle = '#b3121c';
  c.fill();
  c.beginPath();
  c.ellipse(4, 3.3, 2, 1.3, 0.4, 0, Math.PI * 2);
  c.fillStyle = '#f08a8a';
  c.fill();
}

/** A feather, 12 x 4, white. */
export function drawFeather(c: Ctx): void {
  c.beginPath();
  c.ellipse(6, 2, 5.6, 1.7, 0, 0, Math.PI * 2);
  c.fillStyle = '#f4f1ea';
  c.fill();
  c.strokeStyle = '#b8b2a6';
  c.lineWidth = 0.4;
  c.beginPath();
  c.moveTo(0.5, 2);
  c.lineTo(11.5, 2);
  c.stroke();
}

/** A vacuum cleaner's hose and wide nozzle on the bow, pointing right, 46 x 26. */
export function drawNozzle(c: Ctx): void {
  shadowed(c, 1.5, 0.45, () => {
    c.fillStyle = '#5c636c';
    rr(c, 0, 9, 26, 8, 4);
    c.fill();
  });
  c.strokeStyle = 'rgba(255,255,255,0.35)';
  c.lineWidth = 0.6;
  for (let x = 3; x < 25; x += 3) {
    c.beginPath();
    c.moveTo(x, 9.5);
    c.lineTo(x, 16.5);
    c.stroke();
  }
  shadowed(c, 1.5, 0.45, () => {
    c.beginPath();
    c.moveTo(24, 8);
    c.lineTo(42, 1);
    c.lineTo(45, 1);
    c.lineTo(45, 25);
    c.lineTo(42, 25);
    c.lineTo(24, 18);
    c.closePath();
    c.fillStyle = '#d23b2f';
    c.fill();
  });
  c.fillStyle = '#2b2f35';
  c.fillRect(43, 2, 2, 22); // the mouth
  c.fillStyle = 'rgba(255,255,255,0.35)';
  c.fillRect(27, 9, 12, 2);
}

/**
 * A drill bit alone, pointing right, 72 x 16: a steel shank, a twisted fluted body and a sharp
 * point. `frame` shifts the spiral, so swapping frames makes it spin.
 */
export function drawDrillBit(c: Ctx, frame: number): void {
  const cy = 8;
  shadowed(c, 1.5, 0.45, () => {
    c.beginPath();
    c.moveTo(0, cy - 3.2);
    c.lineTo(18, cy - 3.2);
    c.lineTo(20, cy - 5.5);
    c.lineTo(60, cy - 5.5);
    c.lineTo(71.5, cy);
    c.lineTo(60, cy + 5.5);
    c.lineTo(20, cy + 5.5);
    c.lineTo(18, cy + 3.2);
    c.lineTo(0, cy + 3.2);
    c.closePath();
    const g = c.createLinearGradient(0, cy - 5.5, 0, cy + 5.5);
    g.addColorStop(0, '#f4f6f8');
    g.addColorStop(0.45, '#aeb5bd');
    g.addColorStop(1, '#5c636c');
    c.fillStyle = g;
    c.fill();
  });
  c.strokeStyle = 'rgba(30,34,40,0.8)';
  c.lineWidth = 0.7;
  c.stroke();
  // the flutes: dark diagonal grooves twisting along the body
  c.save();
  c.beginPath();
  c.moveTo(20, cy - 5.5);
  c.lineTo(60, cy - 5.5);
  c.lineTo(71.5, cy);
  c.lineTo(60, cy + 5.5);
  c.lineTo(20, cy + 5.5);
  c.closePath();
  c.clip();
  c.strokeStyle = 'rgba(40,46,54,0.75)';
  c.lineWidth = 2.2;
  for (let x = 14 + frame * 3; x < 76; x += 6) {
    c.beginPath();
    c.moveTo(x, cy - 6);
    c.lineTo(x + 5, cy + 6);
    c.stroke();
  }
  c.strokeStyle = 'rgba(255,255,255,0.55)';
  c.lineWidth = 0.8;
  for (let x = 16 + frame * 3; x < 76; x += 6) {
    c.beginPath();
    c.moveTo(x, cy - 6);
    c.lineTo(x + 5, cy + 6);
    c.stroke();
  }
  c.restore();
  // a gold tip coating, like a real HSS bit
  c.fillStyle = 'rgba(214,170,60,0.55)';
  c.beginPath();
  c.moveTo(60, cy - 5.5);
  c.lineTo(71.5, cy);
  c.lineTo(60, cy + 5.5);
  c.closePath();
  c.fill();
}
