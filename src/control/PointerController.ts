import Phaser from 'phaser';
import { clamp, Rng } from '../physics/math';
import { speedOf } from '../physics/BoatPhysics';
import type { Controller, ControlIntent, FireCommand, Racer } from '../race/types';
import type { RaceSimulation } from '../race/RaceSimulation';
import { DIFFICULTIES } from '../data/difficulty';
import { options } from '../options';
import { AIController } from './AIController';

export const STEER = { deadZone: 40, fullThrottle: 180 };

/** Screen-space rectangles/circles where a press belongs to the HUD, never to steering. */
export interface HudZone {
  x: number;
  y: number;
  r: number;
}

/**
 * Turns a mouse or finger into a ControlIntent: the boat drives towards the pointer,
 * the further away the pointer, the more throttle (docs/controls.md).
 */
export class PointerController implements Controller {
  private steerId: number | null = null;
  private pendingFire: FireCommand | null = null;
  hudZones: HudZone[] = [];
  /** Auto-fire option: the AI's own judgement of when an item is worth firing. */
  private advisor = new AIController(new Rng(97), DIFFICULTIES.river, 0);

  constructor(
    private scene: Phaser.Scene,
    /** Where the player's boat currently is on screen (game pixels). */
    private boatScreen: () => { x: number; y: number },
  ) {
    const input = scene.input;
    input.addPointer(2);
    input.mouse?.disableContextMenu();
    input.on('pointerdown', this.onDown, this);
    input.on('pointerup', this.onUp, this);
    input.on('pointerupoutside', this.onUp, this);
    // From the on-screen item buttons.
    scene.events.on('fire', (slot: 0 | 1, dir: 'forward' | 'backward') => (this.pendingFire = { slot, dir }));
    // Desktop shortcuts: Space fires the first item, E the second; hold Shift to fire backwards.
    const kb = input.keyboard;
    if (kb) {
      kb.on('keydown-SPACE', (e: KeyboardEvent) => (this.pendingFire = { slot: 0, dir: e.shiftKey ? 'backward' : 'forward' }));
      kb.on('keydown-E', (e: KeyboardEvent) => (this.pendingFire = { slot: 1, dir: e.shiftKey ? 'backward' : 'forward' }));
    }
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      input.off('pointerdown', this.onDown, this);
      input.off('pointerup', this.onUp, this);
      input.off('pointerupoutside', this.onUp, this);
    });
  }

  private inHud(p: Phaser.Input.Pointer): boolean {
    return this.hudZones.some((z) => (p.x - z.x) ** 2 + (p.y - z.y) ** 2 < z.r * z.r);
  }

  private onDown(p: Phaser.Input.Pointer): void {
    // Right click fires the first item, middle click the second: anywhere, even over a HUD button.
    // (`p.button` is the button that changed. Not rightButtonDown(): that stays true while the
    // right button is held, which would also swallow a later left press.)
    if (!p.wasTouch && (p.button === 2 || p.button === 1)) {
      this.pendingFire = { slot: p.button === 2 ? 0 : 1, dir: 'forward' };
      return;
    }
    if (this.inHud(p)) return;
    if (this.steerId === null) {
      if (p.wasTouch || p.leftButtonDown()) this.steerId = p.id;
    } else if (p.id !== this.steerId && p.wasTouch) {
      this.pendingFire = { slot: 0, dir: 'forward' }; // second finger tap: first item
    }
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (p.id !== this.steerId) return;
    // Releasing the right (fire) button must not end a left-button hold.
    if (!p.wasTouch && p.leftButtonDown()) return;
    this.steerId = null;
  }

  update(r: Racer, sim: RaceSimulation, dt: number): ControlIntent {
    const advice = options.autoFire ? this.advisor.decideFire(r, sim, dt, speedOf(r)) : null;
    const intent: ControlIntent = { desiredHeading: null, throttle: 0, fire: this.pendingFire ?? advice };
    this.pendingFire = null;
    if (this.steerId === null) return intent;
    const p = this.scene.input.manager.pointers.find((q) => q.id === this.steerId);
    if (!p || !p.isDown) {
      this.steerId = null;
      return intent;
    }
    const b = this.boatScreen();
    const dx = p.x - b.x;
    const dy = p.y - b.y;
    const d = Math.hypot(dx, dy);
    if (d < STEER.deadZone) return intent;
    const heading = Math.atan2(dy, dx);
    let throttle = clamp((d - STEER.deadZone) / (STEER.fullThrottle - STEER.deadZone), 0, 1);
    // Pointing behind a nearly stopped boat reverses.
    const behind = Math.abs(Phaser.Math.Angle.Wrap(heading - r.heading)) > (120 * Math.PI) / 180;
    if (behind && speedOf(r) < 0.2 * r.stats.topSpeed) throttle = -0.5;
    intent.desiredHeading = heading;
    intent.throttle = throttle;
    return intent;
  }

  get steering(): boolean {
    return this.steerId !== null;
  }
}
