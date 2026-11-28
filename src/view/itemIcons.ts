import Phaser from 'phaser';

type G = Phaser.GameObjects.Graphics;
const V = (x: number, y: number): Phaser.Math.Vector2 => new Phaser.Math.Vector2(x, y);
const OUTLINE = 0x2b2b2b;

/** HUD icons for the items, 96x96, drawn in code (replace with sprites when real art exists). */
const ICONS: Record<string, (g: G) => void> = {
  // A cheerful volunteer in an orange life vest, waving both arms.
  icon_volunteer: (g) => {
    g.lineStyle(5, 0xffd2a8).lineBetween(30, 56, 16, 30).lineBetween(66, 56, 80, 30); // arms
    g.fillStyle(0xffd2a8).fillCircle(16, 28, 6).fillCircle(80, 28, 6); // hands
    g.fillStyle(0x3b6ea8).fillRoundedRect(32, 62, 12, 26, 4).fillRoundedRect(52, 62, 12, 26, 4); // legs
    g.fillStyle(0xff8a1f).fillRoundedRect(26, 44, 44, 28, 10); // vest
    g.lineStyle(3, OUTLINE).strokeRoundedRect(26, 44, 44, 28, 10);
    g.fillStyle(0xf2f2f2).fillRect(34, 44, 6, 28).fillRect(56, 44, 6, 28); // reflective stripes
    g.fillStyle(0xffd2a8).fillCircle(48, 28, 15); // head
    g.lineStyle(3, OUTLINE).strokeCircle(48, 28, 15);
    g.fillStyle(0xffd23f).fillRoundedRect(33, 10, 30, 10, 5); // cap
    g.fillStyle(OUTLINE).fillCircle(42, 28, 2).fillCircle(54, 28, 2);
    g.lineStyle(2.5, OUTLINE).beginPath().arc(48, 31, 6, 0.2, Math.PI - 0.2).strokePath(); // smile
  },

  // A jigsaw: yellow body with a long toothed blade.
  icon_jigsaw: (g) => {
    g.fillStyle(0xd7dde2).fillRect(46, 52, 14, 40); // blade
    g.fillStyle(0x9aa3aa);
    for (let i = 0; i < 6; i++) g.fillTriangle(46, 56 + i * 6, 46, 62 + i * 6, 40, 59 + i * 6);
    g.lineStyle(3, OUTLINE).strokeRect(46, 52, 14, 40);
    g.fillStyle(0xf2b705).fillRoundedRect(18, 14, 62, 40, 10); // motor body
    g.lineStyle(3, OUTLINE).strokeRoundedRect(18, 14, 62, 40, 10);
    g.fillStyle(0x333333).fillRoundedRect(36, 4, 30, 14, 6); // handle grip
    g.fillStyle(0x2b2b2b).fillRoundedRect(26, 24, 18, 22, 4);
    g.fillStyle(0xe8532f).fillCircle(66, 30, 6); // switch
    g.fillStyle(0xffffff, 0.7).fillRect(48, 40, 4, 10);
  },

  // A tied-off bag of white powder with sparkles.
  icon_powder: (g) => {
    g.fillStyle(0xffffff).fillPoints([V(34, 30), V(62, 30), V(80, 58), V(76, 82), V(20, 82), V(16, 58)], true);
    g.fillStyle(0xf2f2f2).fillEllipse(48, 72, 62, 22);
    g.lineStyle(3, OUTLINE).strokePoints([V(34, 30), V(62, 30), V(80, 58), V(76, 82), V(20, 82), V(16, 58)], true);
    g.fillStyle(0xe8eef2).fillRect(32, 22, 32, 10); // gathered neck
    g.lineStyle(3, OUTLINE).strokeRect(32, 22, 32, 10);
    g.fillStyle(0xd23b3b).fillRect(30, 26, 36, 5); // tie
    g.fillStyle(0xffffff).fillTriangle(30, 12, 36, 12, 33, 2).fillTriangle(60, 10, 66, 10, 63, 0);
    // sparkles
    g.fillStyle(0xfff8c0);
    for (const [x, y, s] of [[12, 22, 7], [84, 34, 9], [86, 76, 6], [10, 80, 6]]) {
      g.fillTriangle(x - s, y, x, y - s * 1.6, x + s, y).fillTriangle(x - s, y, x, y + s * 1.6, x + s, y);
    }
  },

  // An electric drill: red body, trigger, grey chuck and a spiral bit.
  icon_drill: (g) => {
    g.fillStyle(0xd62f2f).fillRoundedRect(8, 22, 54, 30, 10); // body
    g.lineStyle(3, OUTLINE).strokeRoundedRect(8, 22, 54, 30, 10);
    g.fillStyle(0x2f2f2f).fillRoundedRect(20, 48, 22, 40, 6); // handle
    g.lineStyle(3, OUTLINE).strokeRoundedRect(20, 48, 22, 40, 6);
    g.fillStyle(0xffc933).fillRect(12, 28, 8, 18); // battery band
    g.fillStyle(0x9aa3aa).fillRect(62, 28, 12, 18); // chuck
    g.lineStyle(2, OUTLINE).strokeRect(62, 28, 12, 18);
    g.fillStyle(0xdde3e8).fillTriangle(74, 30, 74, 44, 94, 37); // bit
    g.lineStyle(2, 0x777f86).lineBetween(78, 32, 80, 42).lineBetween(84, 33, 86, 41).lineBetween(89, 35, 90, 39);
    g.lineStyle(3, OUTLINE).strokeTriangle(74, 30, 74, 44, 94, 37);
    g.fillStyle(0xffffff, 0.35).fillRoundedRect(14, 25, 38, 6, 3);
  },

  // A wooden crate of beer: bottles with gold caps poking out, foam on one of them.
  icon_beer: (g) => {
    g.fillStyle(0x7a4a1c).fillRoundedRect(6, 44, 84, 44, 6); // crate
    g.fillStyle(0x9a6a3a).fillRect(10, 48, 76, 14).fillRect(10, 68, 76, 16);
    g.lineStyle(3, OUTLINE).strokeRoundedRect(6, 44, 84, 44, 6);
    g.lineStyle(2, 0x5b3b1c).lineBetween(10, 66, 86, 66);
    for (let i = 0; i < 4; i++) {
      const x = 18 + i * 20;
      g.fillStyle(0xd68a1a).fillRoundedRect(x - 7, 12, 14, 38, 5); // bottle
      g.fillStyle(0xf2b24a).fillRect(x - 3, 16, 3, 28); // shine
      g.fillStyle(0x8c5a10).fillRect(x - 4, 4, 8, 12); // neck
      g.fillStyle(0xf5d76e).fillRoundedRect(x - 6, 0, 12, 7, 2); // cap
      g.lineStyle(2, OUTLINE).strokeRoundedRect(x - 7, 12, 14, 38, 5);
    }
    g.fillStyle(0xffffff).fillCircle(58, 4, 6).fillCircle(66, 6, 5).fillCircle(52, 8, 4); // foam
  },

  // The fake crate: the very same crate as in the world, with a sly red badge so the owner knows.
  icon_fakeCrate: (g) => {
    g.fillStyle(0x9a6a3a).fillRoundedRect(10, 10, 76, 76, 8);
    g.lineStyle(5, 0x5b3b1c).strokeRoundedRect(10, 10, 76, 76, 8);
    g.lineStyle(5, 0x5b3b1c).lineBetween(10, 10, 86, 86).lineBetween(86, 10, 10, 86);
    g.fillStyle(0xffe08a).fillCircle(48, 48, 18);
    g.fillStyle(0x5b3b1c).fillCircle(48, 48, 5);
    g.fillStyle(0xd62f2f).fillCircle(76, 76, 17).lineStyle(3, OUTLINE).strokeCircle(76, 76, 17);
    g.fillStyle(0xffffff).fillRect(74, 66, 5, 13).fillCircle(76.5, 84, 3);
  },

  // A silicone (caulking) gun: grey frame, orange cartridge, nozzle dripping glue.
  icon_silicone: (g) => {
    g.fillStyle(0xe87a1f).fillRoundedRect(22, 14, 54, 22, 8); // cartridge
    g.lineStyle(3, OUTLINE).strokeRoundedRect(22, 14, 54, 22, 8);
    g.fillStyle(0xffffff, 0.45).fillRoundedRect(28, 18, 36, 5, 2);
    g.fillStyle(0xe8e0c8).fillTriangle(76, 18, 76, 32, 92, 25); // nozzle
    g.lineStyle(3, OUTLINE).strokeTriangle(76, 18, 76, 32, 92, 25);
    g.fillStyle(0x6f7880).fillRoundedRect(8, 30, 66, 10, 3); // frame
    g.lineStyle(3, OUTLINE).strokeRoundedRect(8, 30, 66, 10, 3);
    g.fillStyle(0x3a3f44).fillRoundedRect(14, 38, 20, 40, 7); // grip
    g.lineStyle(3, OUTLINE).strokeRoundedRect(14, 38, 20, 40, 7);
    g.fillStyle(0xc9ced3).fillRoundedRect(36, 40, 10, 24, 4); // trigger
    g.lineStyle(2, OUTLINE).strokeRoundedRect(36, 40, 10, 24, 4);
    g.fillStyle(0xf2e27a).fillCircle(84, 38, 4.5).fillRoundedRect(80.5, 38, 7, 34, 3.5).fillEllipse(84, 82, 22, 8); // glue drip
  },

  // A magic mushroom: bright, wobbly cap with rainbow spots.
  icon_mushroom: (g) => {
    g.fillStyle(0xf5ecd5).fillRoundedRect(36, 46, 24, 40, 10); // stem
    g.lineStyle(3, OUTLINE).strokeRoundedRect(36, 46, 24, 40, 10);
    g.fillStyle(0xe7dcc0).fillRect(36, 60, 24, 4);
    g.fillStyle(0xb02ec7).fillPoints([V(6, 52), V(10, 30), V(24, 14), V(48, 8), V(72, 14), V(86, 30), V(90, 52)], true); // cap
    g.lineStyle(3, OUTLINE).strokePoints([V(6, 52), V(10, 30), V(24, 14), V(48, 8), V(72, 14), V(86, 30), V(90, 52)], false);
    g.fillStyle(0x7a1d8f).fillRect(6, 48, 84, 8);
    const spots: [number, number, number, number][] = [[28, 30, 7, 0xffe066], [52, 22, 6, 0x66e0ff], [70, 36, 8, 0x7dff8a], [44, 40, 5, 0xff7ab8], [18, 44, 4, 0x66e0ff]];
    for (const [x, y, r, c] of spots) g.fillStyle(c).fillCircle(x, y, r).lineStyle(2, OUTLINE).strokeCircle(x, y, r);
  },

  // Electrical failure: a cable cut in two, the copper ends sparking, a bolt between them.
  icon_blackout: (g) => {
    g.lineStyle(14, OUTLINE).lineBetween(6, 82, 38, 60).lineBetween(58, 38, 90, 14); // cable outline
    g.lineStyle(9, 0x3b4048).lineBetween(6, 82, 38, 60).lineBetween(58, 38, 90, 14);
    g.lineStyle(3, 0x6f7780).lineBetween(8, 78, 36, 58).lineBetween(60, 34, 88, 12);
    g.fillStyle(0xe8832f).fillCircle(41, 57, 6).fillCircle(55, 41, 6); // copper
    g.lineStyle(2, 0xffc27a);
    for (const [x, y, dx, dy] of [[41, 57, 7, 1], [41, 57, 5, -5], [55, 41, -7, -1], [55, 41, -5, 5]]) g.lineBetween(x, y, x + dx, y + dy);
    // the bolt
    const bolt = [V(52, 24), V(36, 50), V(48, 50), V(40, 76), V(66, 42), V(53, 42), V(62, 24)];
    g.fillStyle(0xffe04a).fillPoints(bolt, true);
    g.lineStyle(3, OUTLINE).strokePoints(bolt, true, true);
    g.fillStyle(0xffffff, 0.8).fillTriangle(53, 28, 45, 44, 50, 44);
    // sparks
    g.fillStyle(0xfff8c0);
    for (const [x, y, sz] of [[20, 40, 6], [78, 62, 7], [30, 18, 5], [70, 84, 5]]) {
      g.fillTriangle(x - sz, y, x, y - sz * 1.6, x + sz, y).fillTriangle(x - sz, y, x, y + sz * 1.6, x + sz, y);
    }
  },

  // Ultimate raclette: a half wheel of cheese melting over the heater, a potato and a slice of ham.
  icon_raclette: (g) => {
    g.fillStyle(0x3a3f46).fillRoundedRect(6, 66, 84, 20, 6); // base
    g.lineStyle(3, OUTLINE).strokeRoundedRect(6, 66, 84, 20, 6);
    g.fillStyle(0x2b2f35).fillRect(14, 84, 10, 8).fillRect(72, 84, 10, 8); // feet
    g.fillStyle(0xd23b2b).fillRoundedRect(12, 58, 72, 10, 4); // heating element
    g.lineStyle(2, 0xffb36b).lineBetween(18, 63, 78, 63);
    g.lineStyle(3, OUTLINE).strokeRoundedRect(12, 58, 72, 10, 4);
    // the half wheel of cheese, melting
    const wheel: Phaser.Math.Vector2[] = [];
    for (let k = 0; k <= 16; k++) {
      const a = Math.PI + (Math.PI * k) / 16;
      wheel.push(V(34 + Math.cos(a) * 28, 58 + Math.sin(a) * 28));
    }
    g.fillStyle(0xffd23f).fillPoints(wheel, true);
    g.fillStyle(0xf2b705).fillRect(6, 52, 56, 7); // the cut face
    g.lineStyle(3, OUTLINE).strokePoints(wheel, true, true);
    g.fillStyle(0xd68f00).fillCircle(24, 40, 4).fillCircle(40, 34, 3).fillCircle(46, 46, 3.5).fillCircle(16, 50, 2.5); // holes
    g.fillStyle(0xffd23f).fillRoundedRect(14, 56, 12, 30, 5).fillRoundedRect(34, 56, 9, 22, 4).fillRoundedRect(48, 56, 10, 16, 4); // drips
    g.fillStyle(0xffd23f).fillEllipse(20, 86, 16, 7).fillEllipse(38.5, 78, 12, 6);
    g.lineStyle(2, 0xc98a00).strokeRoundedRect(14, 56, 12, 30, 5);
    // a potato and a slice of ham on top
    g.fillStyle(0xc49a55).fillEllipse(74, 40, 26, 20);
    g.lineStyle(3, OUTLINE).strokeEllipse(74, 40, 26, 20);
    g.fillStyle(0x8a6532).fillCircle(69, 38, 2).fillCircle(79, 43, 2);
    g.fillStyle(0xf09aa3).fillRoundedRect(58, 14, 32, 18, 8);
    g.lineStyle(3, OUTLINE).strokeRoundedRect(58, 14, 32, 18, 8);
    g.lineStyle(2, 0xfde3e0).lineBetween(64, 22, 78, 20).lineBetween(70, 27, 84, 25);
  },

  // Clogged toilet: a bowl brimming with green sludge, stink clouds rising.
  icon_toilet: (g) => {
    g.fillStyle(0xf2f2f2).fillRoundedRect(22, 52, 52, 34, 10); // bowl base
    g.lineStyle(3, OUTLINE).strokeRoundedRect(22, 52, 52, 34, 10);
    g.fillStyle(0xe4e7ea).fillRect(30, 84, 36, 8);
    g.lineStyle(3, OUTLINE).strokeRect(30, 84, 36, 8);
    g.fillStyle(0xffffff).fillEllipse(48, 54, 66, 24); // rim
    g.lineStyle(3, OUTLINE).strokeEllipse(48, 54, 66, 24);
    g.fillStyle(0x7fa334).fillEllipse(48, 54, 48, 14); // sludge
    g.fillStyle(0x4f6e1f).fillEllipse(52, 55, 28, 7);
    g.fillStyle(0xb7d85a).fillCircle(38, 52, 3.5).fillCircle(54, 50, 4.5).fillCircle(61, 56, 3); // bubbles
    g.fillStyle(0xffffff).fillRoundedRect(24, 38, 48, 12, 4); // tank
    g.lineStyle(3, OUTLINE).strokeRoundedRect(24, 38, 48, 12, 4);
    g.fillStyle(0xb8bec4).fillCircle(48, 44, 3);
    // the stink
    g.fillStyle(0x9bbd3c, 0.9).fillCircle(32, 26, 11).fillCircle(48, 18, 13).fillCircle(64, 26, 11).fillCircle(42, 30, 9).fillCircle(56, 31, 9);
    g.fillStyle(0xc8e070, 0.9).fillCircle(44, 14, 6).fillCircle(30, 22, 4);
    g.lineStyle(3, 0x4f6e1f).beginPath().arc(48, 18, 13, Math.PI * 1.05, Math.PI * 1.95).strokePath();
    g.lineStyle(2.5, 0x4f6e1f);
    for (const x of [20, 76]) g.beginPath().moveTo(x, 40).lineTo(x - 5, 32).lineTo(x + 3, 26).lineTo(x - 2, 18).strokePath(); // stink lines
  },

  // A Kärcher-style pressure washer: yellow body, black grip, a long lance and a fan of water.
  icon_karcher: (g) => {
    g.lineStyle(7, OUTLINE).beginPath().moveTo(18, 62).lineTo(18, 84).lineTo(34, 90).strokePath(); // hose
    g.lineStyle(4, 0x2f3338).beginPath().moveTo(18, 62).lineTo(18, 84).lineTo(34, 90).strokePath();
    g.fillStyle(0x2f3338).fillRoundedRect(16, 54, 14, 26, 6); // grip
    g.lineStyle(3, OUTLINE).strokeRoundedRect(16, 54, 14, 26, 6);
    g.fillStyle(0xf5c518).fillRoundedRect(4, 30, 46, 28, 10); // body
    g.lineStyle(3, OUTLINE).strokeRoundedRect(4, 30, 46, 28, 10);
    g.fillStyle(0xffffff, 0.45).fillRoundedRect(10, 34, 28, 6, 3);
    g.fillStyle(0x8f969d).fillRoundedRect(32, 56, 8, 14, 3); // trigger guard
    g.lineStyle(2, OUTLINE).strokeRoundedRect(32, 56, 8, 14, 3);
    g.fillStyle(0xb8bec4).fillRect(50, 40, 28, 8); // lance
    g.lineStyle(3, OUTLINE).strokeRect(50, 40, 28, 8);
    g.fillStyle(0x3b6ea8).fillRect(74, 38, 8, 12); // nozzle
    g.lineStyle(2, OUTLINE).strokeRect(74, 38, 8, 12);
    // the jet
    g.lineStyle(4, 0xbfe6ff);
    for (const [dy, w] of [[-26, 3], [-13, 4], [0, 5], [13, 4], [26, 3]]) g.lineStyle(w, 0xbfe6ff, 0.9).lineBetween(82, 44, 94, 44 + dy * 0.9);
    g.fillStyle(0xffffff, 0.95).fillCircle(90, 20, 3).fillCircle(93, 30, 2.5).fillCircle(92, 58, 3).fillCircle(90, 70, 2.5).fillCircle(86, 44, 3);
  },

  // A tipped glue bottle with a long drip and a puddle.
  icon_glue: (g) => {
    g.fillStyle(0xf2e27a).fillEllipse(48, 84, 70, 18); // puddle
    g.lineStyle(3, 0xc9b44a).strokeEllipse(48, 84, 70, 18);
    g.fillStyle(0xf2e27a).fillRoundedRect(44, 52, 8, 26, 4).fillCircle(48, 78, 6); // drip
    g.fillStyle(0xffffff).fillRoundedRect(24, 6, 48, 40, 10); // bottle
    g.lineStyle(3, OUTLINE).strokeRoundedRect(24, 6, 48, 40, 10);
    g.fillStyle(0x2f7fb5).fillRect(24, 18, 48, 16); // label
    g.fillStyle(0xffffff).fillCircle(40, 26, 3).fillCircle(48, 26, 3).fillCircle(56, 26, 3);
    g.fillStyle(0xe8832f).fillTriangle(38, 46, 58, 46, 48, 58); // nozzle
    g.lineStyle(3, OUTLINE).strokeTriangle(38, 46, 58, 46, 48, 58);
  },

  // Dicke Titten: a giant cartoon pair, with a couple of wobble lines.
  icon_titten: (g) => {
    g.fillStyle(0x000000, 0.18).fillEllipse(48, 86, 82, 12); // shadow on the water
    for (const x of [28, 68]) {
      g.fillStyle(0xf0bf9c).fillCircle(x, 54, 26);
      g.fillStyle(0xffdcc4).fillCircle(x - 7, 46, 12); // light
      g.fillStyle(0xd9876f).fillCircle(x + 3, 58, 8.5); // areola
      g.fillStyle(0xbf5f52).fillCircle(x + 3, 58, 3.6); // nipple
      g.fillStyle(0xffffff, 0.6).fillCircle(x - 10, 42, 4);
      g.lineStyle(3, OUTLINE).strokeCircle(x, 54, 26);
    }
    g.lineStyle(3, OUTLINE).beginPath().arc(48, 40, 9, Math.PI * 0.15, Math.PI * 0.85).strokePath(); // cleavage
    g.lineStyle(3, 0xff6fa8);
    for (const [x, y, d] of [[6, 22, 1], [90, 22, -1]]) g.beginPath().arc(x + d * 6, y, 9, d > 0 ? Math.PI * 0.9 : -Math.PI * 0.1, d > 0 ? Math.PI * 1.4 : Math.PI * 0.4).strokePath();
    g.fillStyle(0xff6fa8).fillTriangle(40, 10, 48, 20, 56, 10).fillCircle(44, 10, 4.6).fillCircle(52, 10, 4.6); // a little heart
  },

  // A giant black dildo, diagonal, glossy.
  icon_dildo: (g) => {
    const pts = [V(70, 12), V(82, 18), V(86, 30), V(80, 40), V(40, 80), V(30, 82), V(18, 78), V(14, 66), V(18, 56), V(58, 18)];
    g.fillStyle(0x1d1d22).fillPoints(pts, true);
    g.lineStyle(3, 0x000000).strokePoints(pts, true);
    g.fillStyle(0x1d1d22).fillCircle(78, 22, 13); // the tip
    g.lineStyle(3, 0x000000).strokeCircle(78, 22, 13);
    g.fillStyle(0x2c2c33).fillCircle(20, 76, 13).fillCircle(32, 84, 10); // the base
    g.lineStyle(3, 0x000000).strokeCircle(20, 76, 13);
    g.fillStyle(0xffffff, 0.55).fillPoints([V(66, 20), V(72, 22), V(34, 62), V(28, 60)], true); // shine
    g.fillStyle(0xffffff, 0.75).fillCircle(74, 16, 3.5);
    g.lineStyle(2, 0x44444c);
    for (const t of [0.35, 0.5]) g.lineBetween(14 + 60 * t + 4, 66 - 50 * t - 6, 26 + 60 * t + 4, 78 - 50 * t - 6); // ridges
  },

  // A nail gun: orange body, black grip, a strip of nails, three nails flying out.
  icon_nailGun: (g) => {
    g.fillStyle(0x2f3338).fillRoundedRect(22, 46, 16, 36, 6); // grip
    g.lineStyle(3, OUTLINE).strokeRoundedRect(22, 46, 16, 36, 6);
    g.fillStyle(0xe8742a).fillRoundedRect(8, 22, 56, 28, 9); // body
    g.lineStyle(3, OUTLINE).strokeRoundedRect(8, 22, 56, 28, 9);
    g.fillStyle(0xffffff, 0.4).fillRoundedRect(14, 26, 30, 6, 3);
    g.fillStyle(0x8f969d).fillRect(40, 50, 26, 10); // magazine
    g.lineStyle(2, OUTLINE).strokeRect(40, 50, 26, 10);
    for (let k = 0; k < 6; k++) g.fillStyle(0xd7dde2).fillRect(42 + k * 4, 52, 2, 6);
    g.fillStyle(0x3b4048).fillRect(62, 30, 10, 12); // nose
    g.lineStyle(2, OUTLINE).strokeRect(62, 30, 10, 12);
    // three nails
    for (const [x, y] of [[76, 36], [84, 24], [84, 48]]) {
      g.fillStyle(0xc9ced4).fillRect(x, y - 1.5, 12, 3);
      g.fillStyle(0x8f969d).fillRect(x, y - 3.5, 2.5, 7);
      g.fillStyle(0xc9ced4).fillTriangle(x + 12, y - 1.5, x + 12, y + 1.5, x + 15, y);
    }
  },

  // Gas siphoning: a red jerrycan with a hose sucking the last drop out.
  icon_siphon: (g) => {
    g.fillStyle(0xd23b2f).fillRoundedRect(14, 30, 48, 58, 8); // can
    g.lineStyle(3, OUTLINE).strokeRoundedRect(14, 30, 48, 58, 8);
    g.fillStyle(0xffffff, 0.35).fillRoundedRect(19, 36, 8, 46, 4);
    g.lineStyle(3, 0x9c2a22).lineBetween(22, 44, 54, 76).lineBetween(54, 44, 22, 76); // the X pressing
    g.fillStyle(0x2f3338).fillRoundedRect(22, 18, 24, 12, 4); // handle
    g.lineStyle(3, OUTLINE).strokeRoundedRect(22, 18, 24, 12, 4);
    g.fillStyle(0xf2c12e).fillRect(50, 20, 10, 12); // spout
    g.lineStyle(2, OUTLINE).strokeRect(50, 20, 10, 12);
    // the hose, out of the spout and down
    g.lineStyle(6, OUTLINE).beginPath().moveTo(56, 20).lineTo(70, 8).lineTo(84, 18).lineTo(84, 70).strokePath();
    g.lineStyle(3, 0x7fc8a9).beginPath().moveTo(56, 20).lineTo(70, 8).lineTo(84, 18).lineTo(84, 70).strokePath();
    g.fillStyle(0x6b4e1f).fillCircle(84, 80, 5).fillTriangle(79, 79, 89, 79, 84, 70); // a drop of fuel
    // an empty gauge
    g.fillStyle(0xffffff).fillCircle(38, 60, 12);
    g.lineStyle(2.5, OUTLINE).strokeCircle(38, 60, 12);
    g.lineStyle(3, 0xd23b2f).lineBetween(38, 60, 30, 54);
    g.fillStyle(OUTLINE).fillCircle(38, 60, 2.5);
  },

  // A little red tugboat towing on a rope.
  icon_tugboat: (g) => {
    g.lineStyle(3, 0xc9a66b).beginPath().moveTo(10, 78).lineTo(24, 60).lineTo(34, 56).strokePath(); // tow rope
    g.fillStyle(0x2b4f7a).fillPoints([V(30, 50), V(80, 50), V(92, 58), V(80, 70), V(30, 70)], true); // hull
    g.lineStyle(3, OUTLINE).strokePoints([V(30, 50), V(80, 50), V(92, 58), V(80, 70), V(30, 70)], true);
    g.fillStyle(0x1f1f24).fillRect(30, 60, 58, 4); // rubber fender
    g.fillStyle(0xf2f2f2).fillRoundedRect(42, 30, 30, 22, 4); // wheelhouse
    g.lineStyle(3, OUTLINE).strokeRoundedRect(42, 30, 30, 22, 4);
    g.fillStyle(0x7fc8f2).fillRect(46, 34, 8, 8).fillRect(58, 34, 8, 8); // windows
    g.fillStyle(0xd23b2f).fillRect(48, 14, 10, 18); // funnel
    g.lineStyle(3, OUTLINE).strokeRect(48, 14, 10, 18);
    g.fillStyle(0x1f1f24).fillRect(48, 14, 10, 4);
    g.fillStyle(0xcfd4d8, 0.9).fillCircle(56, 8, 5).fillCircle(64, 4, 4); // smoke
    g.fillStyle(0xff8a1f).fillCircle(36, 56, 4); // life ring
    g.lineStyle(3, 0x7fc8f2, 0.8);
    for (const y of [76, 84]) g.beginPath().moveTo(30, y).lineTo(44, y - 3).lineTo(58, y).lineTo(72, y - 3).lineTo(86, y).strokePath(); // waves
  },

  // A bar's beer tap pouring into a foaming glass.
  icon_beerDispenser: (g) => {
    g.fillStyle(0xb8bec4).fillRoundedRect(10, 10, 52, 16, 6); // the tap's bar
    g.lineStyle(3, OUTLINE).strokeRoundedRect(10, 10, 52, 16, 6);
    g.fillStyle(0x2f3338).fillRoundedRect(28, 0, 12, 14, 4); // handle
    g.fillStyle(0xf2c12e).fillRoundedRect(26, 2, 16, 6, 3);
    g.fillStyle(0xb8bec4).fillRect(50, 24, 8, 12); // spout
    g.lineStyle(2, OUTLINE).strokeRect(50, 24, 8, 12);
    g.fillStyle(0xf2b02e).fillRect(52, 36, 4, 14); // the pour
    // the glass
    g.fillStyle(0xf2b02e).fillPoints([V(36, 52), V(78, 52), V(74, 92), V(40, 92)], true);
    g.fillStyle(0xffffff, 0.3).fillRect(44, 56, 5, 32);
    g.fillStyle(0xfff6dc).fillEllipse(57, 50, 48, 16).fillCircle(42, 48, 7).fillCircle(56, 44, 9).fillCircle(70, 47, 7); // foam
    g.lineStyle(3, OUTLINE).strokePoints([V(36, 52), V(78, 52), V(74, 92), V(40, 92)], true);
    // a sparkle of protection
    g.fillStyle(0xfff8c0);
    for (const [x, y, sz] of [[16, 56, 7], [86, 30, 6], [88, 70, 5]]) g.fillTriangle(x - sz, y, x, y - sz * 1.6, x + sz, y).fillTriangle(x - sz, y, x, y + sz * 1.6, x + sz, y);
  },

  // A canister vacuum cleaner with its hose and nozzle, and lines being sucked in.
  icon_vacuum: (g) => {
    g.lineStyle(7, OUTLINE).beginPath().moveTo(30, 62).lineTo(46, 40).lineTo(62, 30).strokePath(); // hose
    g.lineStyle(4, 0x5c636c).beginPath().moveTo(30, 62).lineTo(46, 40).lineTo(62, 30).strokePath();
    g.fillStyle(0xd23b2f).fillRoundedRect(4, 56, 46, 30, 12); // canister
    g.lineStyle(3, OUTLINE).strokeRoundedRect(4, 56, 46, 30, 12);
    g.fillStyle(0xffffff, 0.35).fillRoundedRect(10, 60, 26, 6, 3);
    g.fillStyle(0x2f3338).fillCircle(12, 88, 5).fillCircle(42, 88, 5); // wheels
    g.fillStyle(0x2f3338).fillPoints([V(60, 26), V(78, 16), V(84, 22), V(66, 36)], true); // nozzle
    g.lineStyle(2.5, OUTLINE).strokePoints([V(60, 26), V(78, 16), V(84, 22), V(66, 36)], true);
    g.lineStyle(3, 0x7fc8f2, 0.9);
    for (const [x0, y0, x1, y1] of [[94, 6, 84, 14], [96, 22, 88, 22], [92, 38, 84, 30], [78, 2, 76, 10]]) g.lineBetween(x0, y0, x1, y1);
  },
};

export function generateItemIcons(scene: Phaser.Scene): void {
  for (const [key, draw] of Object.entries(ICONS)) {
    if (scene.textures.exists(key)) continue;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    draw(g);
    g.generateTexture(key, 96, 96);
    g.destroy();
  }
}
