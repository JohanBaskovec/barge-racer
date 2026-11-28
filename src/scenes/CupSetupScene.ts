import Phaser from 'phaser';
import { type CupRace, MAX_CUP_RACES, MAX_LAPS, cleanPlan } from '../cup/championship';
import { startOfflineCup } from '../cup/offlineCup';
import { DIFFICULTIES, type Difficulty } from '../data/difficulty';
import { TRACK_DEFS, defaultSection, getTrackDef, hasSections } from '../data/tracks';
import { difficultyName, t, trackName } from '../i18n';
import { audio } from '../audio/AudioManager';
import { net } from '../net/client';
import { saveSession, session } from '../session';
import { describeSection } from '../view/sectionInfo';
import { background, button, fitText, setSelected, text } from '../view/ui';

const F = 'Trebuchet MS, Verdana, sans-serif';
const ROW0 = 122, ROW = 54;

/**
 * Set up a championship: which races, in which order, how many laps each (on the Reims canal,
 * which stretch: the stretch screen, as for a single race). Single player: then the difficulty
 * and start. Online (the host): every change goes to the room, and "Done" goes back to the lobby.
 */
export class CupSetupScene extends Phaser.Scene {
  private plan: CupRace[] = [];
  private online = false;
  private dyn!: Phaser.GameObjects.Container;

  constructor() {
    super('CupSetup');
  }

  init(data: { online?: boolean }): void {
    this.online = !!data?.online;
  }

  create(): void {
    background(this);
    audio.playMusic('menu');
    this.plan = cleanPlan(this.online ? net.lobby?.settings.plan : session.cupPlan);
    if (this.online) {
      net.on(this, 'closed', () => this.scene.start('Online', { error: t('online.lost') }));
      // The room's copy of the races is the one that counts: show it as it comes back.
      net.on(this, 'lobby', (m) => {
        if (!m.settings.cup) return this.scene.start('Lobby');
        this.plan = cleanPlan(m.settings.plan);
        this.render();
      });
      net.on(this, 'start', (m) => this.scene.start('Race', { online: m }));
    }
    fitText(text(this, 640, 52, t('cup.setupTitle'), 50), 1000).setStroke('#0b3a5b', 8);
    this.dyn = this.add.container(0, 0);
    this.render();

    button(this, 150, 660, 200, 64, t('common.back'), () => this.scene.start(this.online ? 'Lobby' : 'Mode'), { fill: 0x555f6b, textSize: 28 });
    if (this.online) {
      button(this, 1090, 660, 300, 72, t('cup.saved'), () => this.scene.start('Lobby'), { fill: 0x2d9d5a, textSize: 34 });
      return;
    }
    // Single player: the opponents' level, then off we go.
    fitText(text(this, 250, 602, t('trackSelect.opponents'), 24, '#bfe1f7', false), 200);
    const diffs = (Object.keys(DIFFICULTIES) as Difficulty[]).map((id, i) => ({ id, b: button(this, 470 + i * 190, 602, 170, 50, difficultyName(id), () => pick(id), { textSize: 24 }) }));
    const pick = (id: Difficulty): void => {
      session.difficulty = id;
      for (const d of diffs) setSelected(d.b, d.id === id);
    };
    pick(session.difficulty);
    button(this, 1060, 660, 360, 72, t('cup.start'), () => {
      saveSession();
      startOfflineCup(session.boatId, session.difficulty, this.plan);
      this.scene.start('Race', { ...session, cup: true });
    }, { fill: 0x2d9d5a, textSize: 30 });
  }

  /** Keep the change: in the session (single player) or in the room (online). */
  private changed(): void {
    this.plan = cleanPlan(this.plan);
    if (this.online) {
      const s = net.lobby?.settings;
      if (s) net.send({ t: 'settings', settings: { ...s, cup: true, plan: this.plan } });
    } else {
      session.cupPlan = this.plan;
      saveSession();
    }
    this.render();
  }

