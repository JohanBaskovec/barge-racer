import { FASTEST_TOP_SPEED, ITEM_INFO, TUNING, type ItemId } from '../data/items';
import { addEffect, hasEffect } from '../effects/effects';
import { isTouching } from '../physics/collisions';
import { turnTowards } from '../physics/math';
import type { RaceSimulation } from '../race/RaceSimulation';
import type { Cloud, Crate, Drill, FakeCrate, GlueBlob, GluePuddle, Racer, Shot, Volunteer } from '../race/types';
import { drawItem } from './itemOdds';

/** Crates, item roulette, item activation and the entities items spawn. */
export class ItemSystem {
  crates: Crate[] = [];
  volunteers: Volunteer[] = [];
  drills: Drill[] = [];
  puddles: GluePuddle[] = [];
  fakeCrates: FakeCrate[] = [];
  blobs: GlueBlob[] = [];
  shots: Shot[] = [];
  clouds: Cloud[] = [];
  private nextId = 1;
  /** When each boat last got a "toxic" hit event (the smoke hurts every step, but is announced now and then). */
  private toxicAt = new Map<number, number>();

  constructor(private sim: RaceSimulation) {
    this.buildCrates();
  }

  private buildCrates(): void {
    const track = this.sim.track;
    for (const row of track.def.crateRows) {
      for (let i = 0; i < row.count; i++) {
        const along = track.alongOf(row.at * track.lapLength);
        const s = track.sampleAt(along);
        const spread = Math.min(70, (s.width * 0.7) / row.count);
        const lateral = (i - (row.count - 1) / 2) * spread;
        const p = track.pointAt(along, lateral);
        this.crates.push({ id: this.nextId++, x: p.x, y: p.y, homeX: p.x, homeY: p.y, respawn: 0 });
      }
    }
  }

  get volunteersInFlight(): number {
    return this.volunteers.filter((v) => !v.dead).length;
  }

  // ---- Activation -------------------------------------------------------

  /** Index of the first empty item slot, or -1 when both are full. */
  freeSlot(r: Racer): number {
    return r.slots.findIndex((s) => s === null);
  }

  /** Put an item into the first free slot. */
  give(r: Racer, id: ItemId): void {
    const k = this.freeSlot(r);
    if (k >= 0) r.slots[k] = { id, uses: ITEM_INFO[id].uses };
  }

