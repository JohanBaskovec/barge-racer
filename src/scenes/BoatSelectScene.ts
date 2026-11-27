import Phaser from 'phaser';
import { BOATS, deriveStats } from '../data/boats';
import { saveSession, session } from '../session';
import { background, button, text } from '../view/ui';

const STATS: { key: 'speed' | 'accel' | 'handling' | 'weight' | 'hull'; label: string }[] = [
  { key: 'speed', label: 'Speed' },
  { key: 'accel', label: 'Acceleration' },
  { key: 'handling', label: 'Handling' },
  { key: 'weight', label: 'Weight' },
  { key: 'hull', label: 'Hull' },
];

export class BoatSelectScene extends Phaser.Scene {
  private index = 0;
  private dyn!: Phaser.GameObjects.Container;

  constructor() {
    super('BoatSelect');
  }

  create(): void {
    this.index = Math.max(0, BOATS.findIndex((b) => b.id === session.boatId));
    background(this);
    text(this, 640, 60, 'Choose your boat', 52).setStroke('#0b3a5b', 8);
    this.dyn = this.add.container(0, 0);
    button(this, 75, 340, 100, 120, '‹', () => this.step(-1), { textSize: 80 });
    button(this, 1205, 340, 100, 120, '›', () => this.step(1), { textSize: 80 });
    button(this, 150, 660, 200, 64, 'Back', () => this.scene.start('Title'), { fill: 0x555f6b, textSize: 28 });
    button(this, 1090, 660, 300, 72, 'Next ▸', () => {
      session.boatId = BOATS[this.index].id;
      saveSession();
      this.scene.start('TrackSelect');
    }, { fill: 0x2d9d5a, textSize: 36 });

    // Swipe to browse
    let startX = 0;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => (startX = p.x));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (Math.abs(p.x - startX) > 90 && p.y > 120 && p.y < 560) this.step(p.x < startX ? 1 : -1);
    });
    this.input.keyboard?.on('keydown-LEFT', () => this.step(-1));
    this.input.keyboard?.on('keydown-RIGHT', () => this.step(1));
    this.render();
  }

  private step(d: number): void {
    this.index = (this.index + d + BOATS.length) % BOATS.length;
    this.render();
  }

  private render(): void {
    this.dyn.removeAll(true);
    const b = BOATS[this.index];
    const stats = deriveStats(b);
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.dyn.add(o);
      return o;
    };
    add(this.add.ellipse(430, 330, 380, 380, 0x000000, 0.18));
    const img = add(this.add.image(430, 330, `boat_${b.id}`).setTint(0xff5a4d));
    const sc = Math.min(3.4, 300 / b.size.length);
    img.setScale(sc).setRotation(-0.3);
    this.tweens.add({ targets: img, rotation: 0.1, duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    add(text(this, 430, 520, b.name, 46)).setStroke('#0b3a5b', 6);
    add(text(this, 430, 580, `${this.index + 1} / ${BOATS.length}`, 22, '#bfe1f7', false));

    add(this.add.rectangle(900, 330, 520, 420, 0x0b3a5b, 0.65).setStrokeStyle(3, 0xffffff, 0.6));
    STATS.forEach((s, i) => {
      const y = 190 + i * 52;
      add(this.add.text(660, y, s.label, { fontSize: '26px', color: '#ffffff', fontFamily: 'Trebuchet MS, Verdana, sans-serif', resolution: 2 }).setOrigin(0, 0.5));
      for (let k = 0; k < 10; k++) {
        add(this.add.rectangle(850 + k * 27, y, 22, 22, k < b.ratings[s.key] ? 0xffd23f : 0x2a4f6b).setOrigin(0, 0.5));
      }
    });
    add(this.add.text(660, 452, b.description, {
      fontSize: '22px', color: '#d7efff', wordWrap: { width: 480 }, fontFamily: 'Trebuchet MS, Verdana, sans-serif', resolution: 2,
    }).setOrigin(0, 0));
    add(this.add.text(660, 520, `Top speed ${Math.round(stats.topSpeed)} · Hull ${Math.round(stats.maxHull)}`, {
      fontSize: '18px', color: '#9fc7e2', fontFamily: 'Trebuchet MS, Verdana, sans-serif', resolution: 2,
    }).setOrigin(0, 0));
  }
}
