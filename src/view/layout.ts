import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';

/**
 * The game is always 720 px tall and as wide as the screen's shape: 1280 on a 16:9 screen, about
 * 1600 on a 20:9 phone, so it fills the screen without stretching (and with no bands at the sides,
 * where a finger would leave the game). Menus are laid out for 1280 px and centred; the race view
 * simply shows more, and the HUD keeps to the real screen edges.
 */

/** Narrowest and widest the game gets (16:9 to a little wider than 21:9). */
export const MIN_WIDTH = GAME_WIDTH;
export const MAX_WIDTH = 1760;

/** The game width for a screen (or window) of this shape. */
export function widthFor(screenW: number, screenH: number): number {
  if (!(screenW > 0 && screenH > 0)) return MIN_WIDTH;
  return Math.round(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, (GAME_HEIGHT * screenW) / screenH)));
}

/** The game's current width. */
export const viewWidth = (scene: Phaser.Scene): number => scene.scale.gameSize.width;

/** How much wider than 1280 the game is on each side. */
export const sideRoom = (scene: Phaser.Scene): number => (viewWidth(scene) - MIN_WIDTH) / 2;

/**
 * For a screen laid out for 1280 px: centre it by scrolling the camera, so (0, 0)..(1280, 720)
 * sits in the middle. Returns the room on each side (things meant for a corner add or subtract it).
 */
export function centreLayout(scene: Phaser.Scene): number {
  const ox = sideRoom(scene);
  scene.cameras.main.setScroll(-ox, 0);
  return ox;
}

/** A rectangle covering the whole screen of a centred scene (for shades behind an overlay). */
export function fullScreenRect(scene: Phaser.Scene, color: number, alpha: number): Phaser.GameObjects.Rectangle {
  return scene.add.rectangle(MIN_WIDTH / 2, GAME_HEIGHT / 2, viewWidth(scene) + 4, GAME_HEIGHT, color, alpha);
}
