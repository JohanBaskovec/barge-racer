import Phaser from 'phaser';
import { audio } from '../audio/AudioManager';
import { t, type TranslationKey } from '../i18n';
import { type Options, options, setOption } from '../options';
import { background, button, fitText, setSelected, text } from '../view/ui';

type BoolKey = 'itemsRight' | 'stickSteer' | 'autoFire' | 'reducedShake';

/**
 * Volumes and gameplay options. Opened from the title screen (full screen) or from the pause
 * menu (as an overlay above the paused race); `back` says which.
 */
export class OptionsScene extends Phaser.Scene {
  private overlay = false;

  constructor() {
    super('Options');
  }

  init(data: { overlay?: boolean }): void {
    this.overlay = !!data?.overlay;
  }

  create(): void {
    if (this.overlay) this.add.rectangle(640, 360, 1280, 720, 0x06243a, 0.92).setInteractive();
    else background(this);
    fitText(text(this, 640, 70, t('options.title'), 56), 900).setStroke('#0b3a5b', 8);

    this.volumeRow(160, 'options.music', 'musicVolume');
    this.volumeRow(236, 'options.sfx', 'sfxVolume');
    this.toggleRow(326, 'options.stickSteer', 'stickSteer', ['options.stickPoint', 'options.stickStick']);
    this.toggleRow(398, 'options.itemsRight', 'itemsRight');
    this.toggleRow(470, 'options.autoFire', 'autoFire');
    this.toggleRow(542, 'options.reducedShake', 'reducedShake');

    button(this, 640, 646, 300, 72, t('common.back'), () => this.close(), { fill: 0x555f6b, textSize: 32 });
    this.input.keyboard?.on('keydown-ESC', () => this.close());
  }

  private close(): void {
    if (this.overlay) this.scene.stop();
    else this.scene.start('Title');
  }

  private label(y: number, key: TranslationKey): void {
    const l = this.add.text(230, y, t(key), { fontFamily: 'Trebuchet MS, Verdana, sans-serif', fontSize: '28px', color: '#ffffff', fontStyle: 'bold', resolution: 2 }).setOrigin(0, 0.5);
    if (l.width > 400) l.setScale(400 / l.width);
  }

  /** Volume in ten steps, with - and + buttons. */
  private volumeRow(y: number, key: TranslationKey, opt: 'musicVolume' | 'sfxVolume'): void {
    this.label(y, key);
    const bars: Phaser.GameObjects.Rectangle[] = [];
    for (let i = 0; i < 10; i++) bars.push(this.add.rectangle(760 + i * 30, y, 24, 34, 0x2a4f6b).setStrokeStyle(2, 0xffffff, 0.3));
    const paint = (): void => bars.forEach((b, i) => b.setFillStyle(i < Math.round(options[opt] * 10) ? 0xffd23f : 0x2a4f6b));
    const change = (d: number): void => {
      setOption(opt, Math.round(Math.max(0, Math.min(1, options[opt] + d)) * 10) / 10);
      paint();
      if (opt === 'sfxVolume') audio.play('crate');
    };
    button(this, 700, y, 64, 56, '−', () => change(-0.1), { textSize: 36 });
    button(this, 1090, y, 64, 56, '+', () => change(0.1), { textSize: 36 });
    paint();
  }

  /** On / off (or two named choices), as two buttons; the current choice is outlined. */
  private toggleRow(y: number, key: TranslationKey, opt: BoolKey, names: [TranslationKey, TranslationKey] = ['options.off', 'options.on']): void {
    this.label(y, key);
    const off = button(this, 830, y, 150, 56, t(names[0]), () => set(false), { textSize: 26, fill: 0x3d5266 });
    const on = button(this, 1000, y, 150, 56, t(names[1]), () => set(true), { textSize: 26, fill: 0x2d9d5a });
    const set = (v: boolean): void => {
      setOption(opt, v as Options[BoolKey]);
      setSelected(on, v);
      setSelected(off, !v);
    };
    setSelected(on, options[opt]);
    setSelected(off, !options[opt]);
  }
}
