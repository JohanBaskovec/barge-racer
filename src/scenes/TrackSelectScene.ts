import Phaser from 'phaser';
import { DIFFICULTIES, type Difficulty } from '../data/difficulty';
import { TRACK_DEFS, loadTrack } from '../data/tracks';
import { saveSession, session } from '../session';
import { background, button, text } from '../view/ui';

export class TrackSelectScene extends Phaser.Scene {
  private cards: { id: string; frame: Phaser.GameObjects.Rectangle }[] = [];
  private diffButtons: { id: Difficulty; bg: Phaser.GameObjects.Rectangle }[] = [];

  constructor() {
    super('TrackSelect');
  }

  create(): void {
    this.cards = [];
    this.diffButtons = [];
    background(this);
    text(this, 640, 56, 'Choose a race', 52).setStroke('#0b3a5b', 8);

    TRACK_DEFS.forEach((def, i) => {
      const x = 240 + i * 400;
      const frame = this.add.rectangle(x, 300, 360, 400, 0x0b3a5b, 0.7).setStrokeStyle(5, 0xffffff, 0.5);
      frame.setInteractive({ useHandCursor: true });
      frame.on('pointerup', () => this.pick(def.id));
      this.cards.push({ id: def.id, frame });
      this.drawPreview(def.id, x, 250);
      text(this, x, 410, def.name, 32);
      this.add
        .text(x, 438, def.description, { fontSize: '18px', color: '#d7efff', align: 'center', wordWrap: { width: 320 }, fontFamily: 'Trebuchet MS, Verdana, sans-serif', resolution: 2 })
        .setOrigin(0.5, 0);
      text(this, x, 175, `${def.laps} laps`, 20, '#ffe08a');
    });

    text(this, 250, 540, 'Opponents', 26, '#bfe1f7', false);
    (Object.keys(DIFFICULTIES) as Difficulty[]).forEach((id, i) => {
      const b = button(this, 470 + i * 190, 540, 170, 54, DIFFICULTIES[id].name, () => this.pickDiff(id), { textSize: 26 });
      this.diffButtons.push({ id, bg: b.list[0] as Phaser.GameObjects.Rectangle });
    });

    button(this, 150, 660, 200, 64, 'Back', () => this.scene.start('BoatSelect'), { fill: 0x555f6b, textSize: 28 });
    button(this, 1090, 660, 300, 72, 'Race! ▸', () => {
      saveSession();
      this.scene.start('Race', { ...session });
    }, { fill: 0x2d9d5a, textSize: 38 });
    this.pick(session.trackId);
    this.pickDiff(session.difficulty);
  }

  private pick(id: string): void {
    session.trackId = id;
    for (const c of this.cards) c.frame.setStrokeStyle(c.id === id ? 8 : 5, c.id === id ? 0xffe08a : 0xffffff, c.id === id ? 1 : 0.5);
  }

  private pickDiff(id: Difficulty): void {
    session.difficulty = id;
    for (const d of this.diffButtons) d.bg.setStrokeStyle(d.id === id ? 8 : 4, d.id === id ? 0xffe08a : 0xffffff, 0.95);
  }

  private drawPreview(id: string, cx: number, cy: number): void {
    const track = loadTrack(id);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of track.samples) {
      minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
      minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y);
    }
    const scale = Math.min(300 / (maxX - minX), 170 / (maxY - minY));
    const ox = cx - ((minX + maxX) / 2) * scale;
    const oy = cy - ((minY + maxY) / 2) * scale;
    const g = this.add.graphics();
    const pts = track.samples.map((s) => new Phaser.Math.Vector2(s.x * scale + ox, s.y * scale + oy));
    g.lineStyle(14, track.def.colors.shore, 1).strokePoints(pts, true, true);
    g.lineStyle(9, track.def.colors.water, 1).strokePoints(pts, true, true);
    g.fillStyle(0xffffff, 1).fillCircle(pts[0].x, pts[0].y, 6);
  }
}
