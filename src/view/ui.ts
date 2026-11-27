import Phaser from 'phaser';
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

export function button(scene: Phaser.Scene, x: number, y: number, w: number, h: number, label: string, onClick: () => void, opts: ButtonOpts = {}): Phaser.GameObjects.Container {
  const fill = opts.fill ?? 0x2f7fb5;
  const bg = scene.add.rectangle(0, 0, w, h, fill).setStrokeStyle(4, 0xffffff, 0.9);
  const t = fitText(text(scene, 0, 0, label, opts.textSize ?? 30, opts.textColor ?? '#ffffff'), w - 28);
  const c = scene.add.container(x, y, [bg, t]).setSize(w, h);
  c.setInteractive({ useHandCursor: true });
  c.on('pointerover', () => bg.setFillStyle(Phaser.Display.Color.ValueToColor(fill).lighten(15).color));
  c.on('pointerout', () => {
    bg.setFillStyle(fill);
    c.setScale(1);
  });
  c.on('pointerdown', () => c.setScale(0.96));
  c.on('pointerup', () => {
    c.setScale(1);
    onClick();
  });
  return c;
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

