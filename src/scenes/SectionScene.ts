import Phaser from 'phaser';
import { audio } from '../audio/AudioManager';
import { type Section, clampSection, defaultSection, getTrackDef } from '../data/tracks';
import { formatNumber, t, trackName } from '../i18n';
import { net } from '../net/client';
import { saveSession, session } from '../session';
import { type Place, describeAlong, sectionTrack } from '../view/sectionInfo';
import { background, button, fitText, text } from '../view/ui';

/** The slider: a bar standing for the whole canal, north (left) to south (right). */
const BAR = { x0: 110, x1: 1170, y: 520 };
const MAP = { x: 340, y: 92, w: 600, h: 340 };
/** A handle dropped this close (screen px) to a named place snaps onto it. */
const SNAP_PX = 14;
/** Rough race time per kilometre for the estimate (AI boats on River take about 24 s). */
const SEC_PER_KM = 25;

export interface SectionSceneData {
  trackId: string;
  section?: Section | null;
  /** Online: the host picks the stretch for the room. */
  online?: boolean;
}

/**
 * Pick the stretch of a point-to-point track to race (the Reims canal): one slider with a start
 * handle and a finish handle, a map that highlights the stretch, and the named places along the
 * canal (bridges, the old locks) as ticks a handle snaps to.
 */
export class SectionScene extends Phaser.Scene {
  private data0!: SectionSceneData;
  private section!: Section;
  private range!: [number, number];
  private places: Place[] = [];
  private mapGfx!: Phaser.GameObjects.Graphics;
  private handleGfx!: Phaser.GameObjects.Graphics;
  private startText!: Phaser.GameObjects.Text;
  private startPlace!: Phaser.GameObjects.Text;
  private finishText!: Phaser.GameObjects.Text;
  private finishPlace!: Phaser.GameObjects.Text;
  private lengthText!: Phaser.GameObjects.Text;
  private dragging: 'start' | 'finish' | null = null;
  private toMap!: (along: number) => { x: number; y: number };

  constructor() {
    super('Section');
  }

  init(data: SectionSceneData): void {
    this.data0 = data;
    this.dragging = null;
  }

