import Phaser from 'phaser';
import { addFullscreenButton, enterFullscreen } from '../view/fullscreen';
import { background, text } from '../view/ui';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create(): void {
    background(this);
    // Drifting wave lines
    const waves = this.add.tileSprite(0, 0, 1280, 720, 'water').setOrigin(0).setAlpha(0.9);
    this.events.on('update', () => {
      waves.tilePositionX += 0.4;
      waves.tilePositionY += 0.25;
    });
    // A little parade of boats
    ['coalBarge', 'cigaretteSpeedboat', 'partyPontoon', 'tugboat'].forEach((id, i) => {
      const b = this.add.image(-150 - i * 260, 560 + (i % 2) * 70, `boat_${id}`).setScale(2).setTint([0xff5a4d, 0x4da3ff, 0xffd23f, 0x62d26f][i]);
      this.tweens.add({ targets: b, x: 1500, duration: 9000 + i * 1500, repeat: -1, delay: i * 700 });
    });
    text(this, 640, 210, 'BARGE RACER', 108, '#ffffff').setStroke('#0b3a5b', 14).setShadow(0, 8, '#00000066', 0);
    text(this, 640, 310, 'Race, shove, saw and glue your way to the finish', 30, '#d7efff', false);
    const tap = text(this, 640, 430, 'Tap or click to start', 44, '#ffe08a').setStroke('#0b3a5b', 8);
    this.tweens.add({ targets: tap, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });
    text(this, 640, 690, 'Hold to steer · tap the item button to fire', 22, '#bfe1f7', false);
    const fsZone = addFullscreenButton(this, 1220, 60);
    this.input.once('pointerdown', (p: Phaser.Input.Pointer) => {
      const onFsButton = fsZone && (p.x - fsZone.x) ** 2 + (p.y - fsZone.y) ** 2 < fsZone.r ** 2;
      if (onFsButton) {
        this.input.once('pointerdown', () => this.scene.start('BoatSelect'));
        return;
      }
      // On phones and tablets the first tap goes fullscreen (needs a user gesture).
      if (this.sys.game.device.input.touch) enterFullscreen(this);
      this.scene.start('BoatSelect');
    });
  }
}
