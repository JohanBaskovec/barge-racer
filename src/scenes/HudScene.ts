import Phaser from 'phaser';
import { ITEM_INFO, type ItemId } from '../data/items';
import { FONT } from '../config';
import { formatNumber, itemName, ordinal, t } from '../i18n';
import type { RaceEvent } from '../race/types';
import { addFullscreenButton } from '../view/fullscreen';
import { button, fmtTime, text } from '../view/ui';
import type { RaceScene } from './RaceScene';

/** Two item buttons: the first is fired with right click, the second with middle click. */
const SLOT_BTNS = [
  { x: 1170, y: 578, r: 58 },
  { x: 985, y: 593, r: 58 },
];
const PAUSE_BTN = { x: 640, y: 46, r: 30 };
const MAP = { x: 1060, y: 24, w: 200, h: 140 };

export class HudScene extends Phaser.Scene {
  private race!: RaceScene;
  private posText!: Phaser.GameObjects.Text;
  private lapText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private slotUi: { ring: Phaser.GameObjects.Arc; icon: Phaser.GameObjects.Image; name: Phaser.GameObjects.Text; count: Phaser.GameObjects.Text }[] = [];
  private tripGfx!: Phaser.GameObjects.Graphics;
  private big!: Phaser.GameObjects.Text;
  private map!: Phaser.GameObjects.Graphics;
  private mapScale = 1;
  private mapOx = 0;
  private mapOy = 0;
  private paused = false;
  private overlay?: Phaser.GameObjects.Container;
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

    // Item buttons (tap = fire forward, swipe down = fire backward)
    this.slotUi = SLOT_BTNS.map((b, k) => {
      const ring = this.add.circle(b.x, b.y, b.r, 0x0b3a5b, 0.7).setStrokeStyle(6, 0xffffff, 0.9);
      const icon = this.add.image(b.x, b.y, 'icon_glue').setDisplaySize(76, 76).setVisible(false);
      const count = text(this, b.x + 38, b.y + 38, '', 26, '#ffe08a').setStroke(stroke, 5);
      // The name sits under the button, wrapped to two lines so long names stay on screen.
      const name = this.add
        .text(b.x, b.y + b.r + 8, '', { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: '#ffffff', align: 'center', stroke, strokeThickness: 4, wordWrap: { width: 172 }, resolution: 2 })
        .setOrigin(0.5, 0);
      // Small number badge so the two buttons are told apart.
      this.add.circle(b.x - 44, b.y - 44, 14, 0xffe08a).setStrokeStyle(3, 0x0b3a5b);
      text(this, b.x - 44, b.y - 44, String(k + 1), 18, '#0b3a5b');
      let downY = 0;
      ring.setInteractive({ useHandCursor: true });
      ring.on('pointerdown', (p: Phaser.Input.Pointer) => {
        downY = p.y;
        // Phaser delivers a click only to the top scene, so right/middle clicks that land on a
        // button never reach the race scene: forward them (right = first item, middle = second).
        if (!p.wasTouch && !this.paused && (p.button === 2 || p.button === 1)) race.events.emit('fire', p.button === 2 ? 0 : 1, 'forward');
      });
      ring.on('pointerup', (p: Phaser.Input.Pointer) => {
        if (this.paused) return;
        // Right/middle click on a button is handled by the race scene's shortcuts, not here.
        if (!p.wasTouch && p.button !== 0) return;
        race.events.emit('fire', k, p.y - downY > 45 ? 'backward' : 'forward');
      });
      return { ring, icon, name, count };
    });
    // Full-screen colour wash used by the mushroom effect (the camera effect is in the race scene).
    this.tripGfx = this.add.graphics().setDepth(50).setBlendMode(Phaser.BlendModes.SCREEN).setAlpha(0);

    // Pause
    const pb = this.add.circle(PAUSE_BTN.x, PAUSE_BTN.y, PAUSE_BTN.r, 0x0b3a5b, 0.7).setStrokeStyle(4, 0xffffff, 0.9);
    this.add.rectangle(PAUSE_BTN.x - 7, PAUSE_BTN.y, 8, 24, 0xffffff);
    this.add.rectangle(PAUSE_BTN.x + 7, PAUSE_BTN.y, 8, 24, 0xffffff);
    pb.setInteractive({ useHandCursor: true }).on('pointerup', () => this.togglePause());
    this.input.keyboard?.on('keydown-ESC', () => this.togglePause());

    const fs = addFullscreenButton(this, PAUSE_BTN.x + 80, PAUSE_BTN.y);
    race.pointer.hudZones = fs ? [...SLOT_BTNS, PAUSE_BTN, fs] : [...SLOT_BTNS, PAUSE_BTN];

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

    // Item slots: the roulette spins in the first free slot, then the item stays there.
    const rolling = p.rouletteItem ? p.slots.findIndex((s) => s === null) : -1;
    this.slotUi.forEach((ui, k) => {
      const held = p.slots[k];
      let icon = '';
      let count = '';
      let name = '';
      if (k === rolling) {
        const all = Object.keys(ITEM_INFO) as ItemId[];
        icon = ITEM_INFO[all[Math.floor(time / 80) % all.length]].icon;
        name = t('item.rolling');
      } else if (held) {
        icon = ITEM_INFO[held.id].icon;
        name = itemName(held.id);
        if (held.uses > 1) count = `×${held.uses}`;
      }
      ui.icon.setVisible(icon !== '');
      if (icon) ui.icon.setTexture(icon).setDisplaySize(76, 76);
      ui.name.setText(name);
      ui.count.setText(count);
      ui.ring.setStrokeStyle(6, held ? 0xffe08a : 0xffffff, held ? 1 : 0.6);
      ui.ring.setScale(held ? 1 + Math.sin(time / 180 + k) * 0.03 : 1);
    });
    this.drawTrip(time);

    this.drawMap();
  }

  /** A slowly cycling rainbow wash over the whole screen while the player is tripping. */
  private drawTrip(time: number): void {
    const level = this.race.trip;
    this.tripGfx.setAlpha(level * 0.42).setVisible(level > 0.01);
    if (level <= 0.01) return;
    const hue = (offset: number): number => {
      const c = Phaser.Display.Color.HSVToRGB((time / 4000 + offset) % 1, 0.9, 1) as Phaser.Types.Display.ColorObject;
      return Phaser.Display.Color.GetColor(c.r, c.g, c.b);
    };
    this.tripGfx.clear().fillGradientStyle(hue(0), hue(0.25), hue(0.5), hue(0.75), 1).fillRect(0, 0, 1280, 720);
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
      case 'heal':
        if (e.racer === me) this.popup(t('hud.heal'), '#9dff9d');
        break;
      case 'hit':
        if (e.racer === me) this.popup(e.source === 'bank' ? t('hud.crunch') : e.source === 'fakeCrate' ? t('hud.trap') : t('hud.hit'), '#ff8a7a');
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
