import type { Controller, ControlIntent } from '../race/types';
import type { InputTuple } from './protocol';

/**
 * On the server: a person's boat, driven by the controls their screen sends. One input is used
 * per simulation step, in order; `ack` is the last one used, sent back so the screen can replay
 * the inputs the server hasn't seen yet (prediction). When nothing has arrived the last controls
 * are kept (without repeating a fire). A queue that grows too long (a lag spike) is trimmed so the
 * delay doesn't build up.
 */
export class RemoteController implements Controller {
  private queue: { step: number; intent: ControlIntent }[] = [];
  private last: ControlIntent = { desiredHeading: null, throttle: 0, fire: null };
  private lastQueued = -1;
  ack = -1;
  /** Steps in a row with no controls to use (the connection stalled, or the game is in the background). */
  starved = 0;

  get hasInput(): boolean {
    return this.queue.length > 0;
  }

  push(inputs: InputTuple[]): void {
    for (const [step, heading, throttle, slot, back] of inputs) {
      if (!Number.isFinite(step) || step <= this.lastQueued) continue;
      this.lastQueued = step;
      const h = heading === null || !Number.isFinite(heading) ? null : heading;
      const th = Number.isFinite(throttle) ? Math.max(-1, Math.min(1, throttle)) : 0;
      const fire = slot === 0 || slot === 1 ? { slot: slot as 0 | 1, dir: back ? ('backward' as const) : ('forward' as const) } : null;
      this.queue.push({ step, intent: { desiredHeading: h, throttle: th, fire } });
    }
    if (this.queue.length > 8) this.queue.splice(0, this.queue.length - 3);
  }

  update(): ControlIntent {
    const next = this.queue.shift();
    if (!next) {
      this.starved++;
      return { ...this.last, fire: null };
    }
    this.starved = 0;
    this.ack = next.step;
    this.last = next.intent;
    return next.intent;
  }
}
