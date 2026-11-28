import { bargeCapsule } from '../race/traffic';
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
    // A battle: no racing line, a target to go to, either way round the arena.
    if (sim.battle && !this.autopilot && !this.tow) return this.battleUpdate(r, sim, dt, speed, intent);

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
    // Steer round clouds on the water: toxic smoke hurts, melted cheese and wet paint blind.
    for (const c of sim.items.clouds) {
      if (c.owner === r.id && c.age < 2) continue;
      const dx = c.x - r.x;
      const dy = c.y - r.y;
      const f = dx * hx + dy * hy;
      const p = -dx * hy + dy * hx;
      const gap = (c.kind === 0 ? TUNING.raclette.cheeseRadius : c.kind === 1 ? TUNING.toilet.radius : TUNING.paint.radius) + r.stats.radius;
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
    // Birds, rowers and swimmers: swerve round them (sometimes: running them over only slows you).
    const hz = sim.hazards;
    for (const c of hz.critters) {
      if (c.owner === r.id) continue; // its own couches are behind it
      const p = hz.critterPos(c);
      const dx = p.x - r.x;
      const dy = p.y - r.y;
      const fwd = dx * hx + dy * hy;
      const side = -dx * hy + dy * hx;
      const gap = TUNING.critters.radius[c.kind] + r.stats.capRadius + 15;
      if (fwd > 0 && fwd < 340 && Math.abs(side) < gap) {
        if (!this.dodge.has(-c.id)) this.dodge.set(-c.id, this.rng.chance(Math.min(0.9, this.diff.drillDodge + 0.2)));
        if (this.dodge.get(-c.id)) lateralPx += (side >= 0 ? -1 : 1) * (gap - Math.abs(side) + 10);
      }
    }
    // Motorized stairs coming out of a bank ahead: keep to the other side.
    for (const s of sim.items.stairs) {
      if (s.along < 0) continue;
      let ahead = s.along - along;
      if (track.closed) ahead = ((ahead % track.length) + track.length) % track.length;
      if (ahead > 0 && ahead < 600) lateralPx = -s.side * Math.max(Math.abs(lateralPx), hw * 0.55);
    }
    // An angler's line ahead, cast for this boat: keep to the far side of the canal.
    for (const a of hz.anglers) {
      if (a.target !== r.id || a.hooked) continue;
      let ahead = a.along - along;
      if (track.closed) ahead = ((ahead % track.length) + track.length * 1.5) % track.length - track.length / 2;
      if (ahead > -40 && ahead < 520) {
        if (!this.dodge.has(-1000 - a.id)) this.dodge.set(-1000 - a.id, this.rng.chance(Math.min(0.9, this.diff.drillDodge + 0.3)));
        if (this.dodge.get(-1000 - a.id)) lateralPx = -a.side * hw * 0.7;
      }
    }
    // Dodge incoming drill bits, raclette shots, nails and police bullets (sometimes).
    const incoming = [...sim.items.drills.filter((d) => d.mounted <= 0), ...sim.items.shots.filter((x) => x.wait <= 0)].filter((x) => x.owner !== r.id) as { id: number; x: number; y: number; heading: number }[];
    for (const d of [...incoming, ...sim.hazards.bullets.filter((b) => b.target === r.id)]) {
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
    // Covered in cheese, lost in steam or with paint all over, the AI can't see where it is going: it wanders.
    const blind = hasEffect(r, 'cheesed') || hasEffect(r, 'steamed') || hasEffect(r, 'stairsDown');
    const smeared = hasEffect(r, 'painted');
    if (blind) desired += Math.sin(sim.time * 3.1 + this.noisePhase) * 0.45;
    else if (smeared) desired += Math.sin(sim.time * 2.7 + this.noisePhase) * 0.25;
    intent.desiredHeading = desired;

    // --- Throttle: lift off for sharp corners ------------------------------
    let kmax = 0;
    const steps = Math.ceil((lookAhead * 1.6) / track.spacing);
    const i0 = r.nearestIndex;
    for (let k = 0; k < steps; k++) kmax = Math.max(kmax, Math.abs(track.samples[track.wrap(i0 + k)].curvature));
    const vmax = (r.stats.turnRate * 0.9) / Math.max(kmax, 1e-4);
    intent.throttle = speed > vmax * 1.05 ? clamp(vmax / speed, 0.4, 1) : 1;
    if (blind) intent.throttle = Math.min(intent.throttle, 0.75);
    else if (smeared) intent.throttle = Math.min(intent.throttle, 0.88);
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
    if (sim.battle) {
      // No rubber-banding in a battle: there is no "ahead".
      r.pace = this.diff.speedMult;
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

  /** Where the target was on the centre line last time (a hint to find it again cheaply). */
  private targetIdx = -1;

  /**
   * Battle: steer for a target. Close by (or on the same stretch), straight at it; further, along
   * the arena's loop the short way round, drifting to its side of the water. Stuck recovery and
   * items as in a race.
   */
  private battleUpdate(r: Racer, sim: RaceSimulation, dt: number, speed: number, intent: ControlIntent): ControlIntent {
    const track = sim.track;
    const target = this.battleTarget(r, sim);
    const me = track.nearest(r.x, r.y, r.nearestIndex, 40);
    const t = track.nearest(target.x, target.y, this.targetIdx, this.targetIdx < 0 ? undefined : 80);
    this.targetIdx = t.index;
    const L = track.length;
    let d = t.along - me.along;
    d = ((d % L) + L * 1.5) % L - L / 2;
    let desired: number;
    if (Math.abs(d) < 420) desired = Math.atan2(target.y - r.y, target.x - r.x);
    else {
      const ahead = me.along + Math.sign(d) * (150 + 0.8 * speed);
      const hw = track.sampleAt(ahead).width / 2;
      const p = track.pointAt(ahead, clamp(t.lateral, -hw * 0.55, hw * 0.55));
      desired = Math.atan2(p.y - r.y, p.x - r.x);
    }
    desired = this.roundBarges(r, sim, desired, Math.hypot(target.x - r.x, target.y - r.y));
    const blind = hasEffect(r, 'cheesed') || hasEffect(r, 'steamed') || hasEffect(r, 'stairsDown');
    if (blind) desired += Math.sin(sim.time * 3.1 + this.noisePhase) * 0.45;
    intent.desiredHeading = desired;
    intent.throttle = blind ? 0.75 : 1;
    if (Math.abs(angleDiff(desired, r.heading)) > 1.2) intent.throttle = Math.min(intent.throttle, 0.55);
    // Stuck against the bank: back off towards the middle of the water, then try again.
    if (sim.phase === 'racing' && sim.time > 1.5 && speed < 25 && !hasEffect(r, 'spinOut')) r.stuckTimer += dt;
    else r.stuckTimer = Math.max(0, r.stuckTimer - dt);
    if (this.reverseT > 0) {
      this.reverseT -= dt;
      const c = track.pointAt(me.along, 0);
      intent.desiredHeading = Math.atan2(c.y - r.y, c.x - r.x);
      intent.throttle = -0.8;
    } else if (r.stuckTimer > 1.5) {
      this.reverseT = 0.8;
      r.stuckTimer = 0.5;
    }
    intent.fire = this.decideFire(r, sim, dt, speed);
    return intent;
  }

  /** Which way round the last barge in the way (sticks, so the boat doesn't dither in front of it). */
  private roundSide = 0;

  /**
   * Battle: a moored barge in the way bends the course round it (on the side the boat is already
   * on), more the closer it is. Nothing beyond the target counts.
   */
  private roundBarges(r: Racer, sim: RaceSimulation, desired: number, targetDist: number): number {
    let vx = Math.cos(desired), vy = Math.sin(desired);
    const ux = vx, uy = vy;
    let any = false;
    for (const b of sim.trafficPoses) {
      if (!b.solid) continue;
      const c = bargeCapsule(b);
      const dx = c.bx - c.ax, dy = c.by - c.ay;
      const t = clamp(((r.x - c.ax) * dx + (r.y - c.ay) * dy) / (dx * dx + dy * dy), 0, 1);
      const ox = c.ax + dx * t - r.x, oy = c.ay + dy * t - r.y;
      const od = Math.hypot(ox, oy);
      const gap = od - c.radius - r.stats.radius;
      const reach = 230;
      if (gap > reach || od < 1 || od > targetDist + c.radius) continue;
      const ahead = (ox * ux + oy * uy) / od;
      if (ahead < 0.15) continue;
      // The barge is to the left of the course (cross > 0): go right of it, and the other way.
      const cross = ox * -uy + oy * ux;
      if (!any && (this.roundSide === 0 || Math.abs(cross) > od * 0.5)) this.roundSide = cross > 0 ? 1 : -1;
      any = true;
      const w = (1 - Math.max(0, gap) / reach) * 1.8 * ahead;
      vx += uy * this.roundSide * w;
      vy += -ux * this.roundSide * w;
    }
    if (!any) this.roundSide = 0;
    return any ? Math.atan2(vy, vx) : desired;
  }

  /**
   * What to go for in a battle. Capture the flag: the flag you carry goes home; a thief carrying
   * your flag is chased; your dropped flag is fetched; otherwise attackers go for the other flag and
   * defenders keep near home, going for any opponent who comes close. Deathmatch: a crate if your
   * hands are empty and one is near, else the nearest opponent (the weaker the likelier).
   */
  private battleTarget(r: Racer, sim: RaceSimulation): { x: number; y: number } {
    const b = sim.battle!;
    const team = b.teams[r.id];
    const foes = sim.racers.filter((o) => o !== r && o.sinkTimer <= 0 && (team < 0 || b.teams[o.id] !== team));
    const dist = (p: { x: number; y: number }): number => Math.hypot(p.x - r.x, p.y - r.y);
    const nearestFoe = (from: { x: number; y: number }, within = Infinity): Racer | null => {
      let best: Racer | null = null, bd = within;
      for (const o of foes) {
        const d = Math.hypot(o.x - from.x, o.y - from.y) - (o.stats.maxHull - o.hull) * 3;
        if (d < bd) (best = o), (bd = d);
      }
      return best;
    };
    const empty = r.slots.every((s) => s === null) && !r.rouletteItem;
    /** The nearest crate within `within` px (of `near`, or of the boat). */
    const crateNear = (within: number, near: { x: number; y: number } = r): { x: number; y: number } | null => {
      let crate: { x: number; y: number } | null = null, cd = within;
      for (const c of sim.items.crates) {
        if (c.respawn > 0) continue;
        const d = Math.hypot(c.x - near.x, c.y - near.y) + dist(c) * 0.5;
        if (d < cd) (crate = c), (cd = d);
      }
      return crate;
    };
    // A golden crate up and not too far, with room for what's in it.
    const golden = (within: number): { x: number; y: number } | null => {
      if (sim.items.freeSlot(r) < 0 || r.rouletteItem) return null;
      let best: { x: number; y: number } | null = null, bd = within;
      for (const c of sim.items.crates) {
        if (!c.power || c.respawn > 0) continue;
        const d = dist(c);
        if (d < bd) (best = c), (bd = d);
      }
      return best;
    };
    if (b.mode === 'ctf' && team >= 0) {
      const own = b.flags[team], theirs = b.flags[1 - team];
      const home = { x: own.homeX, y: own.homeY };
      if (theirs.carrier === r.id) return home;
      if (own.carrier >= 0) return sim.racers[own.carrier];
      if (own.dropped) return own;
      const defender = Math.floor(r.id / 2) % 2 === 1;
      if (defender) {
        // Guard the flag: an opponent near it first; otherwise arm yourself from the crates nearby.
        const intruder = nearestFoe(home, 1000);
        if (intruder) return intruder;
        return (empty ? crateNear(900, home) : null) ?? home;
      }
      if (theirs.carrier >= 0) return nearestFoe(sim.racers[theirs.carrier], 900) ?? sim.racers[theirs.carrier];
      const g = golden(900);
      if (g) return g;
      // On the way to their flag, grab a crate close by (going in empty-handed is asking to be sunk).
      if (empty) {
        const c = crateNear(450);
        if (c) return c;
      }
      return theirs;
    }
    const g = golden(1300);
    if (g) return g;
    if (empty) {
      const crate = crateNear(700);
      if (crate) return crate;
    }
    return nearestFoe(r) ?? r;
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
    // Opponents only: team-mates can't be hurt (and aren't worth wasting an item on).
    const others = sim.racers.filter((o) => !sim.allied(r.id, o.id) && o.sinkTimer <= 0 && !sim.isGhost(o));
    const L = sim.track.lapLength;
    /** A boat straight ahead (or behind) within `range`, narrow enough for a straight shot to hit. */
    const inLine = (range: number, behind: boolean): boolean =>
      others.some((o) => {
        const q = rel(o);
        return (behind ? q.f < 0 && q.f > -range : q.f > 0 && q.f < range) && Math.abs(q.p) < o.stats.radius + 8;
      });

    // A battle: no "boat ahead" or "chasing behind" along the track; what counts is who is near,
    // in front, behind.
    if (sim.battle) {
      const near = (d: number): boolean => others.some((o) => rel(o).d < d);
      const behindClose = (d: number): boolean => others.some((o) => {
        const q = rel(o);
        return q.f < 0 && q.d < d && Math.abs(q.p) < 140;
      });
      switch (item) {
        case 'volunteer':
          // It homes in on the nearest opponent in front.
          if (sim.items.nearestFoe(r, 'forward', 0.9, 1100)) return 'forward';
          if (behindClose(300)) return 'backward';
          return heldFor > 20 ? 'forward' : 'none';
        case 'titten': case 'siphon': case 'stairs': case 'sauna': case 'noise': case 'blackout': case 'mushroom':
          // They hit every opponent: when some are close enough to make the most of it.
          if (near(900) || heldFor > 8) return 'forward';
          return 'none';
        case 'lazyVolunteers': case 'paint': case 'glue': case 'fakeCrate': case 'toilet':
          // Dropped behind: when someone is on your tail.
          if (behindClose(450)) return 'forward';
          return heldFor > 20 ? 'forward' : 'none';
      }
    }

    switch (item) {
      case 'volunteer': {
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
        // The saws stick out sideways and ahead: someone alongside, close, or just ahead.
        if (others.some((o) => {
          const q = rel(o);
          const alongside = Math.abs(q.f) < r.boat.size.length * 0.45 && Math.abs(q.p) < r.stats.capRadius + TUNING.jigsaw.reach + o.stats.capRadius;
          const ahead = q.f > 0 && q.f < r.boat.size.length * 1.2 + o.stats.radius && Math.abs(q.p) < q.f * 0.5 + o.stats.radius * 0.6;
          return alongside || ahead;
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
      case 'enlarge':
        // Nothing to aim at: just use it.
        if (heldFor > 1.5) return 'forward';
        break;
      case 'circularSaw':
        // Someone close enough for the blade going round the hull.
        if (others.some((o) => rel(o).d < r.boat.size.length / 2 + TUNING.circularSaw.gap + o.stats.radius + 20)) return 'forward';
        break;
      case 'stairs':
        // In front of every opponent: best from behind, with boats ahead to pass.
        if (r.position > 0 && others.some((o) => o.progress > r.progress && o.progress - r.progress < 1800)) return 'forward';
        break;
      case 'translation':
        // Useless, but it does no harm either: out of the way, to make room for a real item.
        return 'forward';
      case 'champagne':
        // Popped a moment after it turns up (it frees the slot).
        if (heldFor > 2) return 'forward';
        break;
      case 'sauna':
        // Steam for everyone else: best from behind, with boats ahead to pass.
        if (r.position > 0 && others.some((o) => o.progress > r.progress && o.progress - r.progress < 1800)) return 'forward';
        break;
      case 'noise':
        // The police after everyone else: from behind, with boats worth catching ahead.
        if (r.position > 0 && others.some((o) => o.progress > r.progress && o.progress - r.progress < 2500)) return 'forward';
        break;
      case 'lazyVolunteers':
      case 'paint':
        // Dropped behind: when someone is chasing closely.
        if (others.some((o) => {
          const gap = r.progress - o.progress;
          return gap > 40 && gap < 500 && gap < L / 2;
        })) return 'forward';
        break;
      case 'beerDispenser':
        if (r.hull < r.stats.maxHull * 0.65 && !hasEffect(r, 'shielded')) return 'forward';
        break;
      case 'vacuum':
        // Boats ahead, in front and in reach of the nozzle.
        if (others.some((o) => {
          const q = rel(o);
          return q.f > 0 && q.d < TUNING.vacuum.range * 0.8 && q.f / Math.max(1, q.d) > Math.cos(TUNING.vacuum.halfAngle);
        })) return 'forward';
        break;
      case 'tugboat':
        // A tow: whenever there is ground to make up, or straight away when not leading.
        if (r.position > 0 || r.sinceHit < 2) return 'forward';
        break;
      case 'whitePowder': {
        let kmax = 0;
        for (let k = 0; k < 25; k++) kmax = Math.max(kmax, Math.abs(sim.track.samples[sim.track.wrap(r.nearestIndex + k)].curvature));
        if ((kmax < 0.0012 && speed > 120) || (r.sinceHit < 2.5 && r.sinkTimer <= 0)) return 'forward';
        break;
      }
      case 'drill':
        // On the bow for 3 s, then fired: someone ahead to ram, or in line to shoot.
        if (inLine(900, false)) return 'forward';
        if (inLine(500, true)) return 'backward';
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
          const out = Math.abs(q.p) - r.stats.capRadius;
          return out > 0 && out < TUNING.karcher.reach * 0.8 && Math.abs(q.f) < (r.boat.size.length * TUNING.karcher.base) / 2 + TUNING.karcher.spread * out;
        })) return 'forward';
        break;
    }
    return heldFor > 25 ? 'forward' : 'none';
  }
}
