import { TUNING } from '../data/items';
import { addEffect, hasEffect, removeEffect } from '../effects/effects';
import { isTouching, resolveStatic, touchesCapsule } from '../physics/collisions';
import { bargeCapsule } from './traffic';
import { TOWPATH } from '../view/scenery';
import type { RaceSimulation } from './RaceSimulation';
import type { Racer } from './types';
import { oddsColumn } from '../items/itemOdds';

/**
 * Hazards that are not items: they come by themselves.
 *
 * - For the leader alone: **the police** (a leader far ahead is chased by a police boat that
 *   shoots at it; a hit pulls it over) and **anglers** (a line across the canal; caught, the boat
 *   is dragged into the bank).
 * - For everyone, more often the better placed: **birds, rowers and swimmers** on the water.
 *   Running into them makes a mess and slows the boat down; no damage.
 * - Set off by items: a **noise complaint** sends a police boat after every opponent, and **lazy
 *   volunteers** on floating couches behave like swimmers.
 *
 * Pure logic like the rest of the race (seeded random numbers), so it runs on the server too.
 */

export type PolicePhase = 'warn' | 'chase' | 'ticket' | 'leave';
export const POLICE_PHASES: PolicePhase[] = ['warn', 'chase', 'ticket', 'leave'];

export interface Police {
  phase: PolicePhase;
  /** The boat being chased. */
  target: number;
  /** Seconds in this phase. */
  t: number;
  x: number;
  y: number;
  heading: number;
  /** Which side of the target it keeps to. */
  side: 1 | -1;
  fireT: number;
  /** Sent by a noise complaint (an item) rather than for speeding. */
  noise?: boolean;
}

/** A police rocket: flies straight and explodes on the first thing it meets (a boat, the bank, a barge). */
export interface Bullet {
  id: number;
  x: number;
  y: number;
  heading: number;
  travelled: number;
  /** The boat it was fired at (only that one gets pulled over). */
  target: number;
  /** Nearest centre-line sample, to find the banks cheaply. */
  near: number;
  dead: boolean;
}

/** An angler on a bank, `along` the centre line, on `side`, with a line cast across the canal. */
export interface Angler {
  id: number;
  target: number;
  side: 1 | -1;
  along: number;
  age: number;
  hooked: boolean;
  dead: boolean;
}

/**
 * Kind 0: a flock of birds, 1: a rowing boat, 2: swimmers, 3: lazy volunteers on a floating couch
 * (an item: `owner` dropped it). They move along the canal (`dir`).
 */
export interface Critter {
  id: number;
  kind: 0 | 1 | 2 | 3;
  owner?: number;
  along: number;
  lat: number;
  dir: 1 | -1;
  age: number;
  dead: boolean;
}

export class HazardSystem {
  police: Police | null = null;
  /** Police boats sent by a noise complaint, one per boat chased. */
  noisePolice: Police[] = [];
  bullets: Bullet[] = [];
  anglers: Angler[] = [];
  critters: Critter[] = [];
  /** Off in some tests. */
  enabled = true;
  private nextId = 1;
  private speedingT = 0;
  private copsReadyAt = 0;
  private anglerAt: number;
  private critterT = 0;

  constructor(private sim: RaceSimulation) {
    const A = TUNING.anglers;
    this.anglerAt = A.startAfter + sim.rng.range(0.4, 1.2) * A.every;
  }

  update(dt: number): void {
    if (this.sim.phase !== 'racing') return;
    // The hazards that come by themselves (off in some tests); those set off by items always run.
    if (this.enabled) {
      this.updatePolice(dt);
      this.updateAnglers(dt);
      this.spawnCritters(dt);
    }
    this.noisePolice = this.noisePolice.filter((p) => !this.stepPolice(p, dt));
    this.updateBullets(dt);
    this.updateCritters(dt);
    this.bullets = this.bullets.filter((b) => !b.dead);
    this.anglers = this.anglers.filter((a) => !a.dead);
    this.critters = this.critters.filter((c) => !c.dead);
  }

  private get leader(): Racer | undefined {
    return this.sim.racers.find((r) => r.position === 0 && !r.finished);
  }

  // ---- Police -----------------------------------------------------------------

  /** The police boat's solid shape (only while it is parked alongside its target). */
  policeCapsule(p: Police): { ax: number; ay: number; bx: number; by: number; radius: number } {
    const C = TUNING.cops;
    const half = C.length / 2 - C.width / 2;
    const hx = Math.cos(p.heading), hy = Math.sin(p.heading);
    return { ax: p.x - hx * half, ay: p.y - hy * half, bx: p.x + hx * half, by: p.y + hy * half, radius: C.width / 2 };
  }

