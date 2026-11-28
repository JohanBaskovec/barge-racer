import Phaser from 'phaser';
import { type CupState, cupOver, cupTrack } from '../cup/championship';
import { activeCup, endOfflineCup, startOfflineCup } from '../cup/offlineCup';
import { boatName, ordinal, t, trackName } from '../i18n';
import { audio } from '../audio/AudioManager';
import { net } from '../net/client';
import { session } from '../session';
import { background, button, fitText, text } from '../view/ui';

const F = 'Trebuchet MS, Verdana, sans-serif';

/**
 * The championship standings after a race: total points and the points of each race. Then the next
 * race (offline), or back to the room (online, where the host starts it). After the last race, the
 * champion.
 */
export class StandingsScene extends Phaser.Scene {
  constructor() {
    super('Standings');
  }

  create(data: { cup: CupState; you?: string; online?: boolean }): void {
    const { cup, you, online } = data;
    background(this);
    const over = cupOver(cup);
    const leader = cup.standings[0];
    const nameOf = (key: string, name: string): string => (key === you ? t('you') : name);
    if (over && leader) {
      const won = leader.key === you;
      audio.play(won ? 'win' : 'finish');
      fitText(text(this, 640, 64, won ? t('cup.youWon') : t('cup.champion', { name: leader.name }), 60, '#ffe08a'), 1150).setStroke('#0b3a5b', 10);
    } else {
      fitText(text(this, 640, 64, t('cup.standings'), 60), 1150).setStroke('#0b3a5b', 10);
    }
    text(this, 640, 122, `${t('cup.title')} · ${t('cup.race', { n: cup.done, total: cup.total })}`, 26, '#bfe1f7', false);

    // A column per race, numbered as on the track screen, then the total.
    const step = Math.min(74, 300 / Math.max(1, cup.total - 1));
    const colX = (k: number): number => 670 + k * step;
    cup.plan.forEach((_, k) => {
      this.add.circle(colX(k), 166, 15, k < cup.done ? 0xffe08a : 0x6f8fa8).setStrokeStyle(2, 0x0b3a5b);
      text(this, colX(k), 166, String(k + 1), 18, '#0b3a5b');
    });
    text(this, 1030, 166, t('cup.points'), 18, '#ffe08a');
    const n = cup.standings.length;
    const h = Math.min(62, Math.floor(400 / Math.max(1, n)));
    cup.standings.forEach((e, i) => {
      const y = 214 + i * h;
      const mine = e.key === you;
      this.add.rectangle(640, y, 900, h - 8, mine ? 0x2d6a9d : 0x0b3a5b, 0.8).setStrokeStyle(mine ? 4 : 2, mine ? 0xffe08a : 0xffffff, mine ? 1 : 0.4);
      text(this, 230, y, ordinal(i + 1), Math.min(30, h * 0.55), i === 0 ? '#ffe08a' : '#ffffff');
      const nm = this.add.text(290, y, nameOf(e.key, e.name), { fontFamily: F, fontSize: `${Math.min(26, Math.round(h * 0.46))}px`, fontStyle: 'bold', color: '#ffffff', resolution: 2 }).setOrigin(0, 0.5);
      if (nm.width > 200) nm.setScale(200 / nm.width);
      const bn = this.add.text(500, y, boatName(e.boatId), { fontFamily: F, fontSize: '16px', color: '#bfe1f7', resolution: 2 }).setOrigin(0, 0.5);
      if (bn.width > 150) bn.setScale(150 / bn.width);
      e.races.forEach((p, k) => text(this, colX(k), y, p === null ? '–' : String(p), 22, p === null ? '#6f8fa8' : '#ffffff', false));
      text(this, 1030, y, String(e.points), 30, '#ffe08a');
    });

    if (online) {
      button(this, 460, 655, 340, 68, t('results.backToLobby'), () => this.scene.start(net.inRoom ? 'Lobby' : 'Online'), { fill: 0x2d9d5a, textSize: 30 });
      button(this, 840, 655, 300, 68, t('lobby.leave'), () => {
        net.leave();
        this.scene.start('Title');
      }, { fill: 0x8a4a4a, textSize: 30 });
      return;
    }
    if (!over) {
      const next = cupTrack(cup);
      button(this, 820, 655, 480, 68, t('cup.next', { track: trackName(next) }), () => this.scene.start('Race', { ...session, cup: true }), { fill: 0x2d9d5a, textSize: 28 });
      button(this, 330, 655, 280, 68, t('cup.quit'), () => {
        endOfflineCup();
        this.scene.start('Title');
      }, { fill: 0x8a4a4a, textSize: 28 });
      return;
    }
    button(this, 820, 655, 420, 68, t('cup.again'), () => {
      startOfflineCup(session.boatId, activeCup?.difficulty ?? session.difficulty, cup.plan);
      this.scene.start('Race', { ...session, cup: true });
    }, { fill: 0x2d9d5a, textSize: 30 });
    button(this, 330, 655, 280, 68, t('cup.menu'), () => {
      endOfflineCup();
      this.scene.start('Title');
    }, { fill: 0x555f6b, textSize: 30 });
  }
}
