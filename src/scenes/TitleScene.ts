import Phaser from 'phaser';
import { LANGUAGES, getLanguage, setLanguage, t } from '../i18n';
import { addFullscreenButton, enterFullscreen } from '../view/fullscreen';
import { audio } from '../audio/AudioManager';
import { getBoat } from '../data/boats';
import { createBoatSprite } from '../view/boatSprite';
import { background, button, fitText, text } from '../view/ui';

/** Where the canal runs along the bottom of the screen (top of the water, bottom of the screen). */
const CANAL = { grass: 560, towpath: 590, quay: 613, water: 619 };
const PARADE = [
  { id: 'cabourg', color: 0xff5a4d },
  { id: 'cigaretteSpeedboat', color: 0x4da3ff },
  { id: 'partyPontoon', color: 0xffd23f },
  { id: 'tugboat', color: 0x62d26f },
];

/**
 * The main menu: the title, three clear buttons (Play, Play online, Options), the language and
 * fullscreen buttons, and a stretch of canal along the bottom where the boats race past.
 */
export class TitleScene extends Phaser.Scene {
  private boats: { sprite: Phaser.GameObjects.Container; speed: number; lane: number; next: number }[] = [];
  private wake!: Phaser.GameObjects.Particles.ParticleEmitter;
  private started = false;

  constructor() {
    super('Title');
  }

  create(): void {
    this.started = false;
    this.boats = [];
    background(this);
    audio.playMusic('menu');
    this.drawCanal();
    this.addParade();

    // Title: warm gradient letters with a thick outline, gently bobbing like a boat.
    const title = text(this, 640, 158, 'FAST & FLUVIAL', 104, '#ffffff').setStroke('#0b3a5b', 16).setShadow(0, 9, '#00000066', 0, true, true);
    const grad = title.context.createLinearGradient(0, 0, 0, title.height);
    grad.addColorStop(0.15, '#fff3c4');
    grad.addColorStop(0.55, '#ffd23f');
    grad.addColorStop(1, '#ff9f43');
    title.setFill(grad);
    fitText(title, 1180);
    const titleScale = title.scale;
    this.tweens.add({ targets: title, y: 165, angle: { from: -1.2, to: 1.2 }, duration: 2200, ease: 'Sine.easeInOut', yoyo: true, repeat: -1 });
    title.setScale(titleScale * 1.4).setAlpha(0);
    this.tweens.add({ targets: title, scale: titleScale, alpha: 1, duration: 500, ease: 'Back.easeOut' });
    // A little wave under the title.
    const wave = this.add.graphics();
    wave.lineStyle(6, 0x6fc3ff, 0.9);
    wave.beginPath();
    for (let x = 0; x <= 520; x += 4) {
      const y = 228 + Math.sin(x / 26) * 6;
      if (x === 0) wave.moveTo(380 + x, y);
      else wave.lineTo(380 + x, y);
    }
    wave.strokePath();
    fitText(text(this, 640, 266, t('title.subtitle'), 28, '#d7efff', false), 1100);

    // The menu.
    const items = [
      button(this, 640, 346, 440, 84, t('title.play'), () => this.go('BoatSelect'), { fill: 0x2d9d5a, textSize: 40 }),
      button(this, 640, 438, 440, 70, t('online.title'), () => this.go('Online'), { fill: 0x2f7fb5, textSize: 32 }),
      button(this, 640, 514, 300, 58, t('menu.options'), () => this.go('Options'), { fill: 0x3d5266, textSize: 26 }),
    ];
    items.forEach((b, i) => {
      const y = b.y;
      b.setAlpha(0).setY(y + 30);
      this.tweens.add({ targets: b, alpha: 1, y, delay: 250 + i * 110, duration: 380, ease: 'Cubic.easeOut' });
    });
    this.input.keyboard?.once('keydown-ENTER', () => this.go('BoatSelect'));

    // Language picker (top left) and fullscreen (top right).
    LANGUAGES.forEach((lang, i) => {
      const current = lang.code === getLanguage().code;
      const b = button(this, 90 + i * 150, 50, 136, 46, lang.name, () => {
        setLanguage(lang.code);
        this.scene.restart();
      }, { fill: current ? 0x2d9d5a : 0x0b3a5b, textSize: 20 });
      b.setAlpha(current ? 1 : 0.8);
    });
    addFullscreenButton(this, 1220, 50);

    // Controls reminder and version, written on the towpath.
    const pathY = (CANAL.towpath + CANAL.quay) / 2;
    fitText(text(this, 640, pathY, t('title.hint'), 17, '#5a4a32', false), 1000).setDepth(3);
    text(this, 1268, pathY, `v${__APP_VERSION__}`, 14, '#7a6a52', false).setOrigin(1, 0.5).setDepth(3);
  }

