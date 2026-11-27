import type { DifficultyDef } from '../data/difficulty';
import { TUNING } from '../data/items';
import { hasEffect } from '../effects/effects';
import { speedOf } from '../physics/BoatPhysics';
import { angleDiff, clamp, type Rng } from '../physics/math';
import type { RaceSimulation } from '../race/RaceSimulation';
import type { Controller, ControlIntent, Racer } from '../race/types';

/**
 * Drives a boat by producing the same ControlIntent as the player's pointer:
 * pure pursuit along a racing line, avoidance, stuck recovery and item use.
 */
export class AIController implements Controller {
  private startAt: number;
  private heldItem: string | null = null;
  private itemWait = 0;
  private heldFor = 0;
  private reverseT = 0;
  private dodge = new Map<number, boolean>();
  private noisePhase: number;

  constructor(
    private rng: Rng,
    private diff: DifficultyDef,
    /** Personal lateral offset from the racing line, as a fraction of the half width. */
    private personal: number,
    private autopilot = false,
  ) {
    this.startAt = rng.chance(diff.startBoostChance) ? rng.range(-0.15, 0.15) : rng.chance(0.5) ? rng.range(-1.2, -0.4) : rng.range(0.3, 0.8);
    this.noisePhase = rng.range(0, 100);
  }

  update(r: Racer, sim: RaceSimulation, dt: number): ControlIntent {
    const track = sim.track;
    const L = track.length;
    const intent: ControlIntent = { desiredHeading: null, throttle: 0, fire: 'none' };
    if (r.sinkTimer > 0) return intent;
    const speed = speedOf(r);

    this.updatePace(r, sim);
    if (!this.autopilot && sim.clock < this.startAt) return { ...intent, desiredHeading: r.heading };

    // --- Steering target on the racing line -------------------------------
    const along = ((r.progress % L) + L) % L;
    const lookAhead = 120 + 0.8 * speed;
    const ti = Math.round(((along + lookAhead) % L) / track.spacing);
    const noise = Math.sin(sim.time * 0.7 + this.noisePhase) * this.diff.lineNoise;
    const hw = track.halfWidth(ti);
    let lateralPx = clamp(track.racingOffset[track.wrap(ti)] + this.personal + noise * 0.4, -0.75, 0.75) * hw;

    const hx = Math.cos(r.heading);
    const hy = Math.sin(r.heading);
    // Avoid boats ahead.
    for (const o of sim.racers) {
      if (o === r || o.sinkTimer > 0) continue;
      const dx = o.x - r.x;
      const dy = o.y - r.y;
      const f = dx * hx + dy * hy;
      const p = -dx * hy + dy * hx;
      const gap = r.stats.radius + o.stats.radius + 24;
      if (f > 0 && f < 240 && Math.abs(p) < gap) {
        const side = p >= 0 ? -1 : 1;
        lateralPx += side * (gap - Math.abs(p) + 20);
      }
    }
    // Avoid glue unless boosted.
    if (!hasEffect(r, 'boost') && !r.boat.specials?.washesGlue) {
      for (const g of sim.items.puddles) {
        const dx = g.x - r.x;
        const dy = g.y - r.y;
        const f = dx * hx + dy * hy;
        const p = -dx * hy + dy * hx;
        const gap = TUNING.glue.radius + r.stats.radius;
        if (f > 0 && f < 280 && Math.abs(p) < gap) lateralPx += (p >= 0 ? -1 : 1) * (gap - Math.abs(p) + 10);
      }
    }
    // Dodge incoming drill bits (sometimes).
    for (const d of sim.items.drills) {
      if (d.owner === r.id) continue;
      const dx = r.x - d.x;
      const dy = r.y - d.y;
      const f = dx * Math.cos(d.heading) + dy * Math.sin(d.heading);
      const p = -dx * Math.sin(d.heading) + dy * Math.cos(d.heading);
      if (f > 0 && f < 500 && Math.abs(p) < r.stats.radius + 25) {
        if (!this.dodge.has(d.id)) this.dodge.set(d.id, this.rng.chance(this.diff.drillDodge));
        if (this.dodge.get(d.id)) lateralPx += (p >= 0 ? 1 : -1) * (r.stats.radius + 40);
      }
    }
    const maxLat = Math.max(20, hw - r.stats.radius - 8);
    lateralPx = clamp(lateralPx, -maxLat, maxLat);
    const target = track.pointAt(along + lookAhead, lateralPx);
    const desired = Math.atan2(target.y - r.y, target.x - r.x);
    intent.desiredHeading = desired;

    // --- Throttle: lift off for sharp corners ------------------------------
    let kmax = 0;
    const steps = Math.ceil((lookAhead * 1.6) / track.spacing);
    const i0 = r.nearestIndex;
    for (let k = 0; k < steps; k++) kmax = Math.max(kmax, Math.abs(track.samples[track.wrap(i0 + k)].curvature));
    const vmax = (r.stats.turnRate * 0.9) / Math.max(kmax, 1e-4);
    intent.throttle = speed > vmax * 1.05 ? clamp(vmax / speed, 0.4, 1) : 1;
    if (Math.abs(angleDiff(desired, r.heading)) > 1.2) intent.throttle = Math.min(intent.throttle, 0.5);

    // --- Stuck recovery ---------------------------------------------------
    if (sim.phase === 'racing' && sim.time > 1.5 && speed < 25 && !hasEffect(r, 'spinOut')) r.stuckTimer += dt;
    else r.stuckTimer = Math.max(0, r.stuckTimer - dt);
    if (this.reverseT > 0) {
      this.reverseT -= dt;
      const c = track.pointAt(along, 0);
      intent.desiredHeading = Math.atan2(c.y - r.y, c.x - r.x);
      intent.throttle = -0.8;
    } else if (r.stuckTimer > 1.5) {
      this.reverseT = 0.8;
      if (r.stuckTimer > 4) sim.respawn(r);
    }

    // --- Items ------------------------------------------------------------
    if (!this.autopilot) intent.fire = this.decideFire(r, sim, dt, speed);
    return intent;
  }