  create(): void {
    const { trackId } = this.data0;
    const def = getTrackDef(trackId);
    this.range = def.range!;
    this.section = clampSection(def, this.data0.section);
    const { track, places } = sectionTrack(trackId);
    this.places = places;
    background(this);
    audio.playMusic('menu');
    fitText(text(this, 640, 46, t('section.title'), 46), 1000).setStroke('#0b3a5b', 8);

    // The map: the whole canal, faint, with the stretch drawn over it (in update()).
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of track.samples) {
      minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
      minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y);
    }
    const scale = Math.min((MAP.w - 30) / (maxX - minX), (MAP.h - 30) / (maxY - minY));
    const ox = MAP.x + MAP.w / 2 - ((minX + maxX) / 2) * scale;
    const oy = MAP.y + MAP.h / 2 - ((minY + maxY) / 2) * scale;
    this.toMap = (along) => {
      const p = track.pointAt(along);
      return { x: p.x * scale + ox, y: p.y * scale + oy };
    };
    const base = this.add.graphics();
    base.fillStyle(0x0b3a5b, 0.6).fillRoundedRect(MAP.x, MAP.y, MAP.w, MAP.h, 14);
    base.lineStyle(7, 0xffffff, 0.25).strokePoints(this.mapLine(this.range[0], this.range[1]), false, false);
    text(this, MAP.x + MAP.w - 60, MAP.y + 22, t('section.north'), 16, '#bfe1f7').setOrigin(0.5);
    base.fillStyle(0xbfe1f7, 1).fillTriangle(MAP.x + MAP.w - 24, MAP.y + 14, MAP.x + MAP.w - 30, MAP.y + 30, MAP.x + MAP.w - 18, MAP.y + 30);
    this.mapGfx = this.add.graphics();
    fitText(text(this, 640, MAP.y + MAP.h + 22, trackName(trackId), 22, '#bfe1f7', false), 600);

    // Start and finish details, either side of the map.
    text(this, 170, 150, t('section.start'), 26, '#9dff9d');
    this.startText = text(this, 170, 195, '', 34);
    this.startPlace = this.add.text(170, 225, '', { fontFamily: 'Trebuchet MS, Verdana, sans-serif', fontSize: '20px', color: '#d7efff', align: 'center', wordWrap: { width: 280 }, resolution: 2 }).setOrigin(0.5, 0);
    text(this, 1110, 150, t('section.finish'), 26, '#ffe08a');
    this.finishText = text(this, 1110, 195, '', 34);
    this.finishPlace = this.add.text(1110, 225, '', { fontFamily: 'Trebuchet MS, Verdana, sans-serif', fontSize: '20px', color: '#d7efff', align: 'center', wordWrap: { width: 280 }, resolution: 2 }).setOrigin(0.5, 0);

    // The slider bar with a tick per named place.
    const bar = this.add.graphics();
    bar.fillStyle(0x0b3a5b, 0.8).fillRoundedRect(BAR.x0 - 14, BAR.y - 9, BAR.x1 - BAR.x0 + 28, 18, 9);
    for (const p of places) {
      const x = this.toX(p.along);
      const lock = p.kind === 2;
      bar.fillStyle(lock ? 0x9fd8ff : 0xffffff, p.kind === 0 ? 1 : 0.7).fillRect(x - 1.5, BAR.y - (p.kind === 0 ? 22 : 15), 3, p.kind === 0 ? 44 : 30);
    }
    text(this, BAR.x0, BAR.y + 40, t('section.northEnd'), 16, '#bfe1f7', false);
    text(this, BAR.x1, BAR.y + 40, t('section.southEnd'), 16, '#bfe1f7', false);
    this.handleGfx = this.add.graphics();
    this.lengthText = text(this, 640, 590, '', 28, '#ffffff');

    // Drag the handles; a press on the bar moves the nearer handle there.
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (Math.abs(p.y - BAR.y) > 50 || p.x < BAR.x0 - 40 || p.x > BAR.x1 + 40) return;
      const d = this.fromX(p.x);
      this.dragging = Math.abs(d - this.section.start) <= Math.abs(d - this.section.finish) ? 'start' : 'finish';
      this.moveTo(d, false);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.dragging && p.isDown) this.moveTo(this.fromX(p.x), false);
    });
    const release = (p: Phaser.Input.Pointer): void => {
      if (!this.dragging) return;
      this.moveTo(this.fromX(p.x), true);
      this.dragging = null;
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);

    // Presets and buttons.
    button(this, 470, 660, 250, 60, t('section.default'), () => this.set(defaultSection(def)), { fill: 0x3d5266, textSize: 24 });
    button(this, 760, 660, 250, 60, t('section.whole'), () => this.set({ start: this.range[0], finish: this.range[1] }), { fill: 0x3d5266, textSize: 24 });
    button(this, 150, 660, 200, 64, t('common.back'), () => this.leave(false), { fill: 0x555f6b, textSize: 28 });
    button(this, 1110, 660, 220, 68, t('section.ok'), () => this.leave(true), { fill: 0x2d9d5a, textSize: 32 });

    if (this.data0.online) net.on(this, 'closed', () => this.scene.start('Online', { error: t('online.lost') }));
    this.refresh();
  }

  private toX(along: number): number {
    return BAR.x0 + ((along - this.range[0]) / (this.range[1] - this.range[0])) * (BAR.x1 - BAR.x0);
  }

  private fromX(x: number): number {
    return this.range[0] + ((x - BAR.x0) / (BAR.x1 - BAR.x0)) * (this.range[1] - this.range[0]);
  }

  /** Move the dragged handle; on release, snap to a named place if one is close. */
  private moveTo(along: number, snap: boolean): void {
    if (snap) {
      const x = this.toX(along);
      let best: Place | null = null;
      for (const p of this.places) if (Math.abs(this.toX(p.along) - x) <= SNAP_PX && (!best || Math.abs(p.along - along) < Math.abs(best.along - along))) best = p;
      if (best) along = best.along;
    }
    const def = getTrackDef(this.data0.trackId);
    const min = 1000 * (def.pxPerM ?? 10);
    if (this.dragging === 'start') this.section = clampSection(def, { start: Math.min(along, this.section.finish - min), finish: this.section.finish });
    else this.section = clampSection(def, { start: this.section.start, finish: Math.max(along, this.section.start + min) });
    this.refresh();
  }

  private set(s: Section): void {
    this.section = clampSection(getTrackDef(this.data0.trackId), s);
    this.refresh();
  }

  private mapLine(from: number, to: number): Phaser.Math.Vector2[] {
    const pts: Phaser.Math.Vector2[] = [];
    const n = 160;
    for (let i = 0; i <= n; i++) {
      const p = this.toMap(from + ((to - from) * i) / n);
      pts.push(new Phaser.Math.Vector2(p.x, p.y));
    }
    return pts;
  }

  private refresh(): void {
    const { trackId } = this.data0;
    const def = getTrackDef(trackId);
    const pxPerM = def.pxPerM ?? 10;
    const { start, finish } = this.section;
    const km = (d: number): string => `km ${formatNumber((d - this.range[0]) / pxPerM / 1000)}`;

    // Map: the stretch in water blue over the faint canal, a green start and a white finish.
    const g = this.mapGfx.clear();
    const line = this.mapLine(start, finish);
    g.lineStyle(9, 0x0b3a5b, 1).strokePoints(line, false, false);
    g.lineStyle(6, 0x6fc3ff, 1).strokePoints(line, false, false);
    const a = this.toMap(start), b = this.toMap(finish);
    g.fillStyle(0x62d26f, 1).fillCircle(a.x, a.y, 8).lineStyle(3, 0xffffff, 1).strokeCircle(a.x, a.y, 8);
    g.fillStyle(0xffffff, 1).fillCircle(b.x, b.y, 8).lineStyle(3, 0x0b3a5b, 1).strokeCircle(b.x, b.y, 8);

    // Slider: the chosen part of the bar, and the two handles.
    const h = this.handleGfx.clear();
    const xa = this.toX(start), xb = this.toX(finish);
    h.fillStyle(0x6fc3ff, 1).fillRect(xa, BAR.y - 6, xb - xa, 12);
    h.fillStyle(0x000000, 0.3).fillCircle(xa + 2, BAR.y + 4, 20).fillCircle(xb + 2, BAR.y + 4, 20);
    h.fillStyle(0x62d26f, 1).fillCircle(xa, BAR.y, 20).lineStyle(4, 0xffffff, 1).strokeCircle(xa, BAR.y, 20);
    h.fillStyle(0xffffff, 1).fillCircle(xb, BAR.y, 20).lineStyle(4, 0x0b3a5b, 1).strokeCircle(xb, BAR.y, 20);
    // A small chequered flag on the finish handle.
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if ((i + j) % 2 === 0) h.fillStyle(0x0b3a5b, 1).fillRect(xb - 9 + i * 6, BAR.y - 9 + j * 6, 6, 6);

    this.startText.setText(km(start));
    this.startPlace.setText(describeAlong(trackId, start));
    this.finishText.setText(km(finish));
    this.finishPlace.setText(describeAlong(trackId, finish));
    const length = (finish - start) / pxPerM / 1000;
    fitText(this.lengthText.setText(t('section.length', { km: formatNumber(length), min: Math.max(1, Math.round((length * SEC_PER_KM) / 60)) })), 900);
  }

  private leave(ok: boolean): void {
    const { trackId, online } = this.data0;
    if (ok) {
      (session.sections ??= {})[trackId] = this.section;
      saveSession();
      if (online) net.send({ t: 'settings', settings: { ...(net.lobby?.settings ?? { trackId, difficulty: session.difficulty }), trackId, section: this.section } });
    }
    this.scene.start(online ? 'Lobby' : 'TrackSelect');
  }
}
