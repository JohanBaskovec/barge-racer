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
