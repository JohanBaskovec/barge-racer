import { FASTEST_TOP_SPEED, ITEM_INFO, TUNING, type ItemId } from '../data/items';
import { addEffect, hasEffect } from '../effects/effects';
import { isTouching } from '../physics/collisions';
import { turnTowards } from '../physics/math';
import type { RaceSimulation } from '../race/RaceSimulation';
import type { Crate, Drill, GluePuddle, Racer, Volunteer } from '../race/types';
import { drawItem } from './itemOdds';

/** Crates, item roulette, item activation and the entities items spawn. */
export class ItemSystem {
  crates: Crate[] = [];
  volunteers: Volunteer[] = [];
  drills: Drill[] = [];
  puddles: GluePuddle[] = [];
  private nextId = 1;

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
        this.crates.push({ id: this.nextId++, x: p.x, y: p.y, respawn: 0 });
      }
    }
  }

  get volunteersInFlight(): number {
    return this.volunteers.filter((v) => !v.dead).length;
  }

  // ---- Activation -------------------------------------------------------

  use(r: Racer, dir: 'forward' | 'backward'): void {
    if (!r.item || r.itemUses <= 0) return;
    const item = r.item;
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
        this.puddles.push({ id: this.nextId++, owner: r.id, x: r.x + Math.cos(back) * dist, y: r.y + Math.sin(back) * dist, age: 0, boatsStuck: new Set(), dead: false });
        break;
      }
    }
    this.sim.emit({ type: 'itemUsed', racer: r.id, item });
    r.itemUses--;
    if (r.itemUses <= 0) {
      r.item = null;
    }
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
    this.updatePuddles(dt);
    this.volunteers = this.volunteers.filter((v) => !v.dead);
    this.drills = this.drills.filter((d) => !d.dead);
    this.puddles = this.puddles.filter((p) => !p.dead);
  }

  private updateCrates(dt: number): void {
    for (const c of this.crates) {
      if (c.respawn > 0) {
        c.respawn -= dt;
        if (c.respawn <= 0) this.sim.emit({ type: 'crate', id: c.id, taken: false });
        continue;
      }
      for (const r of this.sim.racers) {
        if (r.sinkTimer > 0 || this.sim.isGhost(r)) continue;
        if (!isTouching(r, c.x, c.y, TUNING.crateRadius - r.stats.radius * 0.4)) continue;
        c.respawn = TUNING.crateRespawn;
        this.sim.emit({ type: 'crate', id: c.id, taken: true });
        if (!r.item && !r.rouletteItem) {
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
        r.item = r.rouletteItem;
        r.itemUses = ITEM_INFO[r.item].uses;
        r.recentItems.push(r.item);
        if (r.recentItems.length > 4) r.recentItems.shift();
        r.rouletteItem = null;
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
      if (!d.dead && this.outOfWater(d, 0)) d.stuckT = 0.001;
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