  private updatePolice(dt: number): void {
    const C = TUNING.cops, sim = this.sim, track = sim.track;
    if (!this.police) {
      const lead = this.leader;
      const second = sim.racers.find((r) => r.position === 1);
      const gap = lead && second && !second.finished ? lead.progress - second.progress : 0;
      this.speedingT = gap > C.gap ? this.speedingT + dt : 0;
      if (lead && this.speedingT > C.after && sim.time >= this.copsReadyAt && sim.time > C.startAfter && lead.progress < track.raceDistance - C.endMargin) {
        this.police = { phase: 'warn', target: lead.id, t: 0, x: lead.x, y: lead.y, heading: lead.heading, side: sim.rng.chance(0.5) ? 1 : -1, fireT: 0.8 };
        this.speedingT = 0;
        sim.emit({ type: 'cops', racer: lead.id, phase: 'warn' });
      }
      return;
    }
    if (this.stepPolice(this.police, dt)) {
      this.police = null;
      this.copsReadyAt = sim.time + C.cooldown;
    }
  }

  /** One police boat's step: warned, chasing, writing the ticket, leaving. True once it has gone. */
  private stepPolice(p: Police, dt: number): boolean {
    const C = TUNING.cops, sim = this.sim, track = sim.track;
    const warn = p.noise ? TUNING.noise.warn : C.warn, chase = p.noise ? TUNING.noise.chase : C.chase;
    const T = sim.racers[p.target];
    p.t += dt;
    const along = track.alongOf(T.progress);
    const lat = track.nearest(T.x, T.y, T.nearestIndex).lateral;
    switch (p.phase) {
      case 'warn': {
        if (p.t < warn) break;
        // It turns up behind its target.
        const s = track.pointAt(along - 520, Math.max(-60, Math.min(60, lat + p.side * 70)));
        p.x = s.x;
        p.y = s.y;
        p.heading = s.heading;
        this.setPhase(p, 'chase');
        break;
      }
      case 'chase': {
        if (T.finished || T.sinkTimer > 0 || p.t > chase) {
          this.setPhase(p, 'leave');
          break;
        }
        const room = track.halfWidth(T.nearestIndex) - C.width;
        this.moveTo(p, track.pointAt(along - C.offset, Math.max(-room, Math.min(room, lat + p.side * 80))), C.speed * T.stats.topSpeed, dt);
        p.fireT -= dt;
        const d = Math.hypot(T.x - p.x, T.y - p.y);
        if (p.fireT <= 0 && d < C.range) {
          p.fireT = C.fireEvery;
          // Aim where the boat will be when the bullet gets there, give or take.
          const tFly = d / C.bulletSpeed;
          const aim = Math.atan2(T.y + T.vy * tFly - p.y, T.x + T.vx * tFly - p.x) + sim.rng.range(-C.spread, C.spread);
          this.bullets.push({ id: this.nextId++, x: p.x + Math.cos(aim) * 40, y: p.y + Math.sin(aim) * 40, heading: aim, travelled: 0, target: T.id, near: T.nearestIndex, dead: false });
        }
        break;
      }
      case 'ticket': {
        // Parked alongside, in the way, while the ticket is written.
        const n = track.sampleAt(along);
        const off = T.stats.capRadius + C.width / 2 + 4;
        const side = lat * p.side > track.halfWidth(T.nearestIndex) - off - C.width / 2 ? -p.side : p.side;
        this.moveTo(p, { x: T.x - n.ty * side * off, y: T.y + n.tx * side * off, heading: Math.atan2(n.ty, n.tx) }, 2 * C.speed * T.stats.topSpeed, dt);
        for (const r of sim.racers) {
          if (r.sinkTimer > 0 || sim.isGhost(r)) continue;
          resolveStatic(r, this.policeCapsule(p), 0, 0);
        }
        if (p.t > C.ticket) this.setPhase(p, 'leave');
        break;
      }
      case 'leave': {
        // Off it goes, ahead along the canal, and fades away.
        const s = track.pointAt(track.nearest(p.x, p.y, -1).along + 400, 0);
        this.moveTo(p, s, 320, dt);
        if (p.t > 1.6) return true;
        break;
      }
    }
    return false;
  }

