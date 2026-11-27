import Phaser from 'phaser';
import { ITEM_INFO, type ItemId } from '../data/items';
import { formatNumber, itemName, ordinal, t } from '../i18n';
import type { RaceEvent } from '../race/types';
import { addFullscreenButton } from '../view/fullscreen';
import { button, fitText, fmtTime, text } from '../view/ui';
import type { RaceScene } from './RaceScene';

const ITEM_BTN = { x: 1160, y: 590, r: 62 };
const PAUSE_BTN = { x: 640, y: 46, r: 30 };
const MAP = { x: 1060, y: 24, w: 200, h: 140 };

export class HudScene extends Phaser.Scene {
  private race!: RaceScene;
  private posText!: Phaser.GameObjects.Text;
  private lapText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private itemIcon!: Phaser.GameObjects.Image;
  private itemName!: Phaser.GameObjects.Text;
  private itemCount!: Phaser.GameObjects.Text;
  private itemRing!: Phaser.GameObjects.Arc;
  private big!: Phaser.GameObjects.Text;
  private map!: Phaser.GameObjects.Graphics;
  private mapScale = 1;
  private mapOx = 0;
  private mapOy = 0;
  private paused = false;
  private overlay?: Phaser.GameObjects.Container;
  private downY = 0;
  private lastPopup = 0;

  constructor() {
    super('Hud');
  }

  init(data: { race: RaceScene }): void {
    this.race = data.race;
    this.paused = false;
  }

