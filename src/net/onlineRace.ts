import { tickEffects } from '../effects/effects';
import { stepBoat } from '../physics/BoatPhysics';
import { resolveBank, resolveStatic } from '../physics/collisions';
import { bargeCapsule } from '../race/traffic';
import { angleDiff } from '../physics/math';
import { STEP } from '../race/RaceSimulation';
import type { RaceSimulation } from '../race/RaceSimulation';
import type { ControlIntent, RaceEvent, Racer } from '../race/types';
import { net } from './client';
import type { InputTuple, ServerMsg } from './protocol';
import { applyRacer, applyState, type SimState } from './snapshot';

type Snap = Extract<ServerMsg, { t: 'snap' }>;

/** How far in the past other boats are shown, in simulation steps (100 ms): smooth despite jitter. */
const INTERP_STEPS = 6;
const STEP_MS = STEP * 1000;
/** A correction bigger than this (px) is a jump (a respawn), not an error to smooth out. */
const SNAP_PX = 250;

/**
 * The client side of an online race, for the race scene.
 * - Your boat is predicted: each step your controls move it at once, and are sent to the server.
 *   When a snapshot arrives your boat is reset to the server's version and the controls the server
 *   hasn't used yet are replayed. A disagreement (a bump, a hit) moves the boat; the difference is
 *   reported through `onCorrection` so the view can blend it out over a moment instead of jumping.
 * - Everyone else is shown INTERP_STEPS in the past, blended between the two snapshots around that
 *   moment, so they move smoothly at 20 updates a second.
 * - Race events (sounds, pop-ups) come in the snapshots and are handed to the scene.
 * - Watching (no boat of your own: `me` is null), every boat is interpolated.
 */
export class OnlineRace {
  private snaps: { s: number; state: SimState }[] = [];
  private history: { step: number; intent: ControlIntent }[] = [];
  private pending: InputTuple[] = [];
  private step = 0;
  private offset = Infinity; // local time (ms) minus server time (ms), from the fastest snapshot
  private events: RaceEvent[] = [];
  results: Extract<ServerMsg, { t: 'results' }> | null = null;
  /**
   * The server's step count as of the step your boat is predicted at (ahead of the last snapshot
   * by the controls it hasn't used yet). Barges are placed at this clock, both for your boat's
   * collisions and on screen, so you see them exactly where you bump into them.
   */
  private clock = 0;
  /** Called after a snapshot moved your boat away from where it was predicted (dx, dy, dheading). */
  onCorrection: ((dx: number, dy: number, dh: number) => void) | null = null;

  constructor(private sim: RaceSimulation, private me: Racer | null) {}

  /**
   * Reconnected: the server has a fresh copy of your controls, so forget the ones it never
   * acknowledged (they'll never be), and start counting again from what it says.
   */
  resume(): void {
    this.history = [];
    this.pending = [];
  }

  /** A snapshot from the server. */
  onSnap(m: Snap, now: number): void {
    this.offset = Math.min(this.offset, now - m.s * STEP_MS);
    this.snaps.push({ s: m.s, state: m.state });
    if (this.snaps.length > 12) this.snaps.shift();
    this.events.push(...m.ev);
    this.reconcile(m);
  }

  takeEvents(): RaceEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** Your boat follows the server, plus the inputs it hasn't processed yet. */
  private reconcile(m: Snap): void {
    const me = this.me;
    const mine = me && m.state.racers[me.id];
    if (!me || !mine) return;
    const before = { x: me.x, y: me.y, h: me.heading };
    applyRacer(me, mine);
    this.history = this.history.filter((h) => h.step > m.ack);
    this.clock = m.state.k;
    if (!me.finished && me.sinkTimer <= 0) {
      const canDrive = m.state.phase === 'racing';
      for (const h of this.history) this.predict(me, h.intent, canDrive);
    } else this.clock += this.history.length;
    const dx = before.x - me.x;
    const dy = before.y - me.y;
    if (dx * dx + dy * dy < SNAP_PX * SNAP_PX) this.onCorrection?.(dx, dy, angleDiff(before.h, me.heading));
  }

