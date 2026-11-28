import Phaser from 'phaser';
import { DEBUG } from '../config';
import { session } from '../session';
import { audio } from '../audio/AudioManager';
import { isRoomCode } from '../net/protocol';
import { savedSeat } from '../net/client';
import { generateTextures } from '../view/textures';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    generateTextures(this);
    audio.init(this.game);
    // Reloaded while in a room (or the phone reloaded the tab): back into it, in the same seat.
    const room = new URLSearchParams(location.search).get('room')?.toUpperCase();
    const seat = savedSeat();
    if (seat && (!room || room === seat.code)) {
      this.scene.start('Online', { rejoin: true });
      return;
    }
    // An invite link (?room=ABCD) opens the online screen with the code filled in.
    if (room && isRoomCode(room)) {
      this.scene.start('Online', { code: room });
      return;
    }
    if (DEBUG.track) {
      if (DEBUG.boat) session.boatId = DEBUG.boat;
      session.trackId = DEBUG.track;
      if (DEBUG.difficulty) session.difficulty = DEBUG.difficulty;
      this.scene.start('Race', { ...session });
    } else this.scene.start('Title');
  }
}