  /** A noise complaint: a police boat after every opponent of `r` not already chased. */
  noiseComplaint(r: Racer): void {
    const sim = this.sim;
    for (const o of sim.racers) {
      if (o === r || o.finished || o.sinkTimer > 0) continue;
      if (this.police?.target === o.id || this.noisePolice.some((p) => p.target === o.id)) continue;
      this.noisePolice.push({ phase: 'warn', target: o.id, t: 0, x: o.x, y: o.y, heading: o.heading, side: sim.rng.chance(0.5) ? 1 : -1, fireT: sim.rng.range(0.6, 1.4), noise: true });
      sim.emit({ type: 'cops', racer: o.id, phase: 'warn', noise: true });
    }
  }

  /**
   * Lazy volunteers: floating couches behind `r`, staggered across the canal (left, middle, right,
   * one behind the other) so there is always a way through.
   */
  dropCouches(r: Racer): void {
    const L = TUNING.lazyVolunteers, K = TUNING.critters, track = this.sim.track;
    const base = track.alongOf(r.progress) - L.behind - r.boat.size.length / 2;
    for (let k = 0; k < L.couches; k++) {
      let along = base - k * L.stagger;
      if (track.closed) along = ((along % track.length) + track.length) % track.length;
      else if (along < 0) continue;
      const room = Math.max(0, track.sampleAt(along).width / 2 - K.radius[3] - 8);
      const lat = room * ((k % 3) - 1) * 0.8;
      this.critters.push({ id: this.nextId++, kind: 3, owner: r.id, along, lat, dir: 1, age: 0, dead: false });
    }
  }

  private setPhase(p: Police, phase: PolicePhase): void {
    p.phase = phase;
    p.t = 0;
    this.sim.emit(p.noise ? { type: 'cops', racer: p.target, phase, noise: true } : { type: 'cops', racer: p.target, phase });
  }

  /** Glide towards a point at up to `speed`, turning to face the way it goes. */
  private moveTo(p: Police, to: { x: number; y: number; heading: number }, speed: number, dt: number): void {
    const dx = to.x - p.x, dy = to.y - p.y;
    const d = Math.hypot(dx, dy);
    const step = Math.min(d, speed * dt);
    if (d > 0.01) {
      p.x += (dx / d) * step;
      p.y += (dy / d) * step;
    }
    // Face along the canal, leaning a little towards where it is going.
    const want = d > 30 ? Math.atan2(dy, dx) : to.heading;
    const diff = Math.atan2(Math.sin(want - p.heading), Math.cos(want - p.heading));
    p.heading += diff * Math.min(1, dt * 5);
  }

  /** Rockets fly straight and explode on the first boat they touch, at the bank, or against a barge. */
  private updateBullets(dt: number): void {
    const C = TUNING.cops, sim = this.sim, track = sim.track;
    for (const b of this.bullets) {
      if (b.dead) continue;
      const step = C.bulletSpeed * dt;
      b.x += Math.cos(b.heading) * step;
      b.y += Math.sin(b.heading) * step;
      b.travelled += step;
      if (b.travelled > C.bulletRange) {
        this.explode(b);
        continue;
      }
      const boat = sim.racers.find((r) => r.sinkTimer <= 0 && !sim.isGhost(r) && isTouching(r, b.x, b.y, 6));
      if (boat) {
        this.explode(b);
        this.rocketHit(boat);
        continue;
      }
      // the bank
      const n = track.nearest(b.x, b.y, b.near);
      b.near = n.index;
      const pastEnd = !track.closed && (n.along < 0 || n.along > track.length);
      if (pastEnd || Math.abs(n.lateral) > track.halfWidth(n.index)) {
        this.explode(b);
        continue;
      }
      // a barge
      if (sim.trafficPoses.some((p) => p.solid && touchesCapsule(b.x, b.y, 6, bargeCapsule(p)))) this.explode(b);
    }
  }

  private explode(b: Bullet): void {
    b.dead = true;
    this.sim.emit({ type: 'boom', x: b.x, y: b.y });
  }

  /**
   * A rocket hit a boat: it hurts, and the boat the police are chasing is pulled over (stopped and
   * fined). A beer dispenser's head of foam takes the whole thing.
   */
  private rocketHit(r: Racer): void {
    if (hasEffect(r, 'invulnerable')) return;
    if (this.sim.popShield(r, 'police')) return;
    const p = [this.police, ...this.noisePolice].find((q) => q && q.target === r.id && q.phase === 'chase');
    if (p) {
      addEffect(r, 'ticketed', TUNING.cops.ticket);
      this.bullets = this.bullets.filter((x) => x.target !== r.id || x.dead);
      this.setPhase(p, 'ticket');
    }
    this.sim.hit(r, TUNING.cops.rocketDamage, null, 'police', false);
  }