  use(r: Racer, slot: number, dir: 'forward' | 'backward'): void {
    const held = r.slots[slot];
    if (!held || held.uses <= 0) return;
    const item = held.id;
    const heading = dir === 'forward' ? r.heading : r.heading + Math.PI;
    const bow = r.boat.size.length / 2 + 12;
    const bx = r.x + Math.cos(heading) * bow;
    const by = r.y + Math.sin(heading) * bow;

    switch (item) {
      case 'volunteer':
      case 'volunteerSquad': {
        let target: number | null = null;
        if (dir === 'forward') target = this.targetAhead(r);
        this.volunteers.push({ id: this.nextId++, owner: r.id, targetId: target, x: bx, y: by, heading, age: 0, locked: false, near: r.nearestIndex, dead: false });
        break;
      }
      case 'jigsaw':
        addEffect(r, 'jigsaw', TUNING.jigsaw.duration);
        r.jigsawHit.clear();
        break;
      case 'whitePowder':
        addEffect(r, 'boost', TUNING.powder.duration);
        break;
      case 'bigBag':
        addEffect(r, 'boost', 2);
        break;
      case 'drill':
        this.drills.push({ id: this.nextId++, owner: r.id, x: bx, y: by, heading, travelled: 0, stuckT: 0, age: 0, near: r.nearestIndex, dead: false });
        break;
      case 'glue': {
        const back = r.heading + Math.PI;
        const dist = r.boat.size.length / 2 + TUNING.glue.radius * 0.6;
        this.spawnPuddle(r.x + Math.cos(back) * dist, r.y + Math.sin(back) * dist, r.id);
        break;
      }
      case 'siliconeGun':
        this.blobs.push({ id: this.nextId++, owner: r.id, x: bx, y: by, heading, travelled: 0, age: 0, near: r.nearestIndex, dead: false });
        break;
      case 'fakeCrate': {
        // Dropped behind the stern, exactly like glue.
        const back = r.heading + Math.PI;
        const dist = r.boat.size.length / 2 + TUNING.fakeCrate.radius + 10;
        this.fakeCrates.push({ id: this.nextId++, owner: r.id, x: r.x + Math.cos(back) * dist, y: r.y + Math.sin(back) * dist, age: 0, dead: false });
        break;
      }
      case 'beer': {
        const before = r.hull;
        r.hull = Math.min(r.stats.maxHull, r.hull + r.stats.maxHull * TUNING.beer.healFraction);
        this.sim.emit({ type: 'heal', racer: r.id, amount: r.hull - before });
        break;
      }
      case 'mushroom': {
        // Whoever is ahead shrinks, whoever is behind speeds up, crates come to the user.
        // (The user's screen goes psychedelic: that part is the view's.)
        const d = TUNING.mushroom.duration;
        addEffect(r, 'magnet', d);
        for (const o of this.sim.racers) {
          if (o === r || o.finished || o.sinkTimer > 0) continue;
          addEffect(o, o.progress > r.progress ? 'shrunk' : 'hasty', d);
        }
        break;
      }
      case 'blackout':
        for (const o of this.sim.racers) if (o !== r && !o.finished && o.sinkTimer <= 0) addEffect(o, 'blackout', TUNING.blackout.duration);
        break;
      case 'raclette': {
        // Always a potato and two slices of ham straight ahead in a fan, and cheese behind (whatever the direction).
        const R = TUNING.raclette;
        const front = r.boat.size.length / 2 + 12;
        for (const [kind, off] of [[0, 0], [1, -R.spread], [1, R.spread]] as const) {
          const a = r.heading + off;
          this.shots.push({ id: this.nextId++, owner: r.id, kind, x: r.x + Math.cos(a) * front, y: r.y + Math.sin(a) * front, heading: a, travelled: 0, age: 0, near: r.nearestIndex, dead: false });
        }
        this.dropCloud(r, 0, R.cheeseRadius);
        break;
      }
      case 'toilet':
        this.dropCloud(r, 1, TUNING.toilet.radius);
        break;
      case 'karcher':
        addEffect(r, 'karcher', TUNING.karcher.duration);
        break;
    }
    this.sim.emit({ type: 'itemUsed', racer: r.id, item });
    held.uses--;
    if (held.uses <= 0) r.slots[slot] = null;
  }

  /** A cloud on the water just behind the stern, like glue. */
  private dropCloud(r: Racer, kind: 0 | 1, radius: number): void {
    const back = r.heading + Math.PI;
    const dist = r.boat.size.length / 2 + radius * 0.6;
    this.clouds.push({ id: this.nextId++, owner: r.id, kind, x: r.x + Math.cos(back) * dist, y: r.y + Math.sin(back) * dist, age: 0, dead: false });
  }

  private spawnPuddle(x: number, y: number, owner: number): void {
    this.puddles.push({ id: this.nextId++, owner, x, y, age: 0, boatsStuck: new Set(), dead: false });
  }

  private targetAhead(r: Racer): number | null {
    const ahead = this.sim.racers.find((o) => o.position === r.position - 1 && !o.finished);
    return ahead ? ahead.id : null;
  }

  // ---- Per step ----------------------------------------------------------

  update(dt: number): void {
    this.updateCrates(dt);
    this.updateRoulette(dt);
    this.updateJigsaw();
    this.updateVolunteers(dt);
    this.updateDrills(dt);
    this.updateBlobs(dt);
    this.updateShots(dt);
    this.updateFakeCrates(dt);
    this.updatePuddles(dt);
    this.updateClouds(dt);
    this.updateKarcher(dt);
    this.volunteers = this.volunteers.filter((v) => !v.dead);
    this.drills = this.drills.filter((d) => !d.dead);
    this.puddles = this.puddles.filter((p) => !p.dead);
    this.blobs = this.blobs.filter((b) => !b.dead);
    this.fakeCrates = this.fakeCrates.filter((f) => !f.dead);
    this.shots = this.shots.filter((s) => !s.dead);
    this.clouds = this.clouds.filter((c) => !c.dead);
  }

