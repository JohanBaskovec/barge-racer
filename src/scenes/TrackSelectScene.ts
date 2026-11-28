import Phaser from 'phaser';
import { DIFFICULTIES, type Difficulty } from '../data/difficulty';
import { difficultyName, formatNumber, t, trackDesc, trackName } from '../i18n';
import { TRACK_DEFS, hasSections, loadTrack } from '../data/tracks';
import { describeSection } from '../view/sectionInfo';
import { saveSession, session } from '../session';
import { audio } from '../audio/AudioManager';
import { CUP_TRACKS } from '../cup/championship';
import { startOfflineCup } from '../cup/offlineCup';
import { background, button, fitText, setSelected, text } from '../view/ui';

export class TrackSelectScene extends Phaser.Scene {
  private cards: { id: string; frame: Phaser.GameObjects.Rectangle }[] = [];
  private diffButtons: { id: Difficulty; b: Phaser.GameObjects.Container }[] = [];
  private credit!: Phaser.GameObjects.Text;
  private sectionBtn!: Phaser.GameObjects.Container;
  private sectionText!: Phaser.GameObjects.Text;
  private cupBtn!: Phaser.GameObjects.Container;
  private raceBtn!: Phaser.GameObjects.Container;
  private cupStartBtn!: Phaser.GameObjects.Container;
  private cupHint!: Phaser.GameObjects.Text;
  private badges: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('TrackSelect');
  }

  create(): void {
    this.cards = [];
    this.diffButtons = [];
    this.badges = [];
    background(this);
    audio.playMusic('menu');
    fitText(text(this, 640, 56, t('trackSelect.title'), 52), 1000).setStroke('#0b3a5b', 8);

    // The cards share the width of the screen, however many tracks there are.
    const pitch = Math.min(320, 1240 / TRACK_DEFS.length);
    const cardW = pitch - 16;
    TRACK_DEFS.forEach((def, i) => {
      const x = 640 + (i - (TRACK_DEFS.length - 1) / 2) * pitch;
      const frame = this.add.rectangle(x, 310, cardW, 420, 0x0b3a5b, 0.7).setStrokeStyle(5, 0xffffff, 0.5);
      frame.setInteractive({ useHandCursor: true });
      frame.on('pointerup', () => !session.cup && this.pick(def.id));
      // In a championship: its order.
      const k = (CUP_TRACKS as readonly string[]).indexOf(def.id);
      if (k >= 0) {
        this.badges.push(this.add.circle(x - cardW / 2 + 26, 126, 20, 0xffe08a).setStrokeStyle(3, 0x0b3a5b).setDepth(2));
        this.badges.push(text(this, x - cardW / 2 + 26, 126, String(k + 1), 22, '#0b3a5b').setDepth(2));
      }
      this.cards.push({ id: def.id, frame });
      this.drawPreview(def.id, x, 270, cardW - 50);
      fitText(text(this, x, 410, trackName(def.id), 30), cardW - 22);
      this.add
        .text(x, 438, trackDesc(def.id), { fontSize: '16px', color: '#d7efff', align: 'center', wordWrap: { width: cardW - 22 }, fontFamily: 'Trebuchet MS, Verdana, sans-serif', resolution: 2 })
        .setOrigin(0.5, 0);
      const track = loadTrack(def.id, session.sections?.[def.id]);
      const info = track.closed ? t('trackSelect.laps', { n: def.laps }) : t('trackSelect.distance', { km: formatNumber(track.lapLength / (def.pxPerM ?? 10) / 1000) });
      text(this, x, 128, info, 20, '#ffe08a');
    });

    fitText(text(this, 225, 558, t('trackSelect.opponents'), 26, '#bfe1f7', false), 190);
    (Object.keys(DIFFICULTIES) as Difficulty[]).forEach((id, i) => {
      const b = button(this, 430 + i * 180, 558, 164, 54, difficultyName(id), () => this.pickDiff(id), { textSize: 26 });
      this.diffButtons.push({ id, b });
    });

    button(this, 150, 660, 200, 64, t('common.back'), () => this.scene.start('BoatSelect'), { fill: 0x555f6b, textSize: 28 });
    this.raceBtn = button(this, 1090, 660, 300, 72, t('trackSelect.race'), () => {
      saveSession();
      this.scene.start('Race', { ...session });
    }, { fill: 0x2d9d5a, textSize: 38 });
    // A championship instead of a single race: every track with laps in turn.
    this.cupBtn = button(this, 1110, 558, 230, 54, t('cup.toggle'), () => this.setCup(!session.cup), { fill: 0x8a6a2a, textSize: 26 });
    this.cupStartBtn = button(this, 1060, 660, 360, 72, t('cup.start'), () => {
      saveSession();
      startOfflineCup(session.boatId, session.difficulty);
      this.scene.start('Race', { ...session, cup: true });
    }, { fill: 0x2d9d5a, textSize: 30 });
    this.cupHint = this.add
      .text(640, 618, t('cup.hint'), { fontSize: '17px', color: '#ffe08a', align: 'center', wordWrap: { width: 560 }, fontFamily: 'Trebuchet MS, Verdana, sans-serif', resolution: 2 })
      .setOrigin(0.5, 0.5);
    // Map data credit, shown when a real-world track is selected.
    this.credit = text(this, 640, 624, '', 14, '#bfe1f7', false);
    // A track whose stretch can be picked (the Reims canal): which stretch, and a button to change it.
    this.sectionBtn = button(this, 640, 668, 330, 52, t('section.button'), () => {
      saveSession();
      this.scene.start('Section', { trackId: session.trackId, section: session.sections?.[session.trackId] });
    }, { fill: 0x3d5266, textSize: 26 });
    this.sectionText = text(this, 640, 604, '', 18, '#ffe08a', false);
    this.pick(session.trackId);
    this.pickDiff(session.difficulty);
    this.setCup(!!session.cup);
  }

  /** Single race or championship: the championship races its own tracks (numbered), not the picked one. */
  private setCup(on: boolean): void {
    session.cup = on;
    setSelected(this.cupBtn, on);
    this.raceBtn.setVisible(!on);
    this.cupStartBtn.setVisible(on);
    this.cupHint.setVisible(on);
    for (const b of this.badges) (b as unknown as Phaser.GameObjects.Components.Visible).setVisible(on);
    this.pick(session.trackId);
  }

  private pick(id: string): void {
    session.trackId = id;
    const source = TRACK_DEFS.find((d) => d.id === id)?.attribution;
    this.credit?.setText(source ? t('credits.map', { source }) : '');
    const def = TRACK_DEFS.find((d) => d.id === id);
    const sections = !!def && hasSections(def);
    const cup = !!session.cup;
    this.sectionBtn?.setVisible(sections && !cup);
    if (this.sectionText) fitText(this.sectionText.setText(sections && !cup ? describeSection(id, session.sections?.[id]) : ''), 1200);
    this.credit?.setVisible(!cup);
    for (const c of this.cards) {
      // In a championship its tracks are all lit, the others faded.
      const lit = cup ? (CUP_TRACKS as readonly string[]).includes(c.id) : c.id === id;
      c.frame.setStrokeStyle(lit ? 8 : 5, lit ? 0xffe08a : 0xffffff, lit ? 1 : 0.5);
      c.frame.setFillStyle(0x0b3a5b, cup && !lit ? 0.25 : 0.7);
    }
  }

  private pickDiff(id: Difficulty): void {
    session.difficulty = id;
    for (const d of this.diffButtons) setSelected(d.b, d.id === id);
  }

  private drawPreview(id: string, cx: number, cy: number, w: number): void {
    const track = loadTrack(id, session.sections?.[id]);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of track.samples) {
      minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
      minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y);
    }
    const scale = Math.min(w / (maxX - minX), 200 / (maxY - minY));
    const ox = cx - ((minX + maxX) / 2) * scale;
    const oy = cy - ((minY + maxY) / 2) * scale;
    const g = this.add.graphics();
    const step = Math.max(1, Math.floor(track.samples.length / 300));
    const pts = track.samples.filter((_, i) => i % step === 0).map((s) => new Phaser.Math.Vector2(s.x * scale + ox, s.y * scale + oy));
    g.lineStyle(14, track.def.colors.shore, 1).strokePoints(pts, track.closed, track.closed);
    g.lineStyle(9, track.def.colors.water, 1).strokePoints(pts, track.closed, track.closed);
    const start = track.sampleAt(track.startDist);
    g.fillStyle(0xffffff, 1).fillCircle(start.x * scale + ox, start.y * scale + oy, 6);
  }
}
