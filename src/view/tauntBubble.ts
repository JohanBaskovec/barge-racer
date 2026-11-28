import Phaser from 'phaser';
import { audio } from '../audio/AudioManager';
import { TAUNT_SHOW, type TauntId } from '../data/taunts';
import { t } from '../i18n';
import { FONT } from '../config';

/**
 * A speech bubble with a taunt: over a boat in a race (tail pointing down), beside a name in the
 * lobby (tail pointing left). It pops in, stays TAUNT_SHOW seconds, then fades and goes.
 * `who`: the name to put before the phrase (null: none, the bubble sits on the speaker).
 */
export function tauntBubble(scene: Phaser.Scene, x: number, y: number, id: TauntId, tail: 'down' | 'left', who: string | null = null, maxW = 260): Phaser.GameObjects.Container {
  const label = scene.add
    .text(0, 0, who ? `${who}: ${t(`taunt.${id}`)}` : t(`taunt.${id}`), { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#1b2a38', resolution: 2 })
    .setOrigin(0.5);
  if (label.width > maxW) label.setScale(maxW / label.width);
  const w = label.displayWidth + 26, h = label.displayHeight + 14;
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.25).fillRoundedRect(-w / 2 + 2, -h / 2 + 4, w, h, 12);
  g.fillStyle(0xffffff, 1).lineStyle(3, 0x1b2a38, 1);
  g.fillRoundedRect(-w / 2, -h / 2, w, h, 12).strokeRoundedRect(-w / 2, -h / 2, w, h, 12);
  // The tail, drawn over the outline so the bubble and the tail are one shape.
  if (tail === 'down') {
    g.fillTriangle(-9, h / 2 - 2, 9, h / 2 - 2, 0, h / 2 + 12);
    g.lineBetween(-9, h / 2, 0, h / 2 + 12).lineBetween(9, h / 2, 0, h / 2 + 12);
  } else {
    g.fillTriangle(-w / 2 + 2, -8, -w / 2 + 2, 8, -w / 2 - 12, 0);
    g.lineBetween(-w / 2, -8, -w / 2 - 12, 0).lineBetween(-w / 2, 8, -w / 2 - 12, 0);
  }
  // Placed by its tail's tip.
  const cx = tail === 'down' ? x : x + w / 2 + 12, cy = tail === 'down' ? y - h / 2 - 12 : y;
  const c = scene.add.container(cx, cy, [g, label]).setScale(0.3).setAlpha(0);
  scene.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 180, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: c, alpha: 0, delay: TAUNT_SHOW * 1000, duration: 300, onComplete: () => c.destroy() });
  if (id === 'honk') audio.play('honk', 0.8);
  else audio.play('pop', 0.35);
  return c;
}
