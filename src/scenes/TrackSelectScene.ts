import Phaser from 'phaser';
import { DIFFICULTIES, type Difficulty } from '../data/difficulty';
import { difficultyName, formatNumber, t, trackDesc, trackName } from '../i18n';
import { TRACK_DEFS, hasSections, loadTrack } from '../data/tracks';
import { describeSection } from '../view/sectionInfo';
import { saveSession, session } from '../session';
import { audio } from '../audio/AudioManager';
import { background, button, fitText, setSelected, text } from '../view/ui';

export class TrackSelectScene extends Phaser.Scene {
  private cards: { id: string; frame: Phaser.GameObjects.Rectangle }[] = [];
  private diffButtons: { id: Difficulty; b: Phaser.GameObjects.Container }[] = [];
  private credit!: Phaser.GameObjects.Text;
  private sectionBtn!: Phaser.GameObjects.Container;
  private sectionText!: Phaser.GameObjects.Text;

  constructor() {
    super('TrackSelect');
  }

  create(): void {
    this.cards = [];
    this.diffButtons = [];
    background(this);
    audio.playMusic('menu');
    fitText(text(this, 640, 56, t('trackSelect.title'), 52), 1000).setStroke('#0b3a5b', 8);

    TRACK_DEFS.forEach((def, i) => {
      const x = 160 + i * 320;
      const frame = this.add.rectangle(x, 310, 296, 420, 0x0b3a5b, 0.7).setStrokeStyle(5, 0xffffff, 0.5);
      frame.setInteractive({ useHandCursor: true });
      frame.on('pointerup', () => this.pick(def.id));
      this.cards.push({ id: def.id, frame });
      this.drawPreview(def.id, x, 270);
      fitText(text(this, x, 410, trackName(def.id), 30), 270);
      this.add
        .text(x, 438, trackDesc(def.id), { fontSize: '16px', color: '#d7efff', align: 'center', wordWrap: { width: 270 }, fontFamily: 'Trebuchet MS, Verdana, sans-serif', resolution: 2 })
        .setOrigin(0.5, 0);
      const track = loadTrack(def.id, session.sections?.[def.id]);
      const info = track.closed ? t('trackSelect.laps', { n: def.laps }) : t('trackSelect.distance', { km: formatNumber(track.lapLength / (def.pxPerM ?? 10) / 1000) });
      text(this, x, 128, info, 20, '#ffe08a');
    });

    fitText(text(this, 250, 558, t('trackSelect.opponents'), 26, '#bfe1f7', false), 200);
    (Object.keys(DIFFICULTIES) as Difficulty[]).forEach((id, i) => {
      const b = button(this, 470 + i * 190, 558, 170, 54, difficultyName(id), () => this.pickDiff(id), { textSize: 26 });
      this.diffButtons.push({ id, b });
    });

    button(this, 150, 660, 200, 64, t('common.back'), () => this.scene.start('BoatSelect'), { fill: 0x555f6b, textSize: 28 });
    button(this, 1090, 660, 300, 72, t('trackSelect.race'), () => {
      saveSession();
      this.scene.start('Race', { ...session });
    }, { fill: 0x2d9d5a, textSize: 38 });
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
  }

  private pick(id: string): void {
    session.trackId = id;
    const source = TRACK_DEFS.find((d) => d.id === id)?.attribution;
    this.credit?.setText(source ? t('credits.map', { source }) : '');
    const def = TRACK_DEFS.find((d) => d.id === id);
    const sections = !!def && hasSections(def);
    this.sectionBtn?.setVisible(sections);
    if (this.sectionText) fitText(this.sectionText.setText(sections ? describeSection(id, session.sections?.[id]) : ''), 1200);
    for (const c of this.cards) c.frame.setStrokeStyle(c.id === id ? 8 : 5, c.id === id ? 0xffe08a : 0xffffff, c.id === id ? 1 : 0.5);
  }

  private pickDiff(id: Difficulty): void {
    session.difficulty = id;
    for (const d of this.diffButtons) setSelected(d.b, d.id === id);
  }

  private drawPreview(id: string, cx: number, cy: number): void {
    const track = loadTrack(id, session.sections?.[id]);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of track.samples) {
      minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
      minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y);
    }
    const scale = Math.min(240 / (maxX - minX), 200 / (maxY - minY));
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
