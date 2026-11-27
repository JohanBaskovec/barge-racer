import Phaser from 'phaser';
import { DEBUG } from '../config';
import { session } from '../session';
import { audio } from '../audio/AudioManager';
import { generateTextures } from '../view/textures';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    generateTextures(this);
    audio.init(this.game);
    if (DEBUG.track) {
      if (DEBUG.boat) session.boatId = DEBUG.boat;
      session.trackId = DEBUG.track;
      if (DEBUG.difficulty) session.difficulty = DEBUG.difficulty;
      this.scene.start('Race', { ...session });
    } else this.scene.start('Title');
  }
}