  create(): void {
    const race = this.race;
    const stroke = '#0b3a5b';
    this.posText = text(this, 24, 22, '', 60).setOrigin(0, 0).setStroke(stroke, 8);
    this.lapText = text(this, 26, 92, '', 30).setOrigin(0, 0).setStroke(stroke, 6);
    this.timeText = text(this, 26, 130, '', 26, '#ffe08a').setOrigin(0, 0).setStroke(stroke, 5);

    // Minimap
    this.map = this.add.graphics();
    const t = race.sim.track;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of t.samples) {
      minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
      minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y);
    }
    this.mapScale = Math.min((MAP.w - 24) / (maxX - minX), (MAP.h - 24) / (maxY - minY));
    this.mapOx = MAP.x + MAP.w / 2 - ((minX + maxX) / 2) * this.mapScale;
    this.mapOy = MAP.y + MAP.h / 2 - ((minY + maxY) / 2) * this.mapScale;
    // The outline never changes: draw it once (decimated: real-world tracks have thousands of samples).
    const base = this.add.graphics();
    base.fillStyle(0x0b3a5b, 0.55).fillRoundedRect(MAP.x, MAP.y, MAP.w, MAP.h, 10);
    const step = Math.max(1, Math.floor(t.samples.length / 400));
    const outline = t.samples.filter((_, i) => i % step === 0).map((s) => new Phaser.Math.Vector2(s.x * this.mapScale + this.mapOx, s.y * this.mapScale + this.mapOy));
    base.lineStyle(7, 0xffffff, 0.35).strokePoints(outline, t.closed, t.closed);
    if (!t.closed) {
      for (const [d, color] of [[t.startDist, 0x62d26f], [t.startDist + t.lapLength, 0xffffff]] as const) {
        const s = t.sampleAt(d);
        base.fillStyle(color, 1).fillCircle(s.x * this.mapScale + this.mapOx, s.y * this.mapScale + this.mapOy, 5);
      }
    }
    this.children.bringToTop(this.map);

    // Item button
    this.itemRing = this.add.circle(ITEM_BTN.x, ITEM_BTN.y, ITEM_BTN.r, 0x0b3a5b, 0.7).setStrokeStyle(6, 0xffffff, 0.9);
    this.itemIcon = this.add.image(ITEM_BTN.x, ITEM_BTN.y, 'icon_glue').setDisplaySize(80, 80).setVisible(false);
    this.itemCount = text(this, ITEM_BTN.x + 40, ITEM_BTN.y + 40, '', 28, '#ffe08a').setStroke(stroke, 5);
    this.itemName = text(this, ITEM_BTN.x, ITEM_BTN.y + ITEM_BTN.r + 26, '', 24, '#ffffff').setStroke(stroke, 5);
    this.itemRing.setInteractive({ useHandCursor: true });
    this.itemRing.on('pointerdown', (p: Phaser.Input.Pointer) => (this.downY = p.y));
    this.itemRing.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (this.paused) return;
      race.events.emit('fire', p.y - this.downY > 45 ? 'backward' : 'forward');
    });

    // Pause
    const pb = this.add.circle(PAUSE_BTN.x, PAUSE_BTN.y, PAUSE_BTN.r, 0x0b3a5b, 0.7).setStrokeStyle(4, 0xffffff, 0.9);
    this.add.rectangle(PAUSE_BTN.x - 7, PAUSE_BTN.y, 8, 24, 0xffffff);
    this.add.rectangle(PAUSE_BTN.x + 7, PAUSE_BTN.y, 8, 24, 0xffffff);
    pb.setInteractive({ useHandCursor: true }).on('pointerup', () => this.togglePause());
    this.input.keyboard?.on('keydown-ESC', () => this.togglePause());

    const fs = addFullscreenButton(this, PAUSE_BTN.x + 80, PAUSE_BTN.y);
    race.pointer.hudZones = fs ? [ITEM_BTN, PAUSE_BTN, fs] : [ITEM_BTN, PAUSE_BTN];

    this.big = text(this, 640, 300, '', 160).setStroke(stroke, 16);

    race.events.on('race-event', this.onEvent, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => race.events.off('race-event', this.onEvent, this));
  }

  update(time: number): void {
    const sim = this.race.sim;
    const p = sim.player!;
    this.posText.setText(`${ordinal(p.position + 1)}`);
    if (sim.track.closed) {
      const lap = Math.min(sim.track.laps, p.lapsDone + 1);
      this.lapText.setText(t('hud.lap', { n: lap, total: sim.track.laps }));
    } else {
      // Point-to-point: distance left to the finish instead of laps.
      const left = Math.max(0, sim.track.lapLength - Math.max(0, p.progress)) / (sim.track.def.pxPerM ?? 10) / 1000;
      this.lapText.setText(t('hud.remaining', { km: formatNumber(p.finished ? 0 : left) }));
    }
    this.timeText.setText(sim.phase === 'countdown' ? '' : fmtTime(sim.time));

    // Item slot: roulette flicker, then the held item
    let icon = '';
    let count = '';
    let name = '';
    if (p.rouletteItem) {
      const all = Object.keys(ITEM_INFO) as ItemId[];
      icon = ITEM_INFO[all[Math.floor(time / 80) % all.length]].icon;
      name = t('item.rolling');
    } else if (p.item) {
      icon = ITEM_INFO[p.item].icon;
      name = itemName(p.item);
      if (p.itemUses > 1) count = `×${p.itemUses}`;
    }
    this.itemIcon.setVisible(icon !== '');
    if (icon) this.itemIcon.setTexture(icon).setDisplaySize(80, 80);
    this.itemName.setText(name);
    fitText(this.itemName, 205); // long names (e.g. in French) must stay on screen
    this.itemCount.setText(count);
    this.itemRing.setStrokeStyle(6, p.item ? 0xffe08a : 0xffffff, p.item ? 1 : 0.6);
    this.itemRing.setScale(p.item ? 1 + Math.sin(time / 180) * 0.03 : 1);

    this.drawMap();
  }

  private drawMap(): void {
    const g = this.map;
    const sim = this.race.sim;
    g.clear();
    for (const r of sim.racers) {
      const x = r.x * this.mapScale + this.mapOx;
      const y = r.y * this.mapScale + this.mapOy;
      g.fillStyle(r.color, 1).fillCircle(x, y, r.isPlayer ? 6 : 4.5);
      if (r.isPlayer) g.lineStyle(2, 0xffffff, 1).strokeCircle(x, y, 7);
    }
  }

  private onEvent(e: RaceEvent): void {
    const sim = this.race.sim;
    const me = sim.player!.id;
    switch (e.type) {
      case 'countdown':
        this.flashBig(e.value === 0 ? t('hud.go') : String(e.value), e.value === 0 ? '#62d26f' : '#ffffff');
        break;
      case 'itemUsed':
        break;
      case 'hit':
        if (e.racer === me) this.popup(e.source === 'bank' ? t('hud.crunch') : t('hud.hit'), '#ff8a7a');
        else if (e.by === me) this.popup(t('hud.gotHim'), '#ffe08a');
        break;
      case 'sunk':
        if (e.racer === me) this.popup(t('hud.sunk'), '#9fd8ff');
        else if (e.racer !== me) this.popup(t('hud.otherSunk', { name: sim.racers[e.racer].name }), '#ffe08a');
        break;
      case 'lap':
        if (e.racer === me) {
          if (e.lap === sim.track.laps - 1) this.popup(t('hud.finalLap'), '#ffe08a');
          else if (e.lap < sim.track.laps) this.popup(t('hud.lapPopup', { n: e.lap + 1 }), '#ffffff');
        }
        break;
      case 'finish':
        if (e.racer === me) this.flashBig(e.position === 0 ? t('hud.winner') : t('hud.finish'), '#ffe08a', 90);
        break;
      default:
        break;
    }
  }

  private flashBig(s: string, color: string, size = 160): void {
    this.big.setText(s).setColor(color).setFontSize(size).setAlpha(1).setScale(1.4);
    this.tweens.killTweensOf(this.big);
    this.tweens.add({ targets: this.big, scale: 1, duration: 200, ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.big, alpha: 0, delay: 700, duration: 350 });
  }

  private popup(s: string, color: string): void {
    const now = this.time.now;
    const y = 200 + ((now - this.lastPopup) < 400 ? 40 : 0);
    this.lastPopup = now;
    const t = text(this, 640, y, s, 52, color).setStroke('#0b3a5b', 8);
    this.tweens.add({ targets: t, y: y - 50, alpha: 0, duration: 1300, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  private togglePause(): void {
    if (this.paused) return this.resume();
    if (this.race.sim.phase === 'over') return;
    this.paused = true;
    this.race.scene.pause();
    const shade = this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.6).setInteractive();
    const title = text(this, 640, 190, t('pause.title'), 80).setStroke('#0b3a5b', 10);
    const resume = button(this, 640, 320, 360, 78, t('pause.resume'), () => this.resume(), { fill: 0x2d9d5a, textSize: 38 });
    const restart = button(this, 640, 420, 360, 78, t('pause.restart'), () => {
      this.resume();
      this.race.scene.restart();
    }, { textSize: 38 });
    const quit = button(this, 640, 520, 360, 78, t('pause.quit'), () => {
      this.overlay?.destroy();
      this.paused = false;
      this.race.scene.stop();
      this.scene.stop();
      this.scene.start('BoatSelect');
    }, { fill: 0x8a4a4a, textSize: 38 });
    this.overlay = this.add.container(0, 0, [shade, title, resume, restart, quit]).setDepth(100);
  }

  private resume(): void {
    this.overlay?.destroy();
    this.overlay = undefined;
    this.paused = false;
    this.race.scene.resume();
  }
}
