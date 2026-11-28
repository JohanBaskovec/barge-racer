import type { DifficultyDef } from '../data/difficulty';
import { TUNING } from '../data/items';
import { hasEffect } from '../effects/effects';
import { speedOf } from '../physics/BoatPhysics';
import { angleDiff, clamp, type Rng } from '../physics/math';
import type { RaceSimulation } from '../race/RaceSimulation';
import type { ItemId } from '../data/items';
import type { Controller, ControlIntent, FireCommand, Racer } from '../race/types';

/**
 * Drives a boat by producing the same ControlIntent as the player's pointer:
 * pure pursuit along a racing line, avoidance, stuck recovery and item use.
 */
export class AIController implements Controller {
  private startAt: number;
  /** Per item slot: what is held, how long until the AI may use it, and for how long it has been held. */
  private heldItem: (string | null)[] = [null, null];
  private itemWait = [0, 0];
  private heldFor = [0, 0];
  private reverseT = 0;
  private dodge = new Map<number, boolean>();
  private noisePhase: number;

  constructor(
    private rng: Rng,
    private diff: DifficultyDef,
    /** Personal lateral offset from the racing line, as a fraction of the half width. */
    private personal: number,
    private autopilot = false,
    /** Steering a boat towed by a tugboat: full speed along the line, on any track. */
    private tow = false,
  ) {
    this.startAt = rng.chance(diff.startBoostChance) ? rng.range(-0.15, 0.15) : rng.chance(0.5) ? rng.range(-1.2, -0.4) : rng.range(0.3, 0.8);
    this.noisePhase = rng.range(0, 100);
  }

