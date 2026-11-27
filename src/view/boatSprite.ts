import Phaser from 'phaser';
import type { BoatDef } from '../data/boats';
import { BOAT_ART_PAD, hasBoatArt } from './boatArt';

/**
 * A boat as seen from above, at its game size, in the racer's colour.
 * - Most boats (boatArt.ts) are two layers: the paint, tinted with the racer's colour (the hull, a
 *   roof or a canopy), under the details in their own colours.
 * - Cabourg keeps its own colours; only a small accent layer on top (gunwale stripes, the stern
 *   flag) takes the racer's colour.
 */
export function createBoatSprite(scene: Phaser.Scene, def: BoatDef, color: number): Phaser.GameObjects.Container {
  const { length: L, width: W } = def.size;
  if (hasBoatArt(def)) {
    // These textures have a small margin round the hull.
    const w = L + BOAT_ART_PAD * 2, h = W + BOAT_ART_PAD * 2;
    const paint = scene.add.image(0, 0, `boat_${def.id}_paint`).setDisplaySize(w, h).setTint(color);
    const detail = scene.add.image(0, 0, `boat_${def.id}`).setDisplaySize(w, h);
    return scene.add.container(0, 0, [paint, detail]);
  }
  const hull = scene.add.image(0, 0, `boat_${def.id}`).setDisplaySize(L, W);
  const accent = scene.add.image(0, 0, `boat_${def.id}_accent`).setDisplaySize(L, W).setTint(color);
  return scene.add.container(0, 0, [hull, accent]);
}