  private render(): void {
    this.dyn.removeAll(true);
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => (this.dyn.add(o), o);
    const plan = this.plan;
    plan.forEach((race, i) => {
      const y = ROW0 + i * ROW;
      const def = getTrackDef(race.trackId);
      add(this.add.rectangle(640, y, 1110, ROW - 8, 0x0b3a5b, 0.7).setStrokeStyle(2, 0xffffff, 0.35));
      add(this.add.circle(118, y, 17, 0xffe08a).setStrokeStyle(3, 0x0b3a5b));
      add(text(this, 118, y, String(i + 1), 20, '#0b3a5b'));
      // The track: the arrows go through every track.
      const ti = TRACK_DEFS.findIndex((d) => d.id === def.id);
      const setTrack = (d: number): void => {
        const next = TRACK_DEFS[(ti + d + TRACK_DEFS.length) % TRACK_DEFS.length];
        plan[i] = hasSections(next) ? { trackId: next.id, section: session.sections?.[next.id] ?? defaultSection(next) } : { trackId: next.id, laps: race.laps ?? next.laps };
        this.changed();
      };
      add(button(this, 175, y, 44, 40, '‹', () => setTrack(-1), { textSize: 28 }));
      add(fitText(text(this, 365, y, trackName(def.id), 24), 300));
      add(button(this, 555, y, 44, 40, '›', () => setTrack(1), { textSize: 28 }));
      // Laps, or the stretch of the Reims canal.
      if (hasSections(def)) {
        add(button(this, 770, y, 340, 40, `✎ ${describeSection(def.id, race.section, true)}`, () => this.scene.start('Section', { trackId: def.id, section: race.section, online: this.online, cupRace: i }), { fill: 0x3d5266, textSize: 16 }));
      } else {
        const laps = race.laps ?? def.laps;
        const setLaps = (n: number): void => {
          plan[i] = { ...race, laps: Math.max(1, Math.min(MAX_LAPS, n)) };
          this.changed();
        };
        add(button(this, 660, y, 44, 40, '−', () => setLaps(laps - 1), { textSize: 26, fill: laps > 1 ? undefined : 0x55606a }));
        add(fitText(text(this, 770, y, laps === 1 ? t('cup.oneLap') : t('cup.laps', { n: laps }), 22, '#ffe08a'), 140));
        add(button(this, 880, y, 44, 40, '+', () => setLaps(laps + 1), { textSize: 26, fill: laps < MAX_LAPS ? undefined : 0x55606a }));
      }
      // Order, and taking a race out (there is always one left).
      const move = (d: number): void => {
        const j = i + d;
        if (j < 0 || j >= plan.length) return;
        [plan[i], plan[j]] = [plan[j], plan[i]];
        this.changed();
      };
      add(button(this, 1000, y, 44, 40, '▲', () => move(-1), { textSize: 18, fill: i > 0 ? 0x3d5266 : 0x55606a }));
      add(button(this, 1052, y, 44, 40, '▼', () => move(1), { textSize: 18, fill: i < plan.length - 1 ? 0x3d5266 : 0x55606a }));
      if (plan.length > 1) {
        const x = add(button(this, 1130, y, 44, 40, '', () => {
          plan.splice(i, 1);
          this.changed();
        }, { fill: 0x8a4a4a }));
        x.add(this.add.graphics().lineStyle(4, 0xffffff, 1).lineBetween(-7, -7, 7, 7).lineBetween(-7, 7, 7, -7));
      }
    });
    if (plan.length < MAX_CUP_RACES) {
      add(button(this, 640, ROW0 + plan.length * ROW, 320, 44, t('cup.addRace'), () => {
        const last = plan[plan.length - 1];
        plan.push({ ...last });
        this.changed();
      }, { fill: 0x3d5266, textSize: 22 }));
    }
    add(this.add.text(640, 555, t('cup.hint'), { fontFamily: F, fontSize: '17px', color: '#ffe08a', align: 'center', resolution: 2 }).setOrigin(0.5));
  }
}