  /** Leave for another screen. On phones and tablets the first press also goes fullscreen (needs a tap). */
  private go(scene: string): void {
    if (this.started) return;
    this.started = true;
    if (this.sys.game.device.input.touch) enterFullscreen(this);
    this.scene.start(scene);
  }

  /** A stretch of canal seen from above: grass with trees, the towpath, a stone quay, then water. */
  private drawCanal(): void {
    const g = this.add.graphics();
    g.fillStyle(0x6f9a4a, 1).fillRect(0, CANAL.grass, 1280, CANAL.towpath - CANAL.grass);
    g.fillStyle(0xd6c9a6, 1).fillRect(0, CANAL.towpath, 1280, CANAL.quay - CANAL.towpath);
    g.fillStyle(0x8d8a83, 1).fillRect(0, CANAL.quay, 1280, CANAL.water - CANAL.quay);
    g.fillStyle(0x2f6a92, 1).fillRect(0, CANAL.water, 1280, 720 - CANAL.water);
    // Quay stones
    g.lineStyle(1, 0x6f6c66, 0.8);
    for (let x = 0; x < 1280; x += 26) g.lineBetween(x, CANAL.quay, x, CANAL.water);
    // The grass edge is a little ragged.
    g.fillStyle(0x6f9a4a, 1);
    for (let x = 0; x < 1280; x += 18) g.fillCircle(x + ((x * 7) % 11), CANAL.grass + 2, 9);
    const waves = this.add.tileSprite(0, CANAL.water, 1280, 720 - CANAL.water, 'water').setOrigin(0).setAlpha(0.8);
    this.events.on('update', () => {
      waves.tilePositionX -= 0.3;
    });
    // A row of trees along the top bank (behind the menu, in front of the background).
    for (let x = 14, i = 0; x < 1300; x += 56 + ((i * 37) % 44), i++) {
      const r = 18 + ((i * 13) % 11);
      const y = CANAL.grass + 6 + ((i * 17) % 14) - 4;
      const tint = [0x4f7a32, 0x5d8a3a, 0x3f6a2a, 0x6a9442][i % 4];
      this.add.image(x + r * 0.35, y + r * 0.45, 'crownShadow').setScale(r / 30).setAlpha(0.22);
      this.add.image(x, y, 'crown').setScale(r / 30).setTint(tint);
    }
  }

  /** Boats race along the canal, overtaking each other, and come round again. */
  private addParade(): void {
    this.wake = this.add.particles(0, 0, 'wake', {
      lifespan: 1100, speed: 0, scale: { start: 0.35, end: 1.4 }, alpha: { start: 0.45, end: 0 }, emitting: false,
    }).setDepth(4);
    PARADE.forEach((p, i) => {
      const def = getBoat(p.id);
      const sprite = createBoatSprite(this, def, p.color).setScale(1.7).setDepth(5);
      const lane = i % 2;
      sprite.setPosition(120 + i * 330, this.laneY(lane)); // spread along the canal from the start
      this.boats.push({ sprite, speed: 150 + i * 22 + Math.random() * 40, lane, next: 0 });
    });
    this.events.on('update', (_t: number, dt: number) => this.updateParade(dt / 1000));
  }

  private laneY(lane: number): number {
    return lane === 0 ? 650 : 690;
  }

  private updateParade(dt: number): void {
    for (const b of this.boats) {
      const s = b.sprite;
      s.x += b.speed * dt;
      // Drift towards the boat's lane, with a little bobbing.
      s.y += (this.laneY(b.lane) + Math.sin(s.x / 90) * 3 - s.y) * Math.min(1, dt * 2);
      s.rotation = Math.sin(s.x / 140) * 0.03;
      b.next -= dt;
      if (b.next <= 0) {
        b.next = 0.05;
        this.wake.emitParticleAt(s.x - 80, s.y + Math.sin(s.x) * 3, 1);
      }
      if (s.x > 1480) {
        // Round again, with a new speed and maybe the other lane: the order keeps changing.
        s.x = -220 - Math.random() * 400;
        b.speed = 150 + Math.random() * 110;
        b.lane = Math.random() < 0.5 ? 0 : 1;
      }
    }
  }
}