  private updatePace(r: Racer, sim: RaceSimulation): void {
    if (this.autopilot) {
      r.pace = 1;
      return;
    }
    let pace = this.diff.speedMult;
    const player = sim.player;
    const L = sim.track.length;
    if (player && r !== player && r.progress < (sim.track.laps - 0.5) * L) {
      const f = clamp((r.progress - player.progress) / 600, -1, 1);
      pace *= 1 - this.diff.rubberBand * f;
    }
    r.pace = pace;
  }

  private decideFire(r: Racer, sim: RaceSimulation, dt: number, speed: number): 'none' | 'forward' | 'backward' {
    if (!r.item || r.rouletteItem) {
      this.heldItem = null;
      return 'none';
    }
    if (this.heldItem !== r.item) {
      this.heldItem = r.item;
      this.itemWait = this.rng.range(this.diff.reaction[0], this.diff.reaction[1]);
      this.heldFor = 0;
    }
    this.heldFor += dt;
    this.itemWait -= dt;
    if (this.itemWait > 0) return 'none';

    const hx = Math.cos(r.heading);
    const hy = Math.sin(r.heading);
    const rel = (o: Racer): { f: number; p: number; d: number } => {
      const dx = o.x - r.x;
      const dy = o.y - r.y;
      return { f: dx * hx + dy * hy, p: -dx * hy + dy * hx, d: Math.hypot(dx, dy) };
    };
    const others = sim.racers.filter((o) => o !== r && o.sinkTimer <= 0);
    const L = sim.track.length;

    switch (r.item) {
      case 'volunteer':
      case 'volunteerSquad': {
        const ahead = sim.racers.find((o) => o.position === r.position - 1);
        if (ahead && ahead.progress - r.progress < 900) return 'forward';
        const close = others.find((o) => {
          const q = rel(o);
          return q.f < 0 && q.d < 260 && Math.abs(q.p) < 60;
        });
        if (close && r.position === 0) return 'backward';
        break;
      }
      case 'jigsaw':
        if (others.some((o) => {
          const q = rel(o);
          return q.f > 0 && q.f < r.boat.size.length * 1.2 + o.stats.radius && Math.abs(q.p) < q.f * 0.5 + o.stats.radius * 0.6;
        })) return 'forward';
        break;
      case 'whitePowder':
      case 'bigBag': {
        let kmax = 0;
        for (let k = 0; k < 25; k++) kmax = Math.max(kmax, Math.abs(sim.track.samples[sim.track.wrap(r.nearestIndex + k)].curvature));
        if ((kmax < 0.0012 && speed > 120) || (r.sinceHit < 2.5 && r.sinkTimer <= 0)) return 'forward';
        break;
      }
      case 'drill': {
        if (others.some((o) => {
          const q = rel(o);
          return q.f > 0 && q.f < 800 && Math.abs(q.p) < o.stats.radius + 8;
        })) return 'forward';
        if (others.some((o) => {
          const q = rel(o);
          return q.f < 0 && q.f > -600 && Math.abs(q.p) < o.stats.radius + 8;
        })) return 'backward';
        break;
      }
      case 'glue':
        if (r.position <= 1 && others.some((o) => {
          const gap = r.progress - o.progress;
          return gap > 40 && gap < 400 && gap < L / 2;
        })) return 'forward';
        break;
    }
    return this.heldFor > 25 ? 'forward' : 'none';
  }
}