  /** Crates a magic mushroom is pulling: they fly to the nearest boat that has eaten one, and float home when let go. */
  private moveCrate(c: Crate, dt: number): void {
    const M = TUNING.mushroom;
    let target: Racer | null = null;
    let best = M.magnetRadius;
    for (const r of this.sim.racers) {
      if (!hasEffect(r, 'magnet') || r.sinkTimer > 0) continue;
      const d = Math.hypot(r.x - c.x, r.y - c.y);
      if (d < best) {
        best = d;
        target = r;
      }
    }
    if (target) {
      const step = Math.min(best, M.magnetSpeed * dt);
      c.x += ((target.x - c.x) / (best || 1)) * step;
      c.y += ((target.y - c.y) / (best || 1)) * step;
    } else if (c.x !== c.homeX || c.y !== c.homeY) {
      const d = Math.hypot(c.homeX - c.x, c.homeY - c.y);
      const step = Math.min(d, M.homeSpeed * dt);
      c.x += ((c.homeX - c.x) / (d || 1)) * step;
      c.y += ((c.homeY - c.y) / (d || 1)) * step;
    }
  }

  private updateCrates(dt: number): void {
    for (const c of this.crates) {
      if (c.respawn > 0) {
        c.respawn -= dt;
        if (c.respawn <= 0) this.sim.emit({ type: 'crate', id: c.id, taken: false });
        continue;
      }
      this.moveCrate(c, dt);
      for (const r of this.sim.racers) {
        if (r.sinkTimer > 0 || this.sim.isGhost(r)) continue;
        if (!isTouching(r, c.x, c.y, TUNING.crateRadius - r.stats.radius * 0.4)) continue;
        c.respawn = TUNING.crateRespawn;
        c.x = c.homeX; // it comes back in its place
        c.y = c.homeY;
        this.sim.emit({ type: 'crate', id: c.id, taken: true });
        // A crate only gives something if a slot is free and the roulette isn't already spinning.
        if (this.freeSlot(r) >= 0 && !r.rouletteItem) {
          const leader = this.sim.racers.reduce((m, o) => Math.max(m, o.progress), -Infinity);
          const item = drawItem(this.sim.rng, {
            position: r.position,
            farBehind: leader - r.progress > this.sim.track.lapLength,
            volunteersInFlight: this.volunteersInFlight,
            recentItems: r.recentItems,
          });
          if (this.sim.forcedItem) r.rouletteItem = this.sim.forcedItem;
          else r.rouletteItem = item;
          r.rouletteT = TUNING.rouletteTime;
          this.sim.emit({ type: 'itemPickup', racer: r.id, item: r.rouletteItem });
        }
        break;
      }
    }
  }

  private updateRoulette(dt: number): void {
    for (const r of this.sim.racers) {
      if (!r.rouletteItem) continue;
      r.rouletteT -= dt;
      if (r.rouletteT <= 0) {
        const id = r.rouletteItem;
        r.rouletteItem = null;
        r.recentItems.push(id);
        if (r.recentItems.length > 4) r.recentItems.shift();
        this.give(r, id);
      }
    }
  }