  // ---- Anglers ----------------------------------------------------------------

  /** Where an angler sits (on the towpath) and the two ends of its line (the bank, and out on the water). */
  anglerGeometry(a: Angler): { x: number; y: number; bank: { x: number; y: number }; tip: { x: number; y: number }; heading: number } {
    const track = this.sim.track;
    const hw = track.sampleAt(a.along).width / 2;
    const cast = Math.min(1, a.age / 0.5);
    const seat = track.pointAt(a.along, a.side * (hw + TOWPATH * 0.35));
    const bank = track.pointAt(a.along, a.side * hw);
    const tip = track.pointAt(a.along, a.side * (hw - 2 * hw * TUNING.anglers.reach * cast));
    return { x: seat.x, y: seat.y, bank, tip, heading: seat.heading };
  }

  private updateAnglers(dt: number): void {
    const A = TUNING.anglers, sim = this.sim, track = sim.track;
    const lead = this.leader;
    if (lead && !this.anglers.length && sim.time >= this.anglerAt && !hasEffect(lead, 'ticketed')) {
      const along = track.alongOf(lead.progress) + A.ahead;
      if (track.closed || along < track.length - 200) {
        this.anglers.push({ id: this.nextId++, target: lead.id, side: sim.rng.chance(0.5) ? 1 : -1, along: track.closed ? ((along % track.length) + track.length) % track.length : along, age: 0, hooked: false, dead: false });
      }
      this.anglerAt = sim.time + A.life + Math.max(A.minGap, sim.rng.range(0.6, 1.4) * A.every);
    }
    for (const a of this.anglers) {
      a.age += dt;
      const T = sim.racers[a.target];
      if (a.hooked) {
        // Reeling in: dragged towards the angler's bank until it crashes or the line snaps.
        if (!hasEffect(T, 'hooked') || T.sinkTimer > 0) {
          a.dead = true;
          continue;
        }
        const n = track.samples[T.nearestIndex];
        const k = (A.pull / T.stats.mass) * dt;
        T.vx += -n.ty * a.side * k;
        T.vy += n.tx * a.side * k;
        continue;
      }
      if (a.age > A.life) a.dead = true;
      if (a.dead || a.age < 0.5 || T.finished || T.sinkTimer > 0 || sim.isGhost(T) || hasEffect(T, 'invulnerable')) continue;
      // The line: from the bank out to its tip, straight across.
      const g = this.anglerGeometry(a);
      if (segmentTouches(T, g.bank.x, g.bank.y, g.tip.x, g.tip.y)) {
        a.hooked = true;
        addEffect(T, 'hooked', A.hookTime);
        sim.emit({ type: 'hooked', racer: T.id });
      }
    }
  }

  /** Called when a boat hits the bank: if it was hooked, that's a crash. */
  hookedCrash(r: Racer, impact: number): boolean {
    if (!hasEffect(r, 'hooked') || impact < r.stats.topSpeed * 0.12) return false;
    removeEffect(r, 'hooked');
    this.sim.hit(r, TUNING.anglers.damage, null, 'angler');
    return true;
  }

  // ---- Birds, rowers, swimmers ---------------------------------------------------

  critterPos(c: Critter): { x: number; y: number; heading: number } {
    const p = this.sim.track.pointAt(c.along, c.lat);
    return { x: p.x, y: p.y, heading: c.dir === 1 ? p.heading : p.heading + Math.PI };
  }

  /** Now and then birds, rowers or swimmers ahead of a boat (the better placed, the more often). */
  private spawnCritters(dt: number): void {
    const K = TUNING.critters, sim = this.sim, track = sim.track;
    this.critterT += dt;
    if (this.critterT >= K.every && sim.time > K.startAfter) {
      this.critterT = sim.rng.range(-0.4, 0.4) * K.every;
      const pool = sim.racers.filter((r) => !r.finished && r.sinkTimer <= 0);
      if (pool.length && this.critters.length < K.max) {
        let total = 0;
        const col = (r: Racer): number => oddsColumn(r.position, sim.racers.length);
        for (const r of pool) total += K.weights[col(r)];
        let roll = sim.rng.next() * total;
        let pick = pool[0];
        for (const r of pool) {
          roll -= K.weights[col(r)];
          if (roll < 0) {
            pick = r;
            break;
          }
        }
        let along = track.alongOf(pick.progress) + sim.rng.range(K.ahead[0], K.ahead[1]);
        if (track.closed) along = ((along % track.length) + track.length) % track.length;
        const roll2 = sim.rng.next();
        const kind = (roll2 < 0.45 ? 0 : roll2 < 0.75 ? 1 : 2) as 0 | 1 | 2;
        const room = track.sampleAt(along).width / 2 - K.radius[kind] - 12;
        if ((track.closed || along < track.length - 100) && room > 0) {
          this.critters.push({ id: this.nextId++, kind, along, lat: sim.rng.range(-room, room), dir: sim.rng.chance(0.5) ? 1 : -1, age: 0, dead: false });
        }
      }
    }
  }

