import { BATTLE_ODDS, BATTLE_TRIPLE, FASTEST_TOP_SPEED, GLOBAL_ITEMS, ITEM_INFO, ITEM_POWER, TRIPLE_ODDS, TUNING, type ItemId } from '../data/items';
import { addEffect, hasEffect } from '../effects/effects';
import { isTouching, resolveStatic, touchesCapsule } from '../physics/collisions';

/** A fixed capsule on the water (a segment with round ends). */
type Capsule = { ax: number; ay: number; bx: number; by: number; radius: number };
import { bargeCapsule } from '../race/traffic';
import { BATTLE } from '../race/battle';
import { angleDiff, clamp, turnTowards } from '../physics/math';
import type { RaceSimulation } from '../race/RaceSimulation';
import type { Boobs, Cloud, Crate, Drill, Drop, FakeCrate, GlueBlob, GluePuddle, Racer, Shot, Stairs, Volunteer } from '../race/types';
import { drawItem, oddsColumn } from './itemOdds';

/** Crates, item roulette, item activation and the entities items spawn. */

/** Items left out of battles: the tugboat tows you along the loop, which is no use in an arena. */
const BATTLE_EXCLUDED: readonly ItemId[] = ['tugboat'];
/** A golden crate (battles): only the strongest items (power 8 or more), with the battle weights. */
const GOLDEN_ODDS = Object.fromEntries(Object.entries(BATTLE_ODDS).map(([id, w]) => [id, ITEM_POWER[id as ItemId] >= 8 ? w : 0])) as Record<ItemId, number>;
export class ItemSystem {
  crates: Crate[] = [];
  volunteers: Volunteer[] = [];
  drills: Drill[] = [];
  puddles: GluePuddle[] = [];
  fakeCrates: FakeCrate[] = [];
  blobs: GlueBlob[] = [];
  shots: Shot[] = [];
  clouds: Cloud[] = [];
  /** Dicke Titten on the water. */
  boobs: Boobs[] = [];
  /** Crates tossed by barges to boats that are behind. */
  drops: Drop[] = [];
  /** Motorized stairs, coming out of the banks in front of the opponents. */
  stairs: Stairs[] = [];
  /** When each circular saw last hurt each boat ("owner-target" -> time). */
  private sawHits = new Map<string, number>();
  private nextId = 1;
  /** When each boat last had a crate tossed to it. */
  private droppedFor = new Map<number, number>();
  /** Time since each flushing boat dropped its last cloud of smoke. */
  private flushT = new Map<number, number>();
  /** Time since each painting boat left its last splash of paint. */
  private paintT = new Map<number, number>();
  /** When each boat last got a "toxic" hit event (the smoke hurts every step, but is announced now and then). */
  private toxicAt = new Map<number, number>();

  constructor(private sim: RaceSimulation) {
    this.buildCrates();
  }

  /**
   * The crate rows: as many crates across as the canal has room for (at least 2 crate widths
   * apart), the rest in staggered lines behind, so 8 crates fit a narrow canal too.
   */
  private buildCrates(): void {
    const track = this.sim.track;
    const gap = TUNING.crateRadius * 2 + 4;
    for (const row of track.def.crateRows) {
      const at = track.alongOf(row.at * track.lapLength);
      const room = track.sampleAt(at).width * 0.8;
      const perRank = Math.max(2, Math.min(row.count, 4, Math.floor(room / gap)));
      for (let i = 0; i < row.count; i++) {
        const rank = Math.floor(i / perRank), k = i % perRank;
        const inRank = Math.min(perRank, row.count - rank * perRank);
        const along = at + rank * 62;
        const s = track.sampleAt(along);
        const spread = Math.max(gap, Math.min(70, (s.width * 0.8) / perRank));
        const lateral = (k - (inRank - 1) / 2) * spread + (rank % 2 ? 1 : -1) * spread * 0.2;
        const p = track.pointAt(along, lateral);
        this.crates.push({ id: this.nextId++, x: p.x, y: p.y, homeX: p.x, homeY: p.y, respawn: 0 });
      }
    }
    // An arena's golden crates, in the middle of the water: they turn up a while after the start,
    // one after the other.
    (track.def.power ?? []).forEach((at, k) => {
      const p = track.pointAt(track.alongOf(at * track.lapLength), 0);
      this.crates.push({ id: this.nextId++, x: p.x, y: p.y, homeX: p.x, homeY: p.y, respawn: BATTLE.powerFirst + k * (BATTLE.powerRespawn / 2), power: true });
    });
  }

  get volunteersInFlight(): number {
    return this.volunteers.filter((v) => !v.dead).length;
  }

  // ---- Activation -------------------------------------------------------

  /** Index of the first empty item slot, or -1 when both are full. */
  freeSlot(r: Racer): number {
    return r.slots.findIndex((s) => s === null);
  }

  /** Put an item into the first free slot; `triple`: its better version, with three uses. */
  give(r: Racer, id: ItemId, triple = false): void {
    const k = this.freeSlot(r);
    if (k < 0) return;
    r.slots[k] = triple ? { id, uses: 3, triple: true } : { id, uses: ITEM_INFO[id].uses };
  }