  private updateJigsaw(): void {
    for (const r of this.sim.racers) {
      if (!hasEffect(r, 'jigsaw') || r.sinkTimer > 0) continue;
      const reach = r.boat.size.length * TUNING.jigsaw.reachMult;
      const tan = Math.tan(TUNING.jigsaw.halfAngle);
      const hx = Math.cos(r.heading);
      const hy = Math.sin(r.heading);
      const inCone = (x: number, y: number, slack: number): boolean => {
        const dx = x - r.x;
        const dy = y - r.y;
        const f = dx * hx + dy * hy;
        const p = Math.abs(-dx * hy + dy * hx);
        return f > 0 && f < reach + slack && p < f * tan + slack * 0.8;
      };
      for (const o of this.sim.racers) {
        if (o === r || o.sinkTimer > 0 || r.jigsawHit.has(o.id)) continue;
        if (inCone(o.x, o.y, o.stats.radius)) {
          r.jigsawHit.add(o.id);
          this.sim.hit(o, TUNING.jigsaw.damage, r.id, 'jigsaw');
        }
      }
      for (const v of this.volunteers) if (v.owner !== r.id && inCone(v.x, v.y, 12)) v.dead = true;
      for (const d of this.drills) if (d.owner !== r.id && inCone(d.x, d.y, 12)) d.dead = true;
      for (const b of this.blobs) if (b.owner !== r.id && inCone(b.x, b.y, 12)) b.dead = true;
      for (const s of this.shots) if (s.owner !== r.id && inCone(s.x, s.y, 12)) s.dead = true;
      for (const f of this.fakeCrates) if (f.owner !== r.id && inCone(f.x, f.y, TUNING.fakeCrate.radius)) f.dead = true;
    }
  }

  private updateVolunteers(dt: number): void {
    const track = this.sim.track;
    const speed = FASTEST_TOP_SPEED * TUNING.volunteer.speedMult;
    for (const v of this.volunteers) {
      if (v.dead) continue;
      v.age += dt;
      const target = v.targetId !== null ? this.sim.racers[v.targetId] : null;
      if (target && v.age > TUNING.volunteer.straightTime) {
        const dx = target.x - v.x;
        const dy = target.y - v.y;
        if (!v.locked && Math.hypot(dx, dy) < TUNING.volunteer.lockRange) v.locked = true;
        let desired: number;
        if (v.locked) desired = Math.atan2(dy, dx);
        else {
          const n = track.nearest(v.x, v.y, v.near);
          v.near = n.index;
          const p = track.pointAt(n.along + 180);
          desired = Math.atan2(p.y - v.y, p.x - v.x);
        }
        v.heading = turnTowards(v.heading, desired, TUNING.volunteer.turnRate * dt);
      }
      v.x += Math.cos(v.heading) * speed * dt;
      v.y += Math.sin(v.heading) * speed * dt;

      for (const r of this.sim.racers) {
        if (r.sinkTimer > 0 || (r.id === v.owner && v.age < 0.6)) continue;
        if (isTouching(r, v.x, v.y, 10)) {
          this.sim.hit(r, TUNING.volunteer.damage, v.owner, 'volunteer');
          v.dead = true;
          break;
        }
      }
      if (v.dead) continue;
      if (v.age > TUNING.volunteer.life || this.outOfWater(v, 30)) v.dead = true;
      for (const p of this.puddles) {
        if ((p.x - v.x) ** 2 + (p.y - v.y) ** 2 < TUNING.glue.radius ** 2) v.dead = true;
      }
    }
  }

  private updateDrills(dt: number): void {
    const speed = FASTEST_TOP_SPEED * TUNING.drill.speedMult;
    for (const d of this.drills) {
      if (d.dead) continue;
      d.age += dt;
      if (d.stuckT > 0) {
        d.stuckT += dt;
        if (d.stuckT > TUNING.drill.stuckTime) d.dead = true;
        continue;
      }
      d.x += Math.cos(d.heading) * speed * dt;
      d.y += Math.sin(d.heading) * speed * dt;
      d.travelled += speed * dt;
      if (d.travelled > TUNING.drill.range) d.dead = true;
      for (const r of this.sim.racers) {
        if (r.sinkTimer > 0 || (r.id === d.owner && d.age < 0.5)) continue;
        if (isTouching(r, d.x, d.y, 10)) {
          this.sim.hit(r, TUNING.drill.damage, d.owner, 'drill');
          d.dead = true;
          break;
        }
      }
      if (d.dead) continue;
      for (const v of this.volunteers) {
        if (!v.dead && (v.x - d.x) ** 2 + (v.y - d.y) ** 2 < 22 * 22) {
          v.dead = true;
          d.dead = true;
        }
      }
      // A drill smashes a fake crate (and is stopped by it).
      for (const f of this.fakeCrates) {
        if (!f.dead && !d.dead && (f.x - d.x) ** 2 + (f.y - d.y) ** 2 < (TUNING.fakeCrate.radius + 14) ** 2) {
          f.dead = true;
          d.dead = true;
        }
      }
      if (!d.dead && this.outOfWater(d, 0)) d.stuckT = 0.001;
    }
  }

