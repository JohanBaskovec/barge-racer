import Phaser from 'phaser';
import { audio } from '../audio/AudioManager';
import { FONT } from '../config';

export function text(scene: Phaser.Scene, x: number, y: number, s: string, size = 28, color = '#ffffff', bold = true): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y, s, { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: bold ? 'bold' : 'normal', resolution: 2 })
    .setOrigin(0.5);
}

/** Shrink a text object so it is never wider than maxWidth (translations vary in length). */
export function fitText<T extends Phaser.GameObjects.Text>(t: T, maxWidth: number): T {
  t.setScale(t.width > maxWidth ? maxWidth / t.width : 1);
  return t;
}

export interface ButtonOpts {
  fill?: number;
  textSize?: number;
  textColor?: string;
}

/**
 * A rounded button with a drop shadow; it sinks when pressed and plays a click.
 * `setSelected(button, true)` gives it a gold outline (current choice).
 */
export function button(scene: Phaser.Scene, x: number, y: number, w: number, h: number, label: string, onClick: () => void, opts: ButtonOpts = {}): Phaser.GameObjects.Container {
  const fill = opts.fill ?? 0x2f7fb5;
  const hoverFill = Phaser.Display.Color.ValueToColor(fill).lighten(12).color;
  const radius = Math.min(18, h / 2.6);
  const g = scene.add.graphics();
  const t = fitText(text(scene, 0, 0, label, opts.textSize ?? 30, opts.textColor ?? '#ffffff'), w - 28);
  t.setShadow(0, 2, '#00000055', 2, false, true);
  const state = { hover: false, pressed: false, selected: false };
  const draw = (): void => {
    const dy = state.pressed ? 3 : 0;
    g.clear();
    g.fillStyle(0x000000, 0.28).fillRoundedRect(-w / 2 + 2, -h / 2 + 6, w, h, radius);
    g.fillStyle(state.hover ? hoverFill : fill, 1).fillRoundedRect(-w / 2, -h / 2 + dy, w, h, radius);
    g.fillStyle(0xffffff, 0.13).fillRoundedRect(-w / 2 + 5, -h / 2 + 4 + dy, w - 10, h * 0.42, Math.max(2, radius - 4));
    g.lineStyle(state.selected ? 6 : 3, state.selected ? 0xffe08a : 0xffffff, state.selected ? 1 : 0.85).strokeRoundedRect(-w / 2, -h / 2 + dy, w, h, radius);
    t.setY(dy);
  };
  draw();
  const c = scene.add.container(x, y, [g, t]).setSize(w, h);
  c.setData('setSelected', (on: boolean) => {
    state.selected = on;
    draw();
  });
  c.setInteractive({ useHandCursor: true });
  c.on('pointerover', () => ((state.hover = true), draw()));
  c.on('pointerout', () => ((state.hover = false), (state.pressed = false), draw()));
  c.on('pointerdown', () => ((state.pressed = true), draw()));
  c.on('pointerup', () => {
    state.pressed = false;
    draw();
    audio.play('click', 0.7);
    onClick();
  });
  return c;
}

/** Gold outline on a button made with `button()` (the current choice in a group). */
export function setSelected(b: Phaser.GameObjects.Container, on: boolean): void {
  (b.getData('setSelected') as ((on: boolean) => void) | undefined)?.(on);
}

export function background(scene: Phaser.Scene, top = 0x0b3a5b, bottom = 0x2f7fb5): void {
  const g = scene.add.graphics();
  g.fillGradientStyle(top, top, bottom, bottom, 1);
  g.fillRect(0, 0, 1280, 720);
}

export function fmtTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

