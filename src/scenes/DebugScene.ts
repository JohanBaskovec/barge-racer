import Phaser from 'phaser';
import { centreLayout, fullScreenRect } from '../view/layout';
import { ITEM_INFO, type ItemId } from '../data/items';
import { itemName, t } from '../i18n';
import { button, fitText, setSelected, text } from '../view/ui';
import type { HudScene } from './HudScene';
import type { RaceScene } from './RaceScene';

/**
 * Debug menu, opened from the pause menu of a single-player race on a computer: hand yourself any
 * item (or its better version, x 3), repair your hull, or set a hazard off in front of you.
 */
export class DebugScene extends Phaser.Scene {
  private triple = false;
  /** Clicking an item makes an opponent use it, as if they had (to see what it does to you). */
  private usedOnMe = false;

  constructor() {
    super('Debug');
  }

  /** Everywhere, phones and tablets too (the pause menu offers it in single player only). */
  static available(_game: Phaser.Game): boolean {
    return true;
  }

  create(): void {
    const race = this.scene.get('Race') as RaceScene;
    const hud = this.scene.get('Hud') as HudScene;
    const sim = race.sim;
    const me = sim.player!;
    centreLayout(this);
    fullScreenRect(this, 0x06243a, 0.94).setInteractive();
    text(this, 640, 52, t('debug.title'), 52).setStroke('#0b3a5b', 8);
    const status = text(this, 640, 92, '', 22, '#ffe08a').setStroke('#0b3a5b', 5);
    const say = (s: string): void => {
      status.setText(s).setAlpha(1);
      this.tweens.killTweensOf(status);
      this.tweens.add({ targets: status, alpha: 0, delay: 1400, duration: 400 });
    };

    // Back to the race (after setting something off, to see it).
    const go = (fn: () => void): void => {
      fn();
      this.scene.stop();
      hud.resumeFromDebug();
    };

    // Every item: a click puts it in a free slot (or the first one when both are full).
    const ids = Object.keys(ITEM_INFO) as ItemId[];
    const rows = Math.ceil(ids.length / 11);
    const perRow = Math.ceil(ids.length / rows);
    ids.forEach((id, i) => {
      const row = Math.floor(i / perRow), col = i % perRow;
      const x = 640 + (col - (perRow - 1) / 2) * 106, y = (rows > 2 ? 150 : 190) + row * (rows > 2 ? 118 : 150);
      const bg = this.add.circle(x, y, 44, 0x0b3a5b, 1).setStrokeStyle(4, 0xffffff, 0.8).setInteractive({ useHandCursor: true });
      this.add.image(x, y, ITEM_INFO[id].icon).setDisplaySize(68, 68);
      // Three rows: names on one line (shrunk to fit), or they run into the row below.
      fitText(this.add.text(x, y + 52, itemName(id), { fontFamily: 'Trebuchet MS, Verdana, sans-serif', fontSize: '15px', fontStyle: 'bold', color: '#ffffff', align: 'center', wordWrap: rows > 2 ? undefined : { width: 100 }, resolution: 2 }).setOrigin(0.5, 0), 102);
      bg.on('pointerover', () => bg.setStrokeStyle(5, 0xffe08a, 1));
      bg.on('pointerout', () => bg.setStrokeStyle(4, 0xffffff, 0.8));
      bg.on('pointerup', () => {
        const triple = this.triple && ITEM_INFO[id].uses < 3;
        if (this.usedOnMe) {
          // The boat just behind fires it forwards (at you); if you're last, the one just ahead.
          const by = sim.racers.find((o) => o.position === me.position + 1) ?? sim.racers.find((o) => o.position === me.position - 1);
          if (!by) return;
          by.slots = [null, null];
          by.rouletteItem = null;
          sim.items.give(by, id, triple);
          sim.items.use(by, 0, 'forward');
          go(() => undefined);
          return;
        }
        if (sim.items.freeSlot(me) < 0) me.slots[0] = null;
        me.rouletteItem = null;
        sim.items.give(me, id, triple);
        say(t('debug.given', { item: itemName(id) + (triple ? ' x3' : '') }));
      });
    });

    // The better version, an opponent using it on you, and a repair
    const tri = button(this, 370, 500, 240, 60, t('debug.triple'), () => {
      this.triple = !this.triple;
      setSelected(tri, this.triple);
    }, { fill: 0xd9822b, textSize: 26 });
    setSelected(tri, this.triple);
    const onMe = button(this, 640, 500, 240, 60, t('debug.usedOnMe'), () => {
      this.usedOnMe = !this.usedOnMe;
      setSelected(onMe, this.usedOnMe);
      say(t(this.usedOnMe ? 'debug.usedOnMeHint' : 'debug.toYou'));
    }, { fill: 0x8a4a6a, textSize: 24 });
    setSelected(onMe, this.usedOnMe);
    button(this, 910, 500, 240, 60, t('debug.repair'), () => {
      me.hull = me.stats.maxHull;
      say(t('debug.repaired'));
    }, { fill: 0x2d9d5a, textSize: 26 });

    // Hazards: set one off in front of you, and back to the race to see it.
    const hz = sim.hazards;
    const hazards: [string, () => void][] = [
      [t('debug.police'), () => hz.debugPolice(me)],
      [t('debug.angler'), () => hz.debugAngler(me)],
      [t('debug.ducks'), () => hz.debugCritter(me, 0)],
      [t('debug.rowers'), () => hz.debugCritter(me, 1)],
      [t('debug.swimmers'), () => hz.debugCritter(me, 2)],
    ];
    hazards.forEach(([label, fn], i) => button(this, 640 + (i - 2) * 205, 590, 190, 60, label, () => go(fn), { fill: 0x3d5266, textSize: 24 }));

    button(this, 640, 670, 260, 56, t('common.back'), () => this.scene.stop(), { fill: 0x555f6b, textSize: 28 });
  }
}