  private updateBlobs(dt: number): void {
    const speed = FASTEST_TOP_SPEED * TUNING.silicone.speedMult;
    for (const b of this.blobs) {
      if (b.dead) continue;
      b.age += dt;
      const px = b.x, py = b.y;
      b.x += Math.cos(b.heading) * speed * dt;
      b.y += Math.sin(b.heading) * speed * dt;
      b.travelled += speed * dt;
      // It lands on the first boat it touches...
      for (const r of this.sim.racers) {
        if (r.sinkTimer > 0 || this.sim.isGhost(r) || (r.id === b.owner && b.age < TUNING.silicone.ownerImmunity)) continue;
        if (isTouching(r, b.x, b.y, 10)) {
          this.spawnPuddle(r.x, r.y, b.owner);
          b.dead = true;
          break;
        }
      }
      if (b.dead) continue;
      // ...or on the water where it runs out of range, or just before the bank.
      if (this.outOfWater(b, 0)) {
        this.spawnPuddle(px, py, b.owner);
        b.dead = true;
      } else if (b.travelled >= TUNING.silicone.range) {
        this.spawnPuddle(b.x, b.y, b.owner);
        b.dead = true;
      }
    }
  }

  /** Potato and ham: straight shots that hit the first boat and cover it in cheese. */
  private updateShots(dt: number): void {
    const R = TUNING.raclette;
    for (const s of this.shots) {
      if (s.dead) continue;
      const spec = s.kind === 0 ? R.potato : R.ham;
      const speed = FASTEST_TOP_SPEED * spec.speedMult;
      s.age += dt;
      s.x += Math.cos(s.heading) * speed * dt;
      s.y += Math.sin(s.heading) * speed * dt;
      s.travelled += speed * dt;
      if (s.travelled > R.range) {
        s.dead = true;
        continue;
      }
      for (const r of this.sim.racers) {
        if (r.sinkTimer > 0 || this.sim.isGhost(r) || (r.id === s.owner && s.age < 0.5)) continue;
        if (isTouching(r, s.x, s.y, spec.radius)) {
          if (this.sim.hit(r, spec.damage, s.owner, 'raclette')) addEffect(r, 'cheesed', R.splashTime);
          s.dead = true;
          break;
        }
      }
      if (!s.dead && this.outOfWater(s, 0)) s.dead = true;
    }
  }

  /** Melted cheese covers whoever drives through it; toxic smoke hurts them, the owner too after a moment. */
  private updateClouds(dt: number): void {
    const R = TUNING.raclette, T = TUNING.toilet;
    for (const c of this.clouds) {
      c.age += dt;
      const [radius, life, immunity] = c.kind === 0 ? [R.cheeseRadius, R.cheeseLife, R.cheeseOwnerImmunity] : [T.radius, T.life, T.ownerImmunity];
      if (c.age > life) c.dead = true;
      if (c.dead) continue;
      const grow = Math.min(1, c.age / 0.4);
      for (const r of this.sim.racers) {
        if (r.sinkTimer > 0 || this.sim.isGhost(r) || (r.id === c.owner && c.age < immunity)) continue;
        const rr = radius * grow + r.stats.radius * 0.4;
        if ((r.x - c.x) ** 2 + (r.y - c.y) ** 2 > rr * rr) continue;
        if (c.kind === 0) addEffect(r, 'cheesed', R.cheeseTime);
        else if (this.sim.poison(r, T.dps * dt)) {
          if (this.sim.time - (this.toxicAt.get(r.id) ?? -99) >= T.feedbackEvery) {
            this.toxicAt.set(r.id, this.sim.time);
            this.sim.emit({ type: 'hit', racer: r.id, by: c.owner, source: 'toilet', damage: T.dps * T.feedbackEvery });
          }
        }
      }
    }
  }