  private predict(me: Racer, intent: ControlIntent, canDrive: boolean): void {
    this.clock++;
    tickEffects(me, STEP);
    stepBoat(me, intent, STEP, canDrive);
    resolveBank(me, this.sim.track);
    for (const p of this.sim.traffic.poses(this.clock * STEP)) if (p.solid) resolveStatic(me, bargeCapsule(p), p.vx, p.vy, { x: p.mx, y: p.my });
  }

  /** Seconds on the traffic's clock to draw the barges at (see `clock`). */
  get trafficTime(): number {
    return this.clock * STEP;
  }

  /** One local simulation step with your controls: move your boat now, send the controls soon. */
  local(intent: ControlIntent): void {
    const me = this.me;
    if (!me) return;
    this.step++;
    const fire = intent.fire;
    this.pending.push([this.step, intent.desiredHeading === null ? null : Math.round(intent.desiredHeading * 1000) / 1000, Math.round(intent.throttle * 100) / 100, fire ? fire.slot : -1, fire?.dir === 'backward' ? 1 : 0]);
    this.history.push({ step: this.step, intent: { ...intent, fire: null } });
    if (this.history.length > 240) this.history.shift();
    if (!me.finished && me.sinkTimer <= 0) this.predict(me, intent, this.sim.phase === 'racing');
    else this.clock++;
    if (this.pending.length >= 2 || fire) this.flush();
  }

  private flush(): void {
    if (!this.pending.length) return;
    net.send({ t: 'in', i: this.pending });
    this.pending = [];
  }

  /** Put everyone except you where they were INTERP_STEPS ago, blended between snapshots. */
  render(now: number): void {
    if (!this.snaps.length || !Number.isFinite(this.offset)) return;
    const at = (now - this.offset) / STEP_MS - INTERP_STEPS;
    if (!this.me) this.clock = at; // watching: barges on the same clock as the boats
    let i = this.snaps.length - 1;
    while (i > 0 && this.snaps[i - 1].s > at) i--;
    const b = this.snaps[i];
    const a = i > 0 ? this.snaps[i - 1] : b;
    const t = b.s === a.s ? 1 : Math.max(0, Math.min(1, (at - a.s) / (b.s - a.s)));
    // Your own boat: skip it unless the server drives it now (after the finish).
    const skip = !this.me || this.me.finished ? -1 : this.me.id;
    applyState(this.sim, b.state, skip);
    const lerp = (x: number, y: number): number => x + (y - x) * t;
    b.state.racers.forEach((rb, k) => {
      const ra = a.state.racers[k];
      if (k === skip || !ra) return;
      const r = this.sim.racers[k];
      r.x = lerp(ra.x, rb.x);
      r.y = lerp(ra.y, rb.y);
      r.heading = ra.h + angleDiff(rb.h, ra.h) * t;
    });
    // Moving items glide too.
    const blend = <T extends { id: number; x: number; y: number }>(list: T[], older: [number, number, ...unknown[]][], xi: number): void => {
      for (const e of list) {
        const o = older.find((row) => row[0] === e.id);
        if (o) {
          e.x = lerp(o[xi] as number, e.x);
          e.y = lerp(o[xi + 1] as number, e.y);
        }
      }
    };
    blend(this.sim.items.volunteers, a.state.vols, 3);
    blend(this.sim.items.drills, a.state.drills, 2);
    blend(this.sim.items.blobs, a.state.blobs, 2);
    blend(this.sim.items.shots, a.state.shots, 3);
    // Crates a mushroom is pulling glide too.
    for (const c of this.sim.items.crates) {
      const o = a.state.cpos.find((row) => row[0] === c.id);
      if (o && (c.x !== c.homeX || c.y !== c.homeY)) {
        c.x = lerp(o[1], c.x);
        c.y = lerp(o[2], c.y);
      }
    }
  }
}
