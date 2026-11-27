import Phaser from 'phaser';
import type { BoatDef } from '../data/boats';

/**
 * A boat as seen from above, at its game size. Most boats are near-white and take the racer's colour
 * as a tint; boats with `accent` keep their own colours and only tint a small accent layer.
 */
export function createBoatSprite(scene: Phaser.Scene, def: BoatDef, color: number): Phaser.GameObjects.Container {
  const { length: L, width: W } = def.size;
  const hull = scene.add.image(0, 0, `boat_${def.id}`).setDisplaySize(L, W);
  const parts: Phaser.GameObjects.Image[] = [hull];
  if (def.accent) parts.push(scene.add.image(0, 0, `boat_${def.id}_accent`).setDisplaySize(L, W).setTint(color));
  else hull.setTint(color);
  return scene.add.container(0, 0, parts);
}
