import Phaser from 'phaser';
import { LANGUAGES, getLanguage, setLanguage, t } from '../i18n';
import { addFullscreenButton, enterFullscreen } from '../view/fullscreen';
import { getBoat } from '../data/boats';
import { createBoatSprite } from '../view/boatSprite';
import { background, button, fitText, text } from '../view/ui';

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
    ['cabourg', 'cigaretteSpeedboat', 'partyPontoon', 'tugboat'].forEach((id, i) => {
      const b = createBoatSprite(this, getBoat(id), [0xff5a4d, 0x4da3ff, 0xffd23f, 0x62d26f][i]).setPosition(-150 - i * 260, 560 + (i % 2) * 70).setScale(2);
      this.tweens.add({ targets: b, x: 1500, duration: 9000 + i * 1500, repeat: -1, delay: i * 700 });
    });
    text(this, 640, 210, 'BARGE RACER', 108, '#ffffff').setStroke('#0b3a5b', 14).setShadow(0, 8, '#00000066', 0);
    fitText(text(this, 640, 310, t('title.subtitle'), 30, '#d7efff', false), 1180);
    const tap = fitText(text(this, 640, 430, t('title.tap'), 44, '#ffe08a'), 1100).setStroke('#0b3a5b', 8);
    this.tweens.add({ targets: tap, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });
    fitText(text(this, 640, 690, t('title.hint'), 22, '#bfe1f7', false), 1200);
    addFullscreenButton(this, 1220, 60);

    // Language picker: the current language is highlighted; picking one redraws this screen.
    LANGUAGES.forEach((lang, i) => {
      const b = button(this, 100 + i * 170, 60, 150, 48, lang.name, () => {
        setLanguage(lang.code);
        this.scene.restart();
      }, { fill: lang.code === getLanguage().code ? 0x2d9d5a : 0x0b3a5b, textSize: 22 });
      b.setAlpha(lang.code === getLanguage().code ? 1 : 0.8);
    });

    // Any tap that isn't on a button starts the game.
    let started = false;
    this.input.on('pointerdown', (_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (started || over.length > 0) return;
      started = true;
      // On phones and tablets the first tap goes fullscreen (needs a user gesture).
      if (this.sys.game.device.input.touch) enterFullscreen(this);
      this.scene.start('BoatSelect');
    });
  }
}