  /** Critters drift along; a boat that runs into one makes a mess of it and is slowed. */
  private updateCritters(dt: number): void {
    const K = TUNING.critters, sim = this.sim, track = sim.track;
    for (const c of this.critters) {
      c.age += dt;
      if (c.age > (c.kind === 3 ? TUNING.lazyVolunteers.life : K.life)) c.dead = true;
      if (c.dead) continue;
      c.along += c.dir * K.speed[c.kind] * dt;
      if (track.closed) c.along = ((c.along % track.length) + track.length) % track.length;
      else if (c.along < 0 || c.along > track.length) {
        c.dead = true;
        continue;
      }
      const p = this.critterPos(c);
      const R = K.radius[c.kind];
      const hx = Math.cos(p.heading), hy = Math.sin(p.heading);
      for (const r of sim.racers) {
        if (r.sinkTimer > 0 || sim.isGhost(r)) continue;
        if (c.owner === r.id && c.age < TUNING.lazyVolunteers.ownerImmunity) continue;
        // A rowing boat is long: test along its length.
        const hitIt = c.kind === 1
          ? [-28, 0, 28].some((o) => isTouching(r, p.x + hx * o, p.y + hy * o, 12))
          : isTouching(r, p.x, p.y, R * 0.75);
        if (!hitIt) continue;
        c.dead = true;
        addEffect(r, 'splattered', K.slowTime);
        r.vx *= K.jolt;
        r.vy *= K.jolt;
        sim.emit({ type: 'splat', racer: r.id, kind: c.kind, x: p.x, y: p.y, heading: p.heading });
        break;
      }
    }
  }

  // ---- Debug menu (single player): set a hazard off on demand ----------------------

  /** The police after this boat now, whatever its place: warned, then chased. */
  debugPolice(r: Racer): void {
    this.bullets = [];
    this.police = { phase: 'warn', target: r.id, t: 0, x: r.x, y: r.y, heading: r.heading, side: this.sim.rng.chance(0.5) ? 1 : -1, fireT: 0.8 };
    this.sim.emit({ type: 'cops', racer: r.id, phase: 'warn' });
  }

  /** An angler casting a line just ahead of this boat. */
  debugAngler(r: Racer): void {
    const track = this.sim.track;
    let along = track.alongOf(r.progress) + TUNING.anglers.ahead * 0.8;
    if (track.closed) along = ((along % track.length) + track.length) % track.length;
    else along = Math.min(along, track.length - 100);
    this.anglers = [{ id: this.nextId++, target: r.id, side: this.sim.rng.chance(0.5) ? 1 : -1, along, age: 0, hooked: false, dead: false }];
  }

  /** Birds (0), a rowing boat (1) or swimmers (2) on the water just ahead of this boat, on its line. */
  debugCritter(r: Racer, kind: 0 | 1 | 2): void {
    const track = this.sim.track;
    let along = track.alongOf(r.progress) + 450;
    if (track.closed) along = ((along % track.length) + track.length) % track.length;
    else along = Math.min(along, track.length - 100);
    const room = track.sampleAt(along).width / 2 - TUNING.critters.radius[kind] - 12;
    const lat = Math.max(-room, Math.min(room, track.nearest(r.x, r.y, r.nearestIndex).lateral));
    this.critters.push({ id: this.nextId++, kind, along, lat, dir: 1, age: 0, dead: false });
  }
}

/** Whether a boat's hull touches a thin line from (ax, ay) to (bx, by). */
function segmentTouches(r: Racer, ax: number, ay: number, bx: number, by: number): boolean {
  const len = Math.hypot(bx - ax, by - ay);
  const n = Math.max(2, Math.ceil(len / 10));
  for (let k = 0; k <= n; k++) if (isTouching(r, ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n, 3)) return true;
  return false;
}