  use(r: Racer, slot: number, dir: 'forward' | 'backward'): void {
    const held = r.slots[slot];
    if (!held || held.uses <= 0) return;
    const item = held.id;
    const heading = this.aimed(r, dir === 'forward' ? r.heading : r.heading + Math.PI);
    const bow = r.boat.size.length / 2 + 12;
    const bx = r.x + Math.cos(heading) * bow;
    const by = r.y + Math.sin(heading) * bow;

    switch (item) {
      case 'volunteer': {
        let target: number | null = null;
        if (dir === 'forward') target = this.sim.battle ? (this.nearestFoe(r, 'forward', 0.9, 1400)?.id ?? null) : this.targetAhead(r);
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
      case 'drill':
        // On the bow first (see updateDrills), then fired.
        this.drills.push({ id: this.nextId++, owner: r.id, x: bx, y: by, heading, travelled: 0, stuckT: 0, age: 0, near: r.nearestIndex, mounted: TUNING.drill.mountTime, back: dir === 'backward', hit: [], dead: false });
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
        addEffect(r, 'drunk', TUNING.beer.drunkTime);
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
          // (a battle: ahead on points; team-mates all get the speed)
          const ahead = this.sim.battle ? o.position < r.position : o.progress > r.progress;
          addEffect(o, ahead && !this.sim.allied(r.id, o.id) ? 'shrunk' : 'hasty', d);
        }
        break;
      }
      case 'blackout':
        for (const o of this.sim.racers) if (!this.sim.allied(r.id, o.id) && !o.finished && o.sinkTimer <= 0) addEffect(o, 'blackout', TUNING.blackout.duration);
        break;
      case 'raclette': {
        // Always a potato and two slices of ham straight ahead in a fan, and cheese behind (whatever the direction).
        const R = TUNING.raclette;
        const front = r.boat.size.length / 2 + 12;
        const aim = this.aimed(r, r.heading);
        for (const [kind, off] of [[0, 0], [1, -R.spread], [1, R.spread]] as const) {
          const a = aim + off;
          this.shots.push({ id: this.nextId++, owner: r.id, kind, wait: 0, x: r.x + Math.cos(a) * front, y: r.y + Math.sin(a) * front, heading: a, travelled: 0, age: 0, near: r.nearestIndex, dead: false });
        }
        this.dropCloud(r, 0, R.cheeseRadius);
        break;
      }
      case 'toilet':
        // A trail of smoke behind, for a few seconds (see updateFlushing).
        addEffect(r, 'flushing', TUNING.toilet.trailTime);
        this.dropCloud(r, 1, TUNING.toilet.radius);
        this.flushT.set(r.id, 0);
        break;
      case 'karcher':
        addEffect(r, 'karcher', TUNING.karcher.duration);
        break;
      case 'dildo':
        addEffect(r, 'dildo', TUNING.dildo.duration);
        r.jigsawHit.clear();
        break;
      case 'nailGun':
        // A burst of nails, one after the other: the next ones leave the bow a moment later.
        for (let k = 0; k < TUNING.nail.count; k++) {
          this.shots.push({ id: this.nextId++, owner: r.id, kind: 2, wait: k * TUNING.nail.every, x: bx, y: by, heading, travelled: 0, age: 0, near: r.nearestIndex, dead: false });
        }
        break;
      case 'titten':
        this.dropTitten(r);
        break;
      case 'siphon':
        for (const o of this.sim.racers) if (!this.sim.allied(r.id, o.id) && !o.finished && o.sinkTimer <= 0) addEffect(o, 'siphoned', TUNING.siphon.duration);
        break;
      case 'tugboat':
        addEffect(r, 'towed', TUNING.tugboat.duration);
        break;
      case 'beerDispenser': {
        const before = r.hull;
        r.hull = r.stats.maxHull;
        addEffect(r, 'shielded', TUNING.beerDispenser.shieldTime);
        addEffect(r, 'drunk', TUNING.beerDispenser.drunkTime);
        this.sim.emit({ type: 'heal', racer: r.id, amount: r.hull - before });
        break;
      }
      case 'vacuum':
        addEffect(r, 'vacuum', TUNING.vacuum.duration);
        break;
      case 'sauna':
        // Steam everywhere for the others; the one clear spot is round the owner.
        addEffect(r, 'sauna', TUNING.sauna.duration);
        for (const o of this.sim.racers) if (!this.sim.allied(r.id, o.id) && !o.finished && o.sinkTimer <= 0) addEffect(o, 'steamed', TUNING.sauna.duration);
        break;
      case 'noise':
        this.sim.hazards.noiseComplaint(r);
        break;
      case 'lazyVolunteers':
        this.sim.hazards.dropCouches(r);
        break;
      case 'enlarge':
        addEffect(r, 'enlarged', TUNING.enlarge.duration);
        break;
      case 'circularSaw':
        addEffect(r, 'circularSaw', TUNING.circularSaw.duration);
        break;
      case 'stairs':
        // Every opponent's screen goes behind unfolding stairs, then stairs come out of a bank in front of them.
        for (const o of this.sim.racers) {
          if (this.sim.allied(r.id, o.id) || o.finished || o.sinkTimer > 0) continue;
          addEffect(o, 'stairsDown', TUNING.stairs.warn);
          this.stairs.push({ id: this.nextId++, owner: r.id, target: o.id, along: -1, side: this.sim.rng.chance(0.5) ? 1 : -1, age: 0, hit: [], dead: false });
        }
        break;
      case 'translation':
        // Useless: the others' games switch language for a while (the view's part).
        for (const o of this.sim.racers) if (!this.sim.allied(r.id, o.id) && !o.finished) addEffect(o, 'translated', TUNING.translation.duration);
        break;
      case 'champagne':
        // Useless: popping the champagne before the finish. A little drunker than a beer, nothing repaired.
        addEffect(r, 'drunk', TUNING.champagne.drunkTime);
        addEffect(r, 'bubbly', TUNING.champagne.drunkTime);
        break;
      case 'paint':
        // A trail of wet paint behind, for a few seconds (see updateFlushing).
        addEffect(r, 'painting', TUNING.paint.trailTime);
        this.dropCloud(r, 2, TUNING.paint.radius);
        this.paintT.set(r.id, 0);
        break;
    }
    this.sim.emit({ type: 'itemUsed', racer: r.id, item });
    held.uses--;
    if (held.uses <= 0) r.slots[slot] = null;
  }

  /** A cloud on the water just behind the stern, like glue. */
  private dropCloud(r: Racer, kind: 0 | 1 | 2, radius: number): void {
    const back = r.heading + Math.PI;
    const dist = r.boat.size.length / 2 + radius * 0.6;
    this.clouds.push({ id: this.nextId++, owner: r.id, kind, x: r.x + Math.cos(back) * dist, y: r.y + Math.sin(back) * dist, age: 0, dead: false });
  }

  /**
   * Dicke Titten: a pair in front of every opponent, on the line it is taking, to dodge. Never a
   * wall: one pair per stretch of canal (a pair that would land beside another goes further on),
   * each leaving room to pass on one side, and lying along the canal where it is too narrow.
   */
  private dropTitten(r: Racer): void {
    const T = TUNING.titten, track = this.sim.track;
    const placed: number[] = [];
    const targets = this.sim.racers.filter((o) => !this.sim.allied(r.id, o.id) && !o.finished && o.sinkTimer <= 0).sort((a, b) => a.progress - b.progress);
    for (const o of targets) {
      const n = track.nearest(o.x, o.y, o.nearestIndex);
      const way = this.sim.facing(o);
      let along = n.along + T.ahead * way;
      // Not in the same stretch as another pair: further on.
      for (let tries = 0; tries < 6 && placed.some((a) => Math.abs(a - along) < T.row); tries++) along += T.row * way;
      if (!track.closed && along > track.length - 60) continue;
      if (track.closed) along = ((along % track.length) + track.length) % track.length;
      const hw = track.sampleAt(along).width / 2;
      // Across the canal a pair is 4 radii wide; along it, 2. Turn it if across leaves no room.
      const turned = 2 * hw - 4 * T.radius < T.clear + 12;
      const half = turned ? T.radius : 2 * T.radius;
      // On the boat's line, but with `clear` px free on one side at least.
      let lat = Math.max(-(hw - half - 6), Math.min(hw - half - 6, n.lateral));
      const left = lat - half + hw, right = hw - lat - half;
      if (left < T.clear && right < T.clear) lat = left > right ? -hw + T.clear + half : hw - T.clear - half;
      const p = track.pointAt(along, lat);
      placed.push(along);
      this.boobs.push({ id: this.nextId++, owner: r.id, target: o.id, x: p.x, y: p.y, heading: p.heading, turned, age: 0, hit: [], dead: false });
    }
  }

  /** The solid shape of a pair: a capsule across the canal through both breasts. */
  boobsCapsule(b: Boobs): Capsule {
    const R = TUNING.titten.radius;
    // the line through both breasts: across the canal, or along it when turned
    const nx = b.turned ? Math.cos(b.heading) : -Math.sin(b.heading), ny = b.turned ? Math.sin(b.heading) : Math.cos(b.heading);
    return { ax: b.x - nx * R, ay: b.y - ny * R, bx: b.x + nx * R, by: b.y + ny * R, radius: R };
  }

  private spawnPuddle(x: number, y: number, owner: number): void {
    this.puddles.push({ id: this.nextId++, owner, x, y, age: 0, boatsStuck: new Set(), dead: false });
  }

  /**
   * Battle aim assist: a shot fired roughly at an opponent (within BATTLE.aimCone of `heading`, in
   * range) goes straight at where it is heading. Steering at a boat crossing your bow with one
   * finger is hard; in a race everything goes the same way, so there is none.
   */
  aimed(r: Racer, heading: number): number {
    if (!this.sim.battle) return heading;
    const back = Math.abs(angleDiff(heading, r.heading)) > Math.PI / 2;
    const o = this.nearestFoe(r, back ? 'backward' : 'forward', BATTLE.aimCone, BATTLE.aimRange);
    if (!o) return heading;
    // a little ahead of it, the way it is going
    const lead = Math.hypot(o.x - r.x, o.y - r.y) / 900;
    const a = Math.atan2(o.y + o.vy * lead - r.y, o.x + o.vx * lead - r.x);
    return Math.abs(angleDiff(a, heading)) <= BATTLE.aimCone * 1.3 ? a : heading;
  }

  /**
   * The nearest opponent in front of `r` (or behind), within `range` px and a cone of `halfAngle`
   * radians either side of the bow (or stern). Battles aim with it: there is no "boat ahead".
   */
  nearestFoe(r: Racer, dir: 'forward' | 'backward', halfAngle: number, range: number): Racer | null {
    const h = dir === 'forward' ? r.heading : r.heading + Math.PI;
    const hx = Math.cos(h), hy = Math.sin(h), cos = Math.cos(halfAngle);
    let best: Racer | null = null, bestD = range;
    for (const o of this.sim.racers) {
      if (this.sim.allied(r.id, o.id) || o.sinkTimer > 0 || o.finished) continue;
      const dx = o.x - r.x, dy = o.y - r.y, d = Math.hypot(dx, dy);
      if (d < bestD && d > 1 && (dx * hx + dy * hy) / d >= cos) {
        best = o;
        bestD = d;
      }
    }
    return best;
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
    this.updateBoobs(dt);
    this.updateFakeCrates(dt);
    this.updatePuddles(dt);
    this.updateFlushing(dt);
    this.updateClouds(dt);
    this.updateKarcher(dt);
    this.updateVacuum(dt);
    this.updateCircularSaws();
    this.updateStairs(dt);
    if (!this.sim.battle) this.updateDrops(dt); // crates tossed to the boats behind: a race thing
    this.stopAtBarges();
    this.volunteers = this.volunteers.filter((v) => !v.dead);
    this.drills = this.drills.filter((d) => !d.dead);
    this.puddles = this.puddles.filter((p) => !p.dead);
    this.blobs = this.blobs.filter((b) => !b.dead);
    this.fakeCrates = this.fakeCrates.filter((f) => !f.dead);
    this.shots = this.shots.filter((s) => !s.dead);
    this.clouds = this.clouds.filter((c) => !c.dead);
    this.boobs = this.boobs.filter((b) => !b.dead);
    this.drops = this.drops.filter((d) => !d.dead);
    this.stairs = this.stairs.filter((s) => !s.dead);
  }

  /** Where a circular saw's blade is: running round the hull, `gap` px out from it. */
  sawPosition(r: Racer): { x: number; y: number; angle: number } | null {
    const e = r.effects.find((x) => x.kind === 'circularSaw' && x.remaining > 0);
    if (!e) return null;
    const C = TUNING.circularSaw;
    const angle = (e.duration - e.remaining) * C.spin;
    const a = (r.boat.size.length * r.size) / 2 + C.gap, b = (r.boat.size.width * r.size) / 2 + C.gap;
    const lx = Math.cos(angle) * a, ly = Math.sin(angle) * b;
    const hx = Math.cos(r.heading), hy = Math.sin(r.heading);
    return { x: r.x + lx * hx - ly * hy, y: r.y + lx * hy + ly * hx, angle };
  }

  /** Circular saws hurt every boat their blade touches (each one again only after a moment). */
  private updateCircularSaws(): void {
    const C = TUNING.circularSaw;
    for (const r of this.sim.racers) {
      const p = this.sawPosition(r);
      if (!p || r.sinkTimer > 0) continue;
      for (const o of this.sim.racers) {
        if (this.sim.allied(r.id, o.id) || this.sim.isIntangible(o) || !isTouching(o, p.x, p.y, C.radius)) continue;
        const key = `${r.id}-${o.id}`;
        if (this.sim.time - (this.sawHits.get(key) ?? -99) < C.every) continue;
        this.sawHits.set(key, this.sim.time);
        this.sim.hit(o, C.damage, r.id, 'circularSaw');
      }
    }
  }

  /**
   * Motorized stairs: where they stand and how far they are unfolded (0..1). The base is on the
   * bank; unfolded, they reach `reach` of the way across the canal.
   */
  stairsGeometry(s: Stairs): { base: { x: number; y: number }; tip: { x: number; y: number }; open: number; heading: number } | null {
    if (s.along < 0) return null;
    const T = TUNING.stairs, track = this.sim.track;
    const t = s.age - T.warn;
    const open = t < T.unfold ? t / T.unfold : t < T.unfold + T.life ? 1 : Math.max(0, 1 - (t - T.unfold - T.life) / T.unfold);
    const hw = track.sampleAt(s.along).width / 2;
    const base = track.pointAt(s.along, s.side * hw);
    const full = track.pointAt(s.along, s.side * (hw - 2 * hw * T.reach));
    const tip = { x: base.x + (full.x - base.x) * open, y: base.y + (full.y - base.y) * open };
    return { base, tip, open, heading: base.heading };
  }

  /** The stairs come out once the warning is over, unfold, stand in the way, and fold back. */
  private updateStairs(dt: number): void {
    const T = TUNING.stairs, track = this.sim.track;
    for (const s of this.stairs) {
      s.age += dt;
      if (s.age > T.warn + 2 * T.unfold + T.life) s.dead = true;
      if (s.dead || s.age < T.warn) continue;
      if (s.along < 0) {
        const o = this.sim.racers[s.target];
        if (o.finished) {
          s.dead = true;
          continue;
        }
        // In front of the boat as it is now (it couldn't see a thing until then).
        let along = track.alongOf(o.progress) + T.ahead * this.sim.facing(o);
        if (track.closed) along = ((along % track.length) + track.length) % track.length;
        else if (along > track.length - 100) {
          s.dead = true;
          continue;
        }
        s.along = along;
      }
      const g = this.stairsGeometry(s)!;
      if (g.open < 0.15) continue;
      const cap = { ax: g.base.x, ay: g.base.y, bx: g.tip.x, by: g.tip.y, radius: T.radius };
      for (const r of this.sim.racers) {
        if (r.sinkTimer > 0 || this.sim.isGhost(r)) continue;
        const impact = resolveStatic(r, cap, 0, 0);
        if (impact > 40 && !s.hit.includes(r.id) && !hasEffect(r, 'invulnerable')) {
          s.hit.push(r.id);
          this.sim.hit(r, T.damage, s.owner, 'stairs');
        }
      }
    }
  }

  /** Whether a circle at (x, y) touches a barge. */
  private onBarge(x: number, y: number, radius: number): boolean {
    for (const p of this.sim.trafficPoses) if (p.solid && touchesCapsule(x, y, radius, bargeCapsule(p))) return true;
    return false;
  }

  /** Volunteers, drills, glue balls and raclette shots stop against a barge (glue lands on the water beside it). */
  private stopAtBarges(): void {
    for (const v of this.volunteers) if (!v.dead && this.onBarge(v.x, v.y, 8)) v.dead = true;
    for (const d of this.drills) if (!d.dead && d.mounted <= 0 && d.stuckT <= 0 && this.onBarge(d.x, d.y, 6)) d.stuckT = 0.001;
    for (const s of this.shots) if (!s.dead && this.onBarge(s.x, s.y, 8)) s.dead = true;
    for (const b of this.blobs) {
      if (b.dead || !this.onBarge(b.x, b.y, 8)) continue;
      this.spawnPuddle(b.x - Math.cos(b.heading) * 30, b.y - Math.sin(b.heading) * 30, b.owner);
      b.dead = true;
    }
  }

  /** Open a crate for `r`: the roulette starts if a slot is free and none is spinning. */
  private openCrate(r: Racer, power = false): void {
    if (this.freeSlot(r) < 0 || r.rouletteItem) return;
    const leader = this.sim.racers.reduce((m, o) => Math.max(m, o.progress), -Infinity);
    const battle = !!this.sim.battle;
    const farBehind = !battle && leader - r.progress > this.sim.track.lapLength;
    // A battle: the same odds for everyone whatever the score (BATTLE_ODDS); a golden crate, only
    // the strongest items. A race: by place.
    const item = drawItem(this.sim.rng, {
      position: r.position,
      count: this.sim.racers.length,
      farBehind,
      volunteersInFlight: this.volunteersInFlight,
      recentItems: r.recentItems,
      excluded: battle ? BATTLE_EXCLUDED : undefined,
      table: battle ? (power ? GOLDEN_ODDS : BATTLE_ODDS) : undefined,
    });
    r.rouletteItem = this.sim.forcedItem ?? item;
    // The better version: always from a golden crate; in a battle, the same chance for everyone.
    const id = r.rouletteItem;
    r.rouletteTriple = ITEM_INFO[id].uses < 3 && (power
      || (battle ? this.sim.rng.next() < (GLOBAL_ITEMS.includes(id) ? BATTLE_TRIPLE.global : BATTLE_TRIPLE.normal) : this.rollTriple(id, r.position, farBehind)));
    r.rouletteT = TUNING.rouletteTime;
    this.sim.emit({ type: 'itemPickup', racer: r.id, item: r.rouletteItem });
  }

  /** Whether an item comes as its better version (three uses): likelier further back, never for the leader. */
  private rollTriple(id: ItemId, position: number, farBehind: boolean): boolean {
    if (ITEM_INFO[id].uses >= 3) return false;
    const col = farBehind ? 3 : oddsColumn(position, this.sim.racers.length);
    const odds = (GLOBAL_ITEMS.includes(id) ? TRIPLE_ODDS.global : TRIPLE_ODDS.normal)[col];
    return odds > 0 && this.sim.rng.next() < odds;
  }

  /**
   * Barges help the boats behind: now and then one tosses a crate ahead of a nearby boat that
   * isn't leading and has a free slot. The leader can never pick these up, and no crate is
   * thrown where the leader is close.
   */
  private updateDrops(dt: number): void {
    const T = TUNING.traffic, sim = this.sim, track = sim.track;
    if (sim.phase !== 'racing') return;
    for (const d of this.drops) {
      d.age += dt;
      if (d.age > T.dropLife) d.dead = true;
      if (d.dead || d.age < T.tossTime) continue;
      for (const r of sim.racers) {
        if (r.position === 0 || r.sinkTimer > 0 || sim.isGhost(r) || this.freeSlot(r) < 0 || r.rouletteItem) continue;
        if (!isTouching(r, d.x, d.y, TUNING.crateRadius - r.stats.radius * 0.4)) continue;
        d.dead = true;
        this.openCrate(r);
        break;
      }
    }
    const leader = sim.racers.find((r) => r.position === 0);
    for (const b of sim.traffic.barges) {
      b.dropT -= dt;
      if (b.dropT > 0) continue;
      b.dropT = 1; // look again in a second
      const p = sim.trafficPoses.find((q) => q.id === b.id);
      if (!p || p.alpha < 1) continue;
      let target: Racer | null = null;
      let best = T.dropRange;
      for (const r of sim.racers) {
        if (r.position === 0 || r.finished || r.sinkTimer > 0 || this.freeSlot(r) < 0 || r.rouletteItem) continue;
        if (sim.time - (this.droppedFor.get(r.id) ?? -99) < T.dropEvery) continue;
        const d = Math.hypot(r.x - p.x, r.y - p.y);
        if (d < best) {
          best = d;
          target = r;
        }
      }
      if (!target) continue;
      // Ahead of the boat, in its line, clear of the barge.
      const along = track.alongOf(target.progress) + T.dropAhead;
      const n = track.nearest(target.x, target.y, target.nearestIndex);
      const hw = track.sampleAt(along).width / 2;
      let lat = clamp(n.lateral, -hw + 30, hw - 30);
      let spot = track.pointAt(along, lat);
      if (this.onBarge(spot.x, spot.y, 40)) {
        lat = clamp(-Math.sign(p.lat || 1) * hw * 0.45, -hw + 30, hw - 30);
        spot = track.pointAt(along, lat);
      }
      if (this.onBarge(spot.x, spot.y, 30)) continue;
      if (!track.closed && (along < 0 || along > track.length)) continue;
      if (leader && Math.hypot(leader.x - spot.x, leader.y - spot.y) < T.leaderClear) continue;
      this.drops.push({ id: this.nextId++, kind: 0, x: spot.x, y: spot.y, fromX: p.x, fromY: p.y, age: 0, target: target.id, dead: false });
      this.droppedFor.set(target.id, sim.time);
      b.dropT = T.dropCooldown;
      sim.emit({ type: 'drop', racer: target.id, id: this.nextId - 1 });
    }
    this.pushCrates(dt, leader);
  }

  /** Someone on the towpath pushes a crate into the water ahead of a boat that is behind. */
  private pushCrates(dt: number, leader: Racer | undefined): void {
    const T = TUNING.traffic, P = TUNING.pushers, sim = this.sim, track = sim.track;
    if (sim.time < P.startAfter) return;
    for (const r of sim.racers) {
      if (r.position === 0 || r.finished || r.sinkTimer > 0 || this.freeSlot(r) < 0 || r.rouletteItem) continue;
      if (sim.time - (this.droppedFor.get(r.id) ?? -99) < T.dropEvery) continue;
      if (!sim.rng.chance(dt / P.every)) continue;
      const along = track.alongOf(r.progress) + P.ahead;
      if (!track.closed && along > track.length - 100) continue;
      const hw = track.sampleAt(along).width / 2;
      const side = sim.rng.chance(0.5) ? 1 : -1;
      // From the towpath, into the water near that bank, ahead of the boat.
      const from = track.pointAt(along, side * (hw + 22));
      const spot = track.pointAt(along + 30, side * Math.max(0, hw - 48));
      if (this.onBarge(spot.x, spot.y, 40)) continue;
      if (leader && Math.hypot(leader.x - spot.x, leader.y - spot.y) < T.leaderClear) continue;
      this.drops.push({ id: this.nextId++, kind: 1, x: spot.x, y: spot.y, fromX: from.x, fromY: from.y, age: 0, target: r.id, dead: false });
      this.droppedFor.set(r.id, sim.time);
      sim.emit({ type: 'drop', racer: r.id, id: this.nextId - 1 });
    }
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
        // (a golden crate needs a free slot: it isn't wasted on a boat that can't take anything)
        if (c.power && (this.freeSlot(r) < 0 || r.rouletteItem)) continue;
        c.respawn = c.power ? BATTLE.powerRespawn : this.sim.battle ? BATTLE.crateRespawn : TUNING.crateRespawn;
        c.x = c.homeX; // it comes back in its place
        c.y = c.homeY;
        this.sim.emit({ type: 'crate', id: c.id, taken: true });
        // A crate only gives something if a slot is free and the roulette isn't already spinning.
        this.openCrate(r, !!c.power);
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
        this.give(r, id, r.rouletteTriple);
        r.rouletteTriple = false;
      }
    }
  }

  /**
   * Things fixed to a boat that cut or ram: the jigsaw's saws, out of each side and on the bow, cut
   * boats alongside and ahead; the dildo on the bow hurts whoever it rams, and smashes whatever flies into it.
   * Each boat is hurt once per use.
   */
  private updateJigsaw(): void {
    for (const r of this.sim.racers) {
      if (r.sinkTimer > 0) continue;
      const saw = hasEffect(r, 'jigsaw'), dildo = hasEffect(r, 'dildo');
      if (!saw && !dildo) continue;
      const hx = Math.cos(r.heading), hy = Math.sin(r.heading);
      const rel = (x: number, y: number): { f: number; p: number } => {
        const dx = x - r.x, dy = y - r.y;
        return { f: dx * hx + dy * hy, p: -dx * hy + dy * hx };
      };
      // The saws: beside the hull, along its middle half, out to `reach` past its side.
      const J = TUNING.jigsaw;
      const halfLen = r.boat.size.length * 0.3;
      const sideOf = r.stats.capRadius;
      const bySaw = (x: number, y: number, slack: number): boolean => {
        const q = rel(x, y);
        return Math.abs(q.f) < halfLen + slack && Math.abs(q.p) > sideOf - slack && Math.abs(q.p) < sideOf + J.reach + slack;
      };
      // The dildo: a cone ahead of the bow.
      const D = TUNING.dildo;
      const reach = r.boat.size.length * D.reachMult, tan = Math.tan(D.halfAngle);
      const byDildo = (x: number, y: number, slack: number): boolean => {
        const q = rel(x, y);
        return q.f > 0 && q.f < reach + slack && Math.abs(q.p) < q.f * tan + slack * 0.8;
      };
      // ...and the one on the bow: a cone ahead.
      const sawReach = r.boat.size.length * J.reachMult, sawTan = Math.tan(J.halfAngle);
      const byBowSaw = (x: number, y: number, slack: number): boolean => {
        const q = rel(x, y);
        return q.f > 0 && q.f < sawReach + slack && Math.abs(q.p) < q.f * sawTan + slack * 0.8;
      };
      for (const o of this.sim.racers) {
        if (this.sim.allied(r.id, o.id) || o.sinkTimer > 0 || r.jigsawHit.has(o.id)) continue;
        if (saw && (bySaw(o.x, o.y, o.stats.capRadius) || byBowSaw(o.x, o.y, o.stats.radius))) {
          r.jigsawHit.add(o.id);
          this.sim.hit(o, J.damage, r.id, 'jigsaw');
        } else if (dildo && byDildo(o.x, o.y, o.stats.radius)) {
          r.jigsawHit.add(o.id);
          this.sim.hit(o, D.damage, r.id, 'dildo');
        }
      }
      if (!dildo) continue;
      for (const v of this.volunteers) if (!this.sim.allied(v.owner, r.id) && byDildo(v.x, v.y, 12)) v.dead = true;
      for (const d of this.drills) if (!this.sim.allied(d.owner, r.id) && d.mounted <= 0 && byDildo(d.x, d.y, 12)) d.dead = true;
      for (const b of this.blobs) if (!this.sim.allied(b.owner, r.id) && byDildo(b.x, b.y, 12)) b.dead = true;
      for (const s of this.shots) if (!this.sim.allied(s.owner, r.id) && s.wait <= 0 && byDildo(s.x, s.y, 12)) s.dead = true;
      for (const f of this.fakeCrates) if (!this.sim.allied(f.owner, r.id) && byDildo(f.x, f.y, TUNING.fakeCrate.radius)) f.dead = true;
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
        if (r.sinkTimer > 0 || this.sim.spares(r, v.owner, v.age < 0.6)) continue;
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
    const D = TUNING.drill;
    const speed = FASTEST_TOP_SPEED * D.speedMult;
    for (const d of this.drills) {
      if (d.dead) continue;
      if (d.mounted > 0) {
        // On the bow (or stern), spinning: it goes where the boat goes and hurts whoever it rams.
        const o = this.sim.racers[d.owner];
        if (!o || o.sinkTimer > 0) {
          d.dead = true;
          continue;
        }
        d.heading = d.back ? o.heading + Math.PI : o.heading;
        const out = o.boat.size.length / 2 + D.length * 0.5 - 6;
        d.x = o.x + Math.cos(d.heading) * out;
        d.y = o.y + Math.sin(d.heading) * out;
        d.near = o.nearestIndex;
        const tipX = d.x + Math.cos(d.heading) * D.length * 0.4, tipY = d.y + Math.sin(d.heading) * D.length * 0.4;
        for (const r of this.sim.racers) {
          if (this.sim.allied(r.id, o.id) || r.sinkTimer > 0 || d.hit.includes(r.id)) continue;
          if (isTouching(r, tipX, tipY, D.radius) || isTouching(r, d.x, d.y, D.radius)) {
            d.hit.push(r.id);
            this.sim.hit(r, D.mountDamage, d.owner, 'drill');
          }
        }
        d.mounted -= dt;
        if (d.mounted <= 0) {
          // Off it goes, straight ahead, from where it is.
          d.mounted = 0;
          d.age = 0;
          d.heading = this.aimed(o, d.heading);
        }
        continue;
      }
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
        if (r.sinkTimer > 0 || this.sim.spares(r, d.owner, d.age < 0.5)) continue;
        if (isTouching(r, d.x, d.y, D.radius)) {
          this.sim.hit(r, D.damage, d.owner, 'drill');
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
        if (r.sinkTimer > 0 || this.sim.isGhost(r) || this.sim.spares(r, b.owner, b.age < TUNING.silicone.ownerImmunity)) continue;
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

  /** Potato and ham (they cover the boat they hit in cheese), and nails: straight shots that hit the first boat. */
  private updateShots(dt: number): void {
    const R = TUNING.raclette, N = TUNING.nail;
    for (const s of this.shots) {
      if (s.dead) continue;
      if (s.wait > 0) {
        // Not fired yet: it waits at the owner's bow (or stern), then flies the way the boat points.
        s.wait -= dt;
        const o = this.sim.racers[s.owner];
        if (!o || o.sinkTimer > 0) {
          s.dead = true;
          continue;
        }
        const back = Math.cos(s.heading - o.heading) < 0;
        s.heading = back ? o.heading + Math.PI : o.heading;
        const bow = o.boat.size.length / 2 + 12;
        s.x = o.x + Math.cos(s.heading) * bow;
        s.y = o.y + Math.sin(s.heading) * bow;
        s.near = o.nearestIndex;
        if (s.wait > 0) continue;
        s.heading = this.aimed(o, s.heading); // (a battle's aim assist, nail by nail)
      }
      const spec = s.kind === 0 ? R.potato : s.kind === 1 ? R.ham : N;
      const speed = FASTEST_TOP_SPEED * spec.speedMult;
      s.age += dt;
      s.x += Math.cos(s.heading) * speed * dt;
      s.y += Math.sin(s.heading) * speed * dt;
      s.travelled += speed * dt;
      if (s.travelled > (s.kind === 2 ? N.range : R.range)) {
        s.dead = true;
        continue;
      }
      for (const r of this.sim.racers) {
        if (r.sinkTimer > 0 || this.sim.isGhost(r) || this.sim.spares(r, s.owner, s.age < 0.5)) continue;
        if (isTouching(r, s.x, s.y, spec.radius)) {
          if (s.kind === 2) this.sim.prick(r, N.damage, s.owner, N.slow);
          else if (this.sim.hit(r, spec.damage, s.owner, 'raclette')) addEffect(r, 'cheesed', R.splashTime);
          s.dead = true;
          break;
        }
      }
      if (!s.dead && this.outOfWater(s, 0)) s.dead = true;
    }
  }

  /**
   * Dicke Titten: they fall for `warn` s (not solid yet), then lie on the water, solid: a boat
   * running into them bounces off and is hurt (once). Their owner passes through.
   */
  private updateBoobs(dt: number): void {
    const T = TUNING.titten;
    for (const b of this.boobs) {
      b.age += dt;
      if (b.age > T.warn + T.life) b.dead = true;
      if (b.dead || b.age < T.warn) continue;
      const cap = this.boobsCapsule(b);
      for (const r of this.sim.racers) {
        if (this.sim.allied(r.id, b.owner) || r.sinkTimer > 0 || this.sim.isGhost(r)) continue;
        const impact = resolveStatic(r, cap, 0, 0);
        if (impact > 0 && !b.hit.includes(r.id)) {
          b.hit.push(r.id);
          this.sim.hit(r, T.damage, b.owner, 'titten');
        }
      }
      // Things flying into them stop there.
      for (const v of this.volunteers) if (!v.dead && touchesCapsule(v.x, v.y, 8, cap)) v.dead = true;
      for (const d of this.drills) if (!d.dead && d.mounted <= 0 && d.stuckT <= 0 && touchesCapsule(d.x, d.y, 6, cap)) d.stuckT = 0.001;
      for (const s of this.shots) if (!s.dead && s.wait <= 0 && touchesCapsule(s.x, s.y, 6, cap)) s.dead = true;
    }
  }

  /** A clogged toilet keeps going: a cloud of smoke every `every` s behind the boat, a trail. */
  /** Trails: toxic smoke behind a flushing boat, wet paint behind a painting one. */
  private updateFlushing(dt: number): void {
    const T = TUNING.toilet, P = TUNING.paint;
    for (const r of this.sim.racers) {
      if (r.sinkTimer > 0) continue;
      for (const [effect, times, every, kind, radius] of [['flushing', this.flushT, T.every, 1, T.radius], ['painting', this.paintT, P.every, 2, P.radius]] as const) {
        if (!hasEffect(r, effect)) continue;
        const t = (times.get(r.id) ?? 0) + dt;
        if (t >= every) {
          this.dropCloud(r, kind, radius);
          times.set(r.id, t - every);
        } else times.set(r.id, t);
      }
    }
  }

  /** Melted cheese covers whoever drives through it; toxic smoke hurts them, the owner too after a moment. */
  private updateClouds(dt: number): void {
    const R = TUNING.raclette, T = TUNING.toilet, P = TUNING.paint;
    // Smoke hurts once per step, however many clouds of a trail a boat is in.
    const smoked = new Set<number>();
    for (const c of this.clouds) {
      c.age += dt;
      const [radius, life, immunity] = c.kind === 0 ? [R.cheeseRadius, R.cheeseLife, R.cheeseOwnerImmunity] : c.kind === 1 ? [T.radius, T.life, T.ownerImmunity] : [P.radius, P.life, P.ownerImmunity];
      if (c.age > life) c.dead = true;
      if (c.dead) continue;
      const grow = Math.min(1, c.age / 0.4);
      for (const r of this.sim.racers) {
        if (r.sinkTimer > 0 || this.sim.isGhost(r) || this.sim.spares(r, c.owner, c.age < immunity)) continue;
        const rr = radius * grow + r.stats.radius * 0.4;
        if ((r.x - c.x) ** 2 + (r.y - c.y) ** 2 > rr * rr) continue;
        if (c.kind === 0) {
          addEffect(r, 'cheesed', R.cheeseTime);
          continue;
        }
        if (c.kind === 2) {
          // Wet paint: splashed all over the screen, once. While it's on, more paint changes
          // nothing (it used to start the splash again at every spot of a trail).
          if (hasEffect(r, 'painted')) continue;
          this.sim.emit({ type: 'painted', racer: r.id, by: c.owner });
          addEffect(r, 'painted', P.paintTime);
          continue;
        }
        if (smoked.has(r.id)) continue;
        smoked.add(r.id);
        if (this.sim.poison(r, T.dps * dt) && this.sim.time - (this.toxicAt.get(r.id) ?? -99) >= T.feedbackEvery) {
          this.toxicAt.set(r.id, this.sim.time);
          this.sim.emit({ type: 'hit', racer: r.id, by: c.owner, source: 'toilet', damage: T.dps * T.feedbackEvery });
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
      const base = (r.boat.size.length * K.base) / 2;
      for (const o of this.sim.racers) {
        if (this.sim.allied(r.id, o.id) || o.sinkTimer > 0 || o.finished || this.sim.isGhost(o)) continue;
        const dx = o.x - r.x, dy = o.y - r.y;
        const f = dx * hx + dy * hy;
        const p = dx * nx + dy * ny;
        const gap = Math.abs(p) - r.stats.capRadius - o.stats.capRadius;
        // In the fan: alongside the middle of the boat, a little wider further out.
        if (gap > K.reach || Math.abs(f) > base + K.spread * Math.max(0, gap) + o.stats.capRadius) continue;
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

  /** Vacuum cleaner: boats ahead, in a wide cone, are pulled towards the user (the lighter, the harder). */
  private updateVacuum(dt: number): void {
    const V = TUNING.vacuum;
    const cos = Math.cos(V.halfAngle);
    for (const r of this.sim.racers) {
      if (!hasEffect(r, 'vacuum') || r.sinkTimer > 0) continue;
      const hx = Math.cos(r.heading), hy = Math.sin(r.heading);
      for (const o of this.sim.racers) {
        if (this.sim.allied(r.id, o.id) || o.sinkTimer > 0 || o.finished || this.sim.isGhost(o)) continue;
        const dx = o.x - r.x, dy = o.y - r.y;
        const d = Math.hypot(dx, dy);
        if (d < 1 || d > V.range || (dx * hx + dy * hy) / d < cos) continue;
        const ux = -dx / d, uy = -dy / d; // towards the nozzle
        const toward = o.vx * ux + o.vy * uy;
        if (toward > V.maxPullSpeed) continue;
        const a = ((V.pull * (1 - 0.5 * (d / V.range))) / o.stats.mass) * dt;
        o.vx += ux * a;
        o.vy += uy * a;
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
        if (r.sinkTimer > 0 || this.sim.isGhost(r) || this.sim.spares(r, f.owner, f.age < TUNING.fakeCrate.ownerImmunity)) continue;
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
        if (this.sim.spares(r, p.owner, p.age < TUNING.glue.ownerImmunity)) continue;
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
