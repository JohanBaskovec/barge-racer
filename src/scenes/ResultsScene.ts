import Phaser from 'phaser';
import { boatName, ordinal, t, trackName } from '../i18n';
import { audio } from '../audio/AudioManager';
import type { Selection } from '../session';
import { background, button, fitText, fmtTime, text } from '../view/ui';

export interface ResultRow {
  name: string;
  boatId: string;
  color: number;
  time: number;
  finished: boolean;
  isPlayer: boolean;
}

export class ResultsScene extends Phaser.Scene {
  constructor() {
    super('Results');
  }

  create(data: { rows: ResultRow[]; trackId: string; selection: Selection }): void {
    background(this);
    const pos = data.rows.findIndex((r) => r.isPlayer);
    audio.playMusic(null);
    audio.play(pos === 0 ? 'win' : 'lose');
    this.time.delayedCall(2200, () => audio.playMusic('menu'));
    fitText(text(this, 640, 70, pos === 0 ? t('results.won') : t('results.finished', { place: ordinal(pos + 1) }), 64, pos === 0 ? '#ffe08a' : '#ffffff'), 1150).setStroke('#0b3a5b', 10);
    text(this, 640, 130, trackName(data.trackId), 28, '#bfe1f7', false);

    data.rows.forEach((r, i) => {
      const y = 210 + i * 78;
      const row = this.add.rectangle(640, y, 760, 66, r.isPlayer ? 0x2d6a9d : 0x0b3a5b, 0.8).setStrokeStyle(r.isPlayer ? 5 : 2, r.isPlayer ? 0xffe08a : 0xffffff, r.isPlayer ? 1 : 0.4);
      row.setOrigin(0.5);
      text(this, 320, y, ordinal(i + 1), 34, '#ffe08a');
      this.add.circle(400, y, 16, r.color).setStrokeStyle(3, 0xffffff);
      this.add.text(430, y - 29, r.name, { fontSize: '28px', fontStyle: 'bold', color: '#fff', fontFamily: 'Trebuchet MS, Verdana, sans-serif', resolution: 2 });
      this.add.text(430, y + 9, boatName(r.boatId), { fontSize: '18px', color: '#bfe1f7', fontFamily: 'Trebuchet MS, Verdana, sans-serif', resolution: 2 });
      text(this, 900, y, (r.finished ? '' : '~') + fmtTime(r.time), 30, r.finished ? '#ffffff' : '#9fc7e2');
    });

    button(this, 280, 640, 300, 72, t('results.again'), () => this.scene.start('Race', data.selection), { fill: 0x2d9d5a, textSize: 32 });
    button(this, 640, 640, 300, 72, t('results.changeRace'), () => this.scene.start('TrackSelect'), { textSize: 32 });
    button(this, 1000, 640, 300, 72, t('results.changeBoat'), () => this.scene.start('BoatSelect'), { fill: 0x555f6b, textSize: 32 });
  }
}
