import Phaser from 'phaser';
import { ITEM_INFO, type ItemId } from '../data/items';
import { FONT } from '../config';
import { formatNumber, itemName, ordinal, t } from '../i18n';
import type { EffectKind } from '../effects/effects';
import type { RaceEvent, Racer } from '../race/types';
import { audio } from '../audio/AudioManager';
import { options } from '../options';
import { net } from '../net/client';
import { addFullscreenButton } from '../view/fullscreen';
import { button, fitText, fmtTime, text } from '../view/ui';
import type { RaceScene } from './RaceScene';
import { STICK } from '../control/PointerController';

/**
 * Two item buttons: the first is fired with right click, the second with middle click. Bottom left
 * by default (for the left thumb while the right hand steers); bottom right with the option.
 */
const SLOT_BTNS = [
  { x: 1166, y: 568, r: 70 },
  { x: 966, y: 586, r: 70 },
];
/** The item picture inside a button. */
const ICON = 92;
/** The buttons answer a little beyond their drawn ring: a thumb doesn't aim. */
const HIT_SCALE = 1.25;
/** A press on a button that also started steering fires only if it was this short (ms) and stayed put. */
const TAP_MS = 300;
const TAP_MOVE = 30;
const PAUSE_BTN = { x: 640, y: 46, r: 30 };
const MAP = { x: 1060, y: 24, w: 200, h: 140 };

export class HudScene extends Phaser.Scene {
  private race!: RaceScene;
  private posText!: Phaser.GameObjects.Text;
  private lapText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private slotUi: { ring: Phaser.GameObjects.Arc; icon: Phaser.GameObjects.Image; name: Phaser.GameObjects.Text; count: Phaser.GameObjects.Text }[] = [];
  private tripGfx!: Phaser.GameObjects.Graphics;
  /** The joystick under the steering finger. */
  private stickGfx!: Phaser.GameObjects.Graphics;
  private endsText!: Phaser.GameObjects.Text;
  private big!: Phaser.GameObjects.Text;
  private map!: Phaser.GameObjects.Graphics;
  private mapScale = 1;
  private mapOx = 0;
  private mapOy = 0;
  private paused = false;
  /** The 50 ms tick the race clock was last shown at. */
  private clockTick = -3;
  private overlay?: Phaser.GameObjects.Container;
  private lastPopup = 0;
  private watchText?: Phaser.GameObjects.Text;
  /** Melted cheese covering the view (raclette), and which status effects were on last frame (to announce new ones). */
  private cheese!: Phaser.GameObjects.Image;
  private seen = new Set<string>();
  private lastToxicPopup = -9999;
  private netText!: Phaser.GameObjects.Text;

  constructor() {
    super('Hud');
  }

  init(data: { race: RaceScene }): void {
    this.race = data.race;
    this.paused = false;
    this.clockTick = -3;
  }

