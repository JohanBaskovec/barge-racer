import Phaser from 'phaser';
import { boatName, ordinal, t, trackName } from '../i18n';
import { audio } from '../audio/AudioManager';
import { net } from '../net/client';
import { type CupState, pointsFor } from '../cup/championship';
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

  /** `cup`: a championship race, with the standings after it; `you`: your key in them. */
  create(data: { rows: ResultRow[]; trackId: string; selection: Selection; online?: boolean; cup?: CupState; you?: string }): void {
    background(this);
    const pos = data.rows.findIndex((r) => r.isPlayer);
    audio.playMusic(null);
    audio.play(pos <= 0 ? 'win' : 'lose');
    this.time.delayedCall(2200, () => audio.playMusic('menu'));
    // pos -1: watched the race online without racing in it.
    const title = pos < 0 ? t('results.over') : pos === 0 ? t('results.won') : t('results.finished', { place: ordinal(pos + 1) });
    fitText(text(this, 640, 70, title, 64, pos === 0 ? '#ffe08a' : '#ffffff'), 1150).setStroke('#0b3a5b', 10);
    const sub = data.cup ? `${t('cup.title')} · ${t('cup.race', { n: data.cup.done, total: data.cup.total })} · ${trackName(data.trackId)}` : trackName(data.trackId);
    fitText(text(this, 640, 130, sub, 28, '#bfe1f7', false), 1100);
    const timeX = data.cup ? 850 : 900;

    // Up to eight rows: smaller ones when there are many, so they fit above the buttons.
    const n = data.rows.length;
    const h = n <= 5 ? 78 : Math.floor(420 / n);
    const k = h / 78;
    data.rows.forEach((r, i) => {
      const y = (n <= 5 ? 210 : 192) + i * h;
      const row = this.add.rectangle(640, y, 760, h - 12 * k, r.isPlayer ? 0x2d6a9d : 0x0b3a5b, 0.8).setStrokeStyle(r.isPlayer ? 5 : 2, r.isPlayer ? 0xffe08a : 0xffffff, r.isPlayer ? 1 : 0.4);
      row.setOrigin(0.5);
      text(this, 320, y, ordinal(i + 1), Math.round(34 * k), '#ffe08a');
      this.add.circle(400, y, 16 * k, r.color).setStrokeStyle(3, 0xffffff);
      if (n <= 5) {
        this.add.text(430, y - 29, r.name, { fontSize: '28px', fontStyle: 'bold', color: '#fff', fontFamily: 'Trebuchet MS, Verdana, sans-serif', resolution: 2 });
        this.add.text(430, y + 9, boatName(r.boatId), { fontSize: '18px', color: '#bfe1f7', fontFamily: 'Trebuchet MS, Verdana, sans-serif', resolution: 2 });
      } else {
        // one line: the name, then the boat
        const nm = this.add.text(430, y, r.name, { fontSize: '24px', fontStyle: 'bold', color: '#fff', fontFamily: 'Trebuchet MS, Verdana, sans-serif', resolution: 2 }).setOrigin(0, 0.5);
        if (nm.width > 230) nm.setScale(230 / nm.width);
        this.add.text(670, y, boatName(r.boatId), { fontSize: '17px', color: '#bfe1f7', fontFamily: 'Trebuchet MS, Verdana, sans-serif', resolution: 2 }).setOrigin(0, 0.5);
      }
      text(this, timeX, y, (r.finished ? '' : '~') + fmtTime(r.time), Math.round(30 * Math.max(0.8, k)), r.finished ? '#ffffff' : '#9fc7e2');
      // Championship points for the place.
      if (data.cup) text(this, 970, y, `+${pointsFor(i)}`, Math.round(30 * Math.max(0.8, k)), '#9dff9d');
    });

    if (data.cup) {
      // The standings next: from there, the next race (or back to the room online).
      const cup = data.cup;
      button(this, data.online ? 460 : 640, 640, 340, 72, t('cup.standings'), () => this.scene.start('Standings', { cup, you: data.you, online: data.online }), { fill: 0x2d9d5a, textSize: 32 });
      if (data.online) {
        button(this, 840, 640, 300, 72, t('lobby.leave'), () => {
          net.leave();
          this.scene.start('Title');
        }, { fill: 0x8a4a4a, textSize: 30 });
      }
      return;
    }
    if (data.online) {
      button(this, 460, 640, 340, 72, t('results.backToLobby'), () => this.scene.start(net.inRoom ? 'Lobby' : 'Online'), { fill: 0x2d9d5a, textSize: 30 });
      button(this, 840, 640, 300, 72, t('lobby.leave'), () => {
        net.leave();
        this.scene.start('Title');
      }, { fill: 0x8a4a4a, textSize: 30 });
      return;
    }
    button(this, 280, 640, 300, 72, t('results.again'), () => this.scene.start('Race', data.selection), { fill: 0x2d9d5a, textSize: 32 });
    button(this, 640, 640, 300, 72, t('results.changeRace'), () => this.scene.start('TrackSelect'), { textSize: 32 });
    button(this, 1000, 640, 300, 72, t('results.changeBoat'), () => this.scene.start('BoatSelect'), { fill: 0x555f6b, textSize: 32 });
  }
}