  update(r: Racer, sim: RaceSimulation, dt: number): ControlIntent {
    const track = sim.track;
    const intent: ControlIntent = { desiredHeading: null, throttle: 0, fire: null };
    if (r.sinkTimer > 0) return intent;
    const speed = speedOf(r);

    // After the finish of a point-to-point race there is little water left: just coast to a stop.
    if (this.autopilot && !this.tow && !track.closed) {
      const s = track.samples[r.nearestIndex];
      return { desiredHeading: Math.atan2(s.ty, s.tx), throttle: 0, fire: null };
    }

    this.updatePace(r, sim);
    if (!this.autopilot && sim.clock < this.startAt) return { ...intent, desiredHeading: r.heading };

    // --- Steering target on the racing line -------------------------------
    const along = track.alongOf(r.progress);
    const lookAhead = 120 + 0.8 * speed;
    const ti = track.wrap(Math.round((along + lookAhead) / track.spacing));
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
    // Barges: pass on the free side (they keep to theirs), looking further ahead for oncoming ones.
    // Measured along the canal, so a barge round a bend is seen in time.
    for (const b of sim.trafficPoses) {
      if (!b.solid) continue;
      let ahead = b.along - along;
      if (track.closed) ahead = ((ahead % track.length) + track.length * 1.5) % track.length - track.length / 2;
      const closing = speed - (b.vx * hx + b.vy * hy);
      const look = 260 + Math.max(0, closing) * 1.3 + TUNING.traffic.length / 2;
      if (ahead > -TUNING.traffic.length / 2 - r.boat.size.length * 0.6 && ahead < look) {
        const want = -Math.sign(b.lat || 1) * hw * 0.5;
        if (Math.sign(want) !== Math.sign(lateralPx) || Math.abs(lateralPx) < Math.abs(want)) lateralPx = want;
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
    // Steer round clouds on the water: toxic smoke hurts, melted cheese blinds.
    for (const c of sim.items.clouds) {
      if (c.owner === r.id && c.age < 2) continue;
      const dx = c.x - r.x;
      const dy = c.y - r.y;
      const f = dx * hx + dy * hy;
      const p = -dx * hy + dy * hx;
      const gap = (c.kind === 0 ? TUNING.raclette.cheeseRadius : TUNING.toilet.radius) + r.stats.radius;
      if (f > 0 && f < 300 && Math.abs(p) < gap) lateralPx += (p >= 0 ? -1 : 1) * (gap - Math.abs(p) + 10);
    }
    // Steer around fake crates (they look like real ones; better AIs spot them more often).
    for (const f of sim.items.fakeCrates) {
      if (f.owner === r.id) continue;
      const dx = f.x - r.x;
      const dy = f.y - r.y;
      const fwd = dx * hx + dy * hy;
      const side = -dx * hy + dy * hx;
      const gap = TUNING.fakeCrate.radius + r.stats.radius + 25;
      if (fwd > 0 && fwd < 320 && Math.abs(side) < gap) {
        if (!this.dodge.has(f.id)) this.dodge.set(f.id, this.rng.chance(Math.min(0.95, this.diff.drillDodge + 0.25)));
        if (this.dodge.get(f.id)) lateralPx += (side >= 0 ? -1 : 1) * (gap - Math.abs(side) + 15);
      }
    }
    // Steer round giant breasts (they are solid, and they hurt): the better the AI, the surer.
    for (const b of sim.items.boobs) {
      if (b.owner === r.id) continue;
      const dx = b.x - r.x;
      const dy = b.y - r.y;
      const fwd = dx * hx + dy * hy;
      const side = -dx * hy + dy * hx;
      const gap = TUNING.titten.radius * 2 + r.stats.capRadius + 20;
      if (fwd > -20 && fwd < 380 && Math.abs(side) < gap) {
        if (!this.dodge.has(b.id)) this.dodge.set(b.id, this.rng.chance(Math.min(0.95, this.diff.drillDodge + 0.35)));
        if (this.dodge.get(b.id)) lateralPx += (side >= 0 ? -1 : 1) * (gap - Math.abs(side) + 15);
      }
    }
    // Dodge incoming drill bits and raclette shots (sometimes).
    for (const d of [...sim.items.drills, ...sim.items.shots.filter((x) => x.wait <= 0)]) {
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
    let desired = Math.atan2(target.y - r.y, target.x - r.x);
    // Covered in cheese the AI can't see where it is going: it wanders.
    const blind = hasEffect(r, 'cheesed');
    if (blind) desired += Math.sin(sim.time * 3.1 + this.noisePhase) * 0.45;
    intent.desiredHeading = desired;

    // --- Throttle: lift off for sharp corners ------------------------------
    let kmax = 0;
    const steps = Math.ceil((lookAhead * 1.6) / track.spacing);
    const i0 = r.nearestIndex;
    for (let k = 0; k < steps; k++) kmax = Math.max(kmax, Math.abs(track.samples[track.wrap(i0 + k)].curvature));
    const vmax = (r.stats.turnRate * 0.9) / Math.max(kmax, 1e-4);
    intent.throttle = speed > vmax * 1.05 ? clamp(vmax / speed, 0.4, 1) : 1;
    if (blind) intent.throttle = Math.min(intent.throttle, 0.75);
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
    if (player && r !== player && r.progress < sim.track.raceDistance - 0.5 * sim.track.lapLength) {
      const f = clamp((r.progress - player.progress) / 600, -1, 1);
      pace *= 1 - this.diff.rubberBand * f;
    }
    r.pace = pace;
  }

  /** Checks both slots in turn and returns the first item the AI wants to fire now. */
  decideFire(r: Racer, sim: RaceSimulation, dt: number, speed: number): FireCommand | null {
    for (const slot of [0, 1] as const) {
      const held = r.slots[slot];
      if (!held || r.rouletteItem) {
        this.heldItem[slot] = null;
        continue;
      }
      if (this.heldItem[slot] !== held.id) {
        this.heldItem[slot] = held.id;
        this.itemWait[slot] = this.rng.range(this.diff.reaction[0], this.diff.reaction[1]);
        this.heldFor[slot] = 0;
      }
      this.heldFor[slot] += dt;
      this.itemWait[slot] -= dt;
      if (this.itemWait[slot] > 0) continue;
      const dir = this.wantsToFire(held.id, r, sim, speed, this.heldFor[slot]);
      if (dir !== 'none') return { slot, dir };
    }
    return null;
  }

  private wantsToFire(item: ItemId, r: Racer, sim: RaceSimulation, speed: number, heldFor: number): 'none' | 'forward' | 'backward' {
    const hx = Math.cos(r.heading);
    const hy = Math.sin(r.heading);
    const rel = (o: Racer): { f: number; p: number; d: number } => {
      const dx = o.x - r.x;
      const dy = o.y - r.y;
      return { f: dx * hx + dy * hy, p: -dx * hy + dy * hx, d: Math.hypot(dx, dy) };
    };
    const others = sim.racers.filter((o) => o !== r && o.sinkTimer <= 0 && !sim.isGhost(o));
    const L = sim.track.lapLength;
    /** A boat straight ahead (or behind) within `range`, narrow enough for a straight shot to hit. */
    const inLine = (range: number, behind: boolean): boolean =>
      others.some((o) => {
        const q = rel(o);
        return (behind ? q.f < 0 && q.f > -range : q.f > 0 && q.f < range) && Math.abs(q.p) < o.stats.radius + 8;
      });

    switch (item) {
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
        // The saws stick out sideways: someone alongside, close.
        if (others.some((o) => {
          const q = rel(o);
          return Math.abs(q.f) < r.boat.size.length * 0.45 && Math.abs(q.p) < r.stats.capRadius + TUNING.jigsaw.reach + o.stats.capRadius;
        })) return 'forward';
        break;
      case 'dildo':
        // On the bow: someone just ahead, to ram.
        if (others.some((o) => {
          const q = rel(o);
          return q.f > 0 && q.f < r.boat.size.length * 1.6 + o.stats.radius && Math.abs(q.p) < q.f * 0.5 + o.stats.radius * 0.6;
        })) return 'forward';
        break;
      case 'nailGun':
        if (inLine(700, false)) return 'forward';
        if (inLine(450, true)) return 'backward';
        break;
      case 'titten':
      case 'siphon':
        // They hit every opponent: best from behind, with someone worth passing not too far ahead.
        if (r.position > 0 && others.some((o) => o.progress > r.progress && o.progress - r.progress < 1800)) return 'forward';
        break;
      case 'tugboat':
        // A tow: whenever there is ground to make up, or straight away when not leading.
        if (r.position > 0 || r.sinceHit < 2) return 'forward';
        break;
      case 'whitePowder':
      case 'bigBag': {
        let kmax = 0;
        for (let k = 0; k < 25; k++) kmax = Math.max(kmax, Math.abs(sim.track.samples[sim.track.wrap(r.nearestIndex + k)].curvature));
        if ((kmax < 0.0012 && speed > 120) || (r.sinceHit < 2.5 && r.sinkTimer <= 0)) return 'forward';
        break;
      }
      case 'drill':
        if (inLine(800, false)) return 'forward';
        if (inLine(600, true)) return 'backward';
        break;
      case 'siliconeGun':
        if (inLine(700, false)) return 'forward';
        if (inLine(500, true)) return 'backward';
        break;
      case 'glue':
      case 'fakeCrate':
        // Traps are dropped behind: worth it when someone is chasing closely.
        if (others.some((o) => {
          const gap = r.progress - o.progress;
          return gap > 40 && gap < (item === 'glue' ? 400 : 500) && gap < L / 2;
        })) return 'forward';
        break;
      case 'mushroom': {
        // Worth it when more boats are ahead (they shrink) than behind (they speed up).
        const ahead = sim.racers.filter((o) => o !== r && !o.finished && o.progress > r.progress).length;
        const behind = sim.racers.filter((o) => o !== r && !o.finished && o.progress <= r.progress).length;
        if (ahead > behind) return 'forward';
        break;
      }
      case 'beer':
        if (r.hull < r.stats.maxHull * 0.55) return 'forward';
        break;
      case 'blackout':
        // Best from behind, with someone worth passing in reach.
        if (r.position > 0 && others.some((o) => o.progress > r.progress && o.progress - r.progress < 1500)) return 'forward';
        if (others.some((o) => o.progress < r.progress && r.progress - o.progress < 250)) return 'forward';
        break;
      case 'raclette':
        if (others.some((o) => {
          const q = rel(o);
          return q.f > 0 && q.f < 900 && Math.abs(q.p) < 90 + o.stats.radius;
        })) return 'forward';
        break;
      case 'toilet':
        // A trap dropped behind, when someone is close behind.
        if (others.some((o) => {
          const gap = r.progress - o.progress;
          return gap > 40 && gap < 450 && gap < L / 2;
        })) return 'forward';
        break;
      case 'karcher':
        // Someone alongside, close enough for the jet to push them.
        if (others.some((o) => {
          const q = rel(o);
          return Math.abs(q.f) < r.boat.size.length / 2 + 120 && Math.abs(q.p) > 20 && Math.abs(q.p) < 220;
        })) return 'forward';
        break;
    }
    return heldFor > 25 ? 'forward' : 'none';
  }
}