  create(): void {
    const race = this.race;
    const stroke = '#0b3a5b';
    // First, so everything else of the HUD is drawn over it: the cheese covers the race, not the buttons.
    this.cheese = this.add.image(640, 0, 'cheeseScreen').setOrigin(0.5, 0).setVisible(false);
    this.seen.clear();
    this.posText = text(this, 24, 22, '', 60).setOrigin(0, 0).setStroke(stroke, 8);
    this.lapText = text(this, 26, 92, '', 30).setOrigin(0, 0).setStroke(stroke, 6);
    this.timeText = text(this, 26, 130, '', 26, '#ffe08a').setOrigin(0, 0).setStroke(stroke, 5);

    this.netText = text(this, 640, 250, t('online.reconnecting'), 34, '#ffd0c4').setStroke(stroke, 7).setVisible(false);
    if (race.spectating) {
      // Beside the item buttons (which show the watched boat's items), on the other side.
      const wx = options.itemsRight ? 470 : 810;
      this.watchText = text(this, wx, 640, '', 30).setStroke(stroke, 6);
      fitText(text(this, wx, 680, t('watch.hint'), 20, '#bfe1f7').setStroke(stroke, 4), 760);
    }

    // Minimap
    this.map = this.add.graphics();
    const tr = race.sim.track;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of tr.samples) {
      minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
      minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y);
    }
    this.mapScale = Math.min((MAP.w - 24) / (maxX - minX), (MAP.h - 24) / (maxY - minY));
    this.mapOx = MAP.x + MAP.w / 2 - ((minX + maxX) / 2) * this.mapScale;
    this.mapOy = MAP.y + MAP.h / 2 - ((minY + maxY) / 2) * this.mapScale;
    // The outline never changes: draw it once (decimated: real-world tracks have thousands of samples).
    const base = this.add.graphics();
    base.fillStyle(0x0b3a5b, 0.55).fillRoundedRect(MAP.x, MAP.y, MAP.w, MAP.h, 10);
    const step = Math.max(1, Math.floor(tr.samples.length / 400));
    const outline = tr.samples.filter((_, i) => i % step === 0).map((s) => new Phaser.Math.Vector2(s.x * this.mapScale + this.mapOx, s.y * this.mapScale + this.mapOy));
    base.lineStyle(7, 0xffffff, 0.35).strokePoints(outline, tr.closed, tr.closed);
    if (!tr.closed && tr.def.range) {
      // A track raced in part (the Reims canal): the stretch stands out from the rest of the canal.
      const from = Math.floor(tr.startDist / tr.spacing), to = Math.ceil((tr.startDist + tr.lapLength) / tr.spacing);
      const stretch = tr.samples.slice(from, to + 1).filter((_, i) => i % step === 0).map((s) => new Phaser.Math.Vector2(s.x * this.mapScale + this.mapOx, s.y * this.mapScale + this.mapOy));
      if (stretch.length > 1) base.lineStyle(5, 0x6fc3ff, 0.9).strokePoints(stretch, false, false);
    }
    if (!tr.closed) {
      for (const [d, color] of [[tr.startDist, 0x62d26f], [tr.startDist + tr.lapLength, 0xffffff]] as const) {
        const s = tr.sampleAt(d);
        base.fillStyle(color, 1).fillCircle(s.x * this.mapScale + this.mapOx, s.y * this.mapScale + this.mapOy, 5);
      }
    }
    this.children.bringToTop(this.map);

    // Item buttons (tap = fire forward, swipe down = fire backward).
    const slotBtns = options.itemsRight ? SLOT_BTNS : SLOT_BTNS.map((b) => ({ ...b, x: 1280 - b.x }));
    this.slotUi = slotBtns.map((b, k) => {
      const ring = this.add.circle(b.x, b.y, b.r, 0x0b3a5b, 0.7).setStrokeStyle(6, 0xffffff, 0.9);
      const icon = this.add.image(b.x, b.y, 'icon_glue').setDisplaySize(ICON, ICON).setVisible(false);
      const count = text(this, b.x + 48, b.y + 48, '', 28, '#ffe08a').setStroke(stroke, 5);
      // The name sits under the button, wrapped to two lines so long names stay on screen.
      const name = this.add
        .text(b.x, b.y + b.r + 8, '', { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: '#ffffff', align: 'center', stroke, strokeThickness: 4, wordWrap: { width: 172 }, resolution: 2 })
        .setOrigin(0.5, 0);
      // Small number badge so the two buttons are told apart.
      this.add.circle(b.x - 53, b.y - 53, 15, 0xffe08a).setStrokeStyle(3, 0x0b3a5b);
      text(this, b.x - 53, b.y - 53, String(k + 1), 19, '#0b3a5b');
      // Presses that started on this button, by pointer: only those can fire it (a steering finger
      // that slides onto the button and lifts there doesn't).
      const presses = new Map<number, { x: number; y: number; t: number; steering: boolean }>();
      ring.setInteractive({ hitArea: new Phaser.Geom.Circle(b.r, b.r, b.r * HIT_SCALE), hitAreaCallback: Phaser.Geom.Circle.Contains, useHandCursor: true });
      ring.on('pointerdown', (p: Phaser.Input.Pointer) => {
        if (this.paused) return;
        // Phaser delivers a click only to the top scene, so right/middle clicks that land on a
        // button never reach the race scene: forward them (right = first item, middle = second).
        if (!p.wasTouch && (p.button === 2 || p.button === 1)) {
          race.events.emit('fire', p.button === 2 ? 0 : 1, 'forward');
          return;
        }
        // With no finger steering yet, this one steers too: the button never blocks steering.
        // With another finger steering (the other hand), it's just a press on the button.
        presses.set(p.id, { x: p.x, y: p.y, t: p.downTime, steering: race.pointer.claim(p) });
      });
      ring.on('pointerup', (p: Phaser.Input.Pointer) => {
        const press = presses.get(p.id);
        presses.delete(p.id);
        if (!press || this.paused) return;
        if (!p.wasTouch && p.button !== 0) return; // right/middle: handled on press
        const dy = p.y - press.y;
        const flick = dy > 45; // swipe down: fire backwards
        // A press that also steered and turned into a hold or a drag was steering, not a tap.
        // (Timed with the touch events' own timestamps: the scene clock only moves once a frame.)
        if (press.steering && !flick && (p.upTime - press.t > TAP_MS || Math.hypot(p.x - press.x, dy) > TAP_MOVE)) return;
        race.events.emit('fire', k, flick ? 'backward' : 'forward');
      });
      return { ring, icon, name, count };
    });
    // Full-screen colour wash used by the mushroom effect (the camera effect is in the race scene).
    this.stickGfx = this.add.graphics().setDepth(49);
    this.tripGfx = this.add.graphics().setDepth(50).setBlendMode(Phaser.BlendModes.SCREEN).setAlpha(0);

    // Pause
    const pb = this.add.circle(PAUSE_BTN.x, PAUSE_BTN.y, PAUSE_BTN.r, 0x0b3a5b, 0.7).setStrokeStyle(4, 0xffffff, 0.9);
    this.add.rectangle(PAUSE_BTN.x - 7, PAUSE_BTN.y, 8, 24, 0xffffff);
    this.add.rectangle(PAUSE_BTN.x + 7, PAUSE_BTN.y, 8, 24, 0xffffff);
    // Only a press that started on the button pauses (not a steering finger lifted over it).
    let pausePress = -1;
    pb.setInteractive({ useHandCursor: true })
      .on('pointerdown', (p: Phaser.Input.Pointer) => (pausePress = p.id))
      .on('pointerup', (p: Phaser.Input.Pointer) => {
        if (p.id === pausePress) this.togglePause();
        pausePress = -1;
      });
    this.input.keyboard?.on('keydown-ESC', () => this.togglePause());

    const fs = addFullscreenButton(this, PAUSE_BTN.x + 80, PAUSE_BTN.y);
    const zones = slotBtns.map((b) => ({ ...b, r: b.r * HIT_SCALE }));
    race.pointer.hudZones = fs ? [...zones, PAUSE_BTN, fs] : [...zones, PAUSE_BTN];

    this.big = text(this, 640, 300, '', 160).setStroke(stroke, 16);
    this.endsText = text(this, 640, 104, '', 30, '#ffe08a').setStroke(stroke, 6);

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
    // The clock 20 times a second: each change redraws the text and uploads it to the GPU again.
    const tick = sim.phase === 'countdown' ? -1 : Math.floor(time / 50);
    if (tick !== this.clockTick) {
      this.clockTick = tick;
      this.timeText.setText(tick === -1 ? '' : fmtTime(sim.time));
    }
    this.netText.setVisible(net.reconnecting);
    this.updateStatus(p);
    if (this.watchText) fitText(this.watchText.setText(t('watch.title', { name: p.name })), 760);
    // Multiplayer: once someone has finished, the others see how long they have left.
    this.endsText.setText(sim.finishCountdown >= 0 && !p.finished ? t('hud.raceEnds', { s: Math.ceil(sim.finishCountdown) }) : '');

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
      if (icon) ui.icon.setTexture(icon).setDisplaySize(ICON, ICON);
      ui.name.setText(name);
      ui.count.setText(count);
      // The better version (three uses) gets a thicker orange ring.
      if (held?.triple) ui.ring.setStrokeStyle(9, 0xff9a1f, 1);
      else ui.ring.setStrokeStyle(6, held ? 0xffe08a : 0xffffff, held ? 1 : 0.6);
      ui.ring.setScale(held ? 1 + Math.sin(time / 180 + k) * 0.03 : 1);
    });
    this.drawTrip(time);
    this.drawStick();

    this.drawMap();
  }

  /**
   * Status effects on the player: announce the ones that just started, and cover the screen with
   * cheese while the player is cheesed: it drops in with a splat, stays, then runs down and off.
   */
  private updateStatus(p: Racer): void {
    const now = new Set<string>();
    for (const e of p.effects) if (e.remaining > 0) now.add(e.kind);
    const announce: [EffectKind, string, string][] = [
      ['blackout', 'hud.blackout', '#ffe04a'], ['cheesed', 'hud.cheese', '#ffd23f'], ['shrunk', 'hud.shrunk', '#bfe1f7'], ['hasty', 'hud.hasty', '#ffb0d9'],
    ];
    for (const [kind, key, color] of announce) if (now.has(kind) && !this.seen.has(kind)) this.popup(t(key as 'hud.blackout'), color);
    this.seen = now;

    const e = p.effects.find((x) => x.kind === 'cheesed' && x.remaining > 0);
    this.cheese.setVisible(!!e);
    if (!e) return;
    const age = e.duration - e.remaining;
    const drop = Math.min(1, age / 0.3);
    const eased = 1 - (1 - drop) ** 3;
    const leave = Math.max(0, Math.min(1, 1 - e.remaining)); // the last second: it runs down
    this.cheese.setY(-900 * (1 - eased) + leave * leave * 760).setAlpha(1 - leave * 0.4);
  }

  /** A slowly cycling rainbow wash over the whole screen while the player is tripping. */
  /** The stick: a ring where the finger landed and a knob under it (drawn slightly faint, it's under a thumb). */
  private drawStick(): void {
    const g = this.stickGfx.clear();
    const st = this.paused || this.race.spectating ? null : this.race.pointer.stick;
    if (!st) return;
    const dx = st.x - st.ax, dy = st.y - st.ay;
    const d = Math.hypot(dx, dy);
    const k = d > STICK.fullThrottle ? STICK.fullThrottle / d : 1;
    g.fillStyle(0x0b3a5b, 0.22).fillCircle(st.ax, st.ay, STICK.fullThrottle);
    g.lineStyle(4, 0xffffff, 0.45).strokeCircle(st.ax, st.ay, STICK.fullThrottle);
    g.fillStyle(0xffffff, 0.4).fillCircle(st.ax + dx * k, st.ay + dy * k, 34);
    g.lineStyle(3, 0x0b3a5b, 0.5).strokeCircle(st.ax + dx * k, st.ay + dy * k, 34);
  }

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
    // Barges as little grey dashes
    g.fillStyle(0xd0d4d8, 0.85);
    for (const p of this.race.trafficView?.poses ?? []) {
      if (p.alpha < 0.5) continue;
      const x = p.x * this.mapScale + this.mapOx, y = p.y * this.mapScale + this.mapOy;
      if (x < MAP.x || x > MAP.x + MAP.w || y < MAP.y || y > MAP.y + MAP.h) continue;
      g.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    for (const r of sim.racers) {
      const x = r.x * this.mapScale + this.mapOx;
      const y = r.y * this.mapScale + this.mapOy;
      const followed = r === sim.player; // your boat, or the one you're watching
      g.fillStyle(r.color, 1).fillCircle(x, y, followed ? 6 : 4.5);
      if (followed) g.lineStyle(2, 0xffffff, 1).strokeCircle(x, y, 7);
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
      case 'drop':
        if (e.racer === me) this.popup(t('hud.gift'), '#9dff9d');
        break;
      case 'hit':
        if (e.racer === me) {
          if (e.source === 'toilet') {
            // The smoke hurts every step: say so now and then, not every time.
            if (this.time.now - this.lastToxicPopup > 1800) this.popup(t('hud.toxic'), '#b7d85a');
            this.lastToxicPopup = this.time.now;
          } else this.popup(e.source === 'bank' ? t('hud.crunch') : e.source === 'fakeCrate' ? t('hud.trap') : e.source === 'karcher' ? t('hud.washed') : t('hud.hit'), '#ff8a7a');
        } else if (e.by === me && e.source !== 'toilet') this.popup(t('hud.gotHim'), '#ffe08a');
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
    // An online race goes on while the menu is open: only a local race is paused.
    const online = !!this.race.online;
    if (!online) {
      this.race.scene.pause();
      audio.muteEngines(true);
    }
    audio.duckMusic(true);
    const shade = this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.6).setInteractive();
    const title = text(this, 640, 160, t('pause.title'), 80).setStroke('#0b3a5b', 10);
    const resume = button(this, 640, 280, 360, 72, t('pause.resume'), () => this.resume(), { fill: 0x2d9d5a, textSize: 36 });
    const opts = button(this, 640, online ? 370 : 460, 360, 72, t('menu.options'), () => this.scene.launch('Options', { overlay: true }), { fill: 0x3d5266, textSize: 36 });
    const restart = button(this, 640, 370, 360, 72, t('pause.restart'), () => {
      this.resume();
      this.race.scene.restart();
    }, { textSize: 38 }).setVisible(!online);
    const quit = button(this, 640, online ? 460 : 550, 360, 72, online ? t('pause.leave') : t('pause.quit'), () => {
      this.overlay?.destroy();
      this.paused = false;
      audio.muteEngines(false);
      audio.duckMusic(false);
      this.race.scene.stop();
      this.scene.stop();
      if (online) {
        net.leave();
        this.scene.start('Online');
      } else this.scene.start('BoatSelect');
    }, { fill: 0x8a4a4a, textSize: 36 });
    this.overlay = this.add.container(0, 0, [shade, title, resume, restart, opts, quit]).setDepth(100);
  }

  private resume(): void {
    this.scene.stop('Options');
    this.overlay?.destroy();
    this.overlay = undefined;
    this.paused = false;
    this.race.scene.resume();
    audio.muteEngines(false);
    audio.duckMusic(false);
  }
}
