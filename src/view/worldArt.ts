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

/** A cordless drill flying bit first, 54 x 22. */
export function drawDrill(c: Ctx): void {
  shadowed(c, 1.5, 0.45, () => {
    // battery and grip (seen from above they stick out below the body)
    rr(c, 2, 9, 9, 11, 2);
    c.fillStyle = '#2a2d33';
    c.fill();
    // body
    rr(c, 1, 3, 24, 13, 4.5);
    const g = c.createLinearGradient(0, 3, 0, 16);
    g.addColorStop(0, '#ff6b5e');
    g.addColorStop(0.5, '#e0362b');
    g.addColorStop(1, '#a51f17');
    c.fillStyle = g;
    c.fill();
  });
  c.strokeStyle = 'rgba(60,8,4,0.85)';
  c.lineWidth = 0.9;
  rr(c, 1, 3, 24, 13, 4.5);
  c.stroke();
  // vents and a grip pad
  c.strokeStyle = 'rgba(40,6,2,0.6)';
  c.lineWidth = 1;
  for (let x = 5; x < 12; x += 2.4) {
    c.beginPath();
    c.moveTo(x, 6);
    c.lineTo(x, 10);
    c.stroke();
  }
  rr(c, 14, 6.4, 8, 6, 2);
  c.fillStyle = '#2a2d33';
  c.fill();
  c.fillStyle = 'rgba(255,255,255,0.35)';
  c.fillRect(4, 4.4, 17, 1.2);
  // chuck: knurled steel
  const cg = c.createLinearGradient(0, 4.5, 0, 14.5);
  cg.addColorStop(0, '#f1f3f5');
  cg.addColorStop(0.5, '#9aa2ab');
  cg.addColorStop(1, '#5c636c');
  c.fillStyle = cg;
  c.beginPath();
  c.moveTo(25, 4.5);
  c.lineTo(32, 6);
  c.lineTo(32, 13);
  c.lineTo(25, 14.5);
  c.closePath();
  c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.5)';
  c.lineWidth = 0.6;
  c.stroke();
  for (let x = 26.5; x < 32; x += 1.6) {
    c.beginPath();
    c.moveTo(x, 5.2);
    c.lineTo(x, 13.8);
    c.stroke();
  }
  // the bit: a steel spiral coming to a point
  c.beginPath();
  c.moveTo(32, 7.4);
  c.lineTo(48, 8);
  c.lineTo(53.5, 9.5);
  c.lineTo(48, 11);
  c.lineTo(32, 11.6);
  c.closePath();
  const bg = c.createLinearGradient(0, 7, 0, 12);
  bg.addColorStop(0, '#ffffff');
  bg.addColorStop(0.5, '#c2c8cf');
  bg.addColorStop(1, '#6b727b');
  c.fillStyle = bg;
  c.fill();
  c.strokeStyle = 'rgba(20,24,30,0.8)';
  c.lineWidth = 0.6;
  c.stroke();
  c.strokeStyle = 'rgba(40,46,54,0.85)';
  c.lineWidth = 0.9;
  for (let x = 33.5; x < 49; x += 3.1) {
    c.beginPath();
    c.moveTo(x, 11.4);
    c.lineTo(x + 2.2, 7.7);
    c.stroke();
  }
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