  /** Water jets on both sides push every boat alongside away, sideways, and leave it wet. */
  private updateKarcher(dt: number): void {
    const K = TUNING.karcher;
    for (const r of this.sim.racers) {
      if (!hasEffect(r, 'karcher') || r.sinkTimer > 0) continue;
      const hx = Math.cos(r.heading), hy = Math.sin(r.heading);
      const nx = -hy, ny = hx;
      const halfLen = r.boat.size.length / 2 + 160;
      for (const o of this.sim.racers) {
        if (o === r || o.sinkTimer > 0 || o.finished || this.sim.isGhost(o)) continue;
        const dx = o.x - r.x, dy = o.y - r.y;
        const f = dx * hx + dy * hy;
        const p = dx * nx + dy * ny;
        const gap = Math.abs(p) - r.stats.capRadius - o.stats.capRadius;
        if (Math.abs(f) > halfLen || gap > K.reach) continue;
        const side = p >= 0 ? 1 : -1;
        const strength = 1 - Math.max(0, gap) / K.reach; // closer to the nozzle, harder the push
        const away = (o.vx * nx + o.vy * ny) * side;
        if (away < K.maxSideSpeed) {
          const a = ((K.push * strength) / o.stats.mass) * dt;
          o.vx += nx * side * a;
          o.vy += ny * side * a;
        }
        addEffect(o, 'soaked', K.soakTime);
        o.soakedBy = r.id;
      }
    }
  }

  private updateFakeCrates(dt: number): void {
    const radius = TUNING.fakeCrate.radius;
    for (const f of this.fakeCrates) {
      f.age += dt;
      if (f.age > TUNING.fakeCrate.life) f.dead = true;
      if (f.dead) continue;
      for (const r of this.sim.racers) {
        if (r.sinkTimer > 0 || this.sim.isGhost(r) || (r.id === f.owner && f.age < TUNING.fakeCrate.ownerImmunity)) continue;
        if (!isTouching(r, f.x, f.y, radius - r.stats.radius * 0.4)) continue;
        // A boat that is blinking (just hit) passes straight through; the trap stays armed.
        if (this.sim.hit(r, TUNING.fakeCrate.damage, f.owner, 'fakeCrate')) {
          f.dead = true;
          break;
        }
      }
    }
  }

  private updatePuddles(dt: number): void {
    for (const r of this.sim.racers) r.inGlue = false;
    for (const p of this.puddles) {
      p.age += dt;
      if (p.age > TUNING.glue.life) p.dead = true;
      const grow = Math.min(1, p.age / 0.3);
      const radius = TUNING.glue.radius * grow;
      let anyInside = false;
      for (const r of this.sim.racers) {
        if (r.sinkTimer > 0) continue;
        const rr = radius + r.stats.radius * 0.4;
        if ((r.x - p.x) ** 2 + (r.y - p.y) ** 2 > rr * rr) continue;
        if (r.id === p.owner && p.age < TUNING.glue.ownerImmunity) continue;
        if (hasEffect(r, 'boost')) continue;
        if (r.boat.specials?.washesGlue) {
          p.dead = true;
          break;
        }
        anyInside = true;
        r.inGlue = true;
        addEffect(r, 'glued', TUNING.glue.stickyTime);
        p.boatsStuck.add(r.id);
      }
      if (!anyInside && p.boatsStuck.size >= TUNING.glue.maxBoats) p.dead = true;
    }
  }

  private outOfWater(e: { x: number; y: number; near: number }, margin: number): boolean {
    const track = this.sim.track;
    const n = track.nearest(e.x, e.y, e.near);
    e.near = n.index;
    const pastEnd = !track.closed && (n.along < 0 || n.along > track.length);
    return pastEnd || Math.abs(n.lateral) > track.halfWidth(n.index) + margin;
  }
}

export type { ItemId };
