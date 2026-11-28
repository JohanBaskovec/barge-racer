import Phaser from 'phaser';
import { t } from '../i18n';
import { audio } from '../audio/AudioManager';
import { background, button, fitText, text } from '../view/ui';

const F = 'Trebuchet MS, Verdana, sans-serif';

/** After the boat: one race on a track (the track screen), or a championship (its own screen). */
export class ModeScene extends Phaser.Scene {
  constructor() {
    super('Mode');
  }

  create(): void {
    background(this);
    audio.playMusic('menu');
    fitText(text(this, 640, 60, t('mode.title'), 52), 1000).setStroke('#0b3a5b', 8);
    this.card(250, t('mode.single'), t('mode.singleDesc'), (g, x, y) => this.flag(g, x, y), () => this.scene.start('TrackSelect'));
    this.card(640, t('cup.title'), t('mode.cupDesc'), (g, x, y) => this.trophy(g, x, y), () => this.scene.start('CupSetup'));
    this.card(1030, t('mode.battle'), t('mode.battleDesc'), (_g, x, y) => {
      // the two teams' flags, crossed
      this.add.image(x - 34, y - 6, 'flagPole_0').setDisplaySize(96, 108).setRotation(-0.25);
      this.add.image(x + 34, y - 6, 'flagPole_1').setDisplaySize(96, 108).setRotation(0.25).setFlipX(true);
    }, () => this.scene.start('BattleSetup'));
    button(this, 150, 660, 200, 64, t('common.back'), () => this.scene.start('BoatSelect'), { fill: 0x555f6b, textSize: 28 });
  }

  /** A big card to tap: a picture, a name, what it is. */
  private card(x: number, title: string, desc: string, draw: (g: Phaser.GameObjects.Graphics, x: number, y: number) => void, go: () => void): void {
    const frame = this.add.rectangle(x, 350, 370, 420, 0x0b3a5b, 0.7).setStrokeStyle(5, 0xffffff, 0.6).setInteractive({ useHandCursor: true });
    frame.on('pointerover', () => frame.setStrokeStyle(7, 0xffe08a, 1));
    frame.on('pointerout', () => frame.setStrokeStyle(5, 0xffffff, 0.6));
    frame.on('pointerup', () => {
      audio.play('click', 0.7);
      go();
    });
    draw(this.add.graphics(), x, 250);
    fitText(text(this, x, 400, title, 40), 340).setStroke('#0b3a5b', 6);
    this.add
      .text(x, 440, desc, { fontFamily: F, fontSize: '19px', color: '#d7efff', align: 'center', wordWrap: { width: 330 }, resolution: 2 })
      .setOrigin(0.5, 0);
  }

  /** A chequered flag on a pole. */
  private flag(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    g.fillStyle(0x6b4a2a, 1).fillRect(x - 64, y - 80, 9, 170);
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 4; j++) {
        const wave = Math.sin(i * 0.9) * 6;
        g.fillStyle((i + j) % 2 ? 0x111111 : 0xffffff, 1).fillRect(x - 55 + i * 22, y - 78 + j * 22 + wave, 22, 22);
      }
    }
    g.lineStyle(4, 0x0b3a5b, 1).strokeRect(x - 55, y - 80, 132, 92);
  }

  /** A gold cup. */
  private trophy(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    g.fillStyle(0xd9a520, 1).fillRect(x - 46, y + 62, 92, 22);
    g.fillStyle(0x8a5a2a, 1).fillRect(x - 36, y + 46, 72, 18);
    g.fillStyle(0xf2c12e, 1).fillRect(x - 10, y + 10, 20, 38);
    g.lineStyle(10, 0xf2c12e, 1).strokeCircle(x - 50, y - 40, 22).strokeCircle(x + 50, y - 40, 22);
    g.fillStyle(0xf2c12e, 1).fillEllipse(x, y - 40, 110, 120);
    g.fillStyle(0xf2c12e, 1).fillRect(x - 55, y - 100, 110, 50);
    g.fillStyle(0xffe58a, 1).fillEllipse(x - 22, y - 50, 22, 60);
    g.lineStyle(4, 0x8a5a00, 0.8).strokeEllipse(x, y - 100, 110, 16);
  }
}
