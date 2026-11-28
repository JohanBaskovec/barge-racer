import { BOATS, type BoatDef, deriveStats, getBoat } from '../data/boats';
import { DIFFICULTIES, type Difficulty } from '../data/difficulty';
import { type ItemId, TUNING } from '../data/items';
import { addEffect, hasEffect, removeEffect, tickEffects } from '../effects/effects';
import { ItemSystem } from '../items/ItemSystem';
import { HazardSystem } from './hazards';
import { BATTLE, BattleSystem, type GameMode, TEAM_COLORS, isBattle } from './battle';
import { setRacerSize, stepBoat } from '../physics/BoatPhysics';
import { resolveBank, resolveBoatPair, resolveStatic } from '../physics/collisions';
import { type BargePose, Traffic, bargeCapsule } from './traffic';
import { applyWater } from './water';
import { AIController } from '../control/AIController';
import { Rng } from '../physics/math';
import type { Track } from '../track/Track';
import type { Controller, ControlIntent, HitSource, Racer, RaceEvent } from './types';

export const STEP = 1 / 60;
/** How fast a boat shrinks and grows back, in size per second. */
const SIZE_RATE = 1.8;
export const RACER_COLORS = [0xff5a4d, 0x4da3ff, 0xffd23f, 0x62d26f, 0xb36bff, 0xff9a3c, 0xff6fb5, 0x3fd6c8];
export const AI_NAMES = ['Captain Bob', 'Molly Moor', 'Dredge', 'Admiral Fizz', 'Bilge', 'Skipper Sue'];
/** Starting slots behind the line, two abreast; rows are far enough apart for the longest boat (150 px). */
const GRID = [
  { along: -90, across: -60 },
  { along: -90, across: 60 },
  { along: -255, across: -60 },
  { along: -255, across: 60 },
  { along: -420, across: -60 },
  { along: -420, across: 60 },
  { along: -585, across: -60 },
  { along: -585, across: 60 },
];

export interface RaceSetup {
  track: Track;
  /** Single player: the player's boat; null = no player (all AI, headless tests). Unused with a roster. */
  playerBoat?: string | null;
  difficulty: Difficulty;
  seed: number;
  aiCount?: number;
  forcedItem?: ItemId | null;
  /** Overrides the player's controller (the view supplies a pointer controller). */
  playerController?: Controller;
  /**
   * Multiplayer: the exact starting grid, in order. Humans bring their own controller (a network
   * input queue on the server); seats without one are driven by the AI. Replaces playerBoat/aiCount.
   */
  roster?: RosterEntry[];
  /** With a roster: which racer this screen follows (isPlayer). Defaults to the first human. */
  localRacer?: number;
  /** A race (default) or a battle mode on an arena. */
  mode?: GameMode;
  /** Team modes: each boat's team (0 Corsica, 1 Brittany), by grid order; default alternate. */
  teams?: number[];
}

export interface RosterEntry {
  name: string;
  boatId: string;
  human: boolean;
  controller?: Controller;
}

/** Multiplayer: once the first person finishes, the others have this long before the race ends. */
export const FINISH_GRACE = 30;

export interface RaceResult {
  racer: Racer;
  time: number;
  finished: boolean;
}

export class RaceSimulation {
  readonly track: Track;
  readonly rng: Rng;
  readonly racers: Racer[] = [];
  readonly items: ItemSystem;
  /** Police and anglers for the leader; birds, rowers and swimmers for everyone. */
  readonly hazards: HazardSystem;
  readonly difficulty: Difficulty;
  readonly forcedItem: ItemId | null;
  player: Racer | null = null;

  /** Battle modes: scores, flags, respawns (null in a race). */
  readonly battle: BattleSystem | null = null;
  /** Barges going up and down the canal. */
  readonly traffic: Traffic;
  /** Where they are this step. */
  trafficPoses: BargePose[] = [];
  /** Simulation steps since the race was set up (countdown included): the traffic's clock. */
  steps = 0;
  phase: 'countdown' | 'racing' | 'over' = 'countdown';
  countdownT = 3.2;
  /** Seconds since GO. */
  time = 0;
  private lastCountdown = 4;
  private startBoostDone = false;
  private endTimer = -1;
  /** Multiplayer: seconds left for the others once the first person has finished (-1 = not started). */
  finishCountdown = -1;
  private controllers = new Map<number, Controller>();
  private autopilots = new Map<number, Controller>();
  private tugs = new Map<number, Controller>();
  private events: RaceEvent[] = [];

  constructor(setup: RaceSetup) {
    this.track = setup.track;
    this.rng = new Rng(setup.seed);
    this.difficulty = setup.difficulty;
    this.forcedItem = setup.forcedItem ?? null;
    const diff = DIFFICULTIES[setup.difficulty];

    const boats: { boat: BoatDef; isPlayer: boolean; human: boolean; name: string; controller?: Controller }[] = [];
    if (setup.roster) {
      const local = setup.localRacer ?? setup.roster.findIndex((e) => e.human);
      setup.roster.forEach((e, i) => boats.push({ boat: getBoat(e.boatId), isPlayer: i === local, human: e.human, name: e.name, controller: e.controller }));
    } else this.buildSinglePlayerGrid(setup, boats);

    boats.forEach((b, i) => {
      const slot = GRID[i % GRID.length];
      const p = this.track.pointAt(this.track.alongOf(slot.along), slot.across);
      const r = this.makeRacer(i, b.boat, b.name, b.isPlayer, p.x, p.y, p.heading, slot.along);
      r.human = b.human;
      this.racers.push(r);
      if (b.isPlayer) this.player = r;
      const own = b.controller ?? (b.isPlayer && !setup.roster ? setup.playerController : undefined);
      this.controllers.set(r.id, own ?? new AIController(this.rng, diff, b.isPlayer ? 0 : this.rng.range(-0.25, 0.25)));
    });
    if (setup.roster && !this.player) this.player = this.racers.find((r) => r.human) ?? null;
    // A battle: boats start at their bases (or round the arena), in their team's colours.
    if (isBattle(setup.mode)) {
      const battle = new BattleSystem(this, setup.mode as Exclude<GameMode, 'race'>, setup.teams);
      this.battle = battle;
      for (const r of this.racers) {
        const p = battle.startSpot(r.id);
        r.x = p.x;
        r.y = p.y;
        r.heading = p.heading;
        r.nearestIndex = this.track.nearest(p.x, p.y, -1).index;
        if (battle.teams[r.id] >= 0) r.color = TEAM_COLORS[battle.teams[r.id]];
      }
    }
    // Its own random numbers, so the traffic is the same on every screen whatever else happens.
    this.traffic = new Traffic(this.track, (setup.seed ^ 0x5eed) >>> 0);
    this.trafficPoses = this.traffic.poses(0);
    this.items = new ItemSystem(this);
    this.hazards = new HazardSystem(this);
    this.updateRanking();
  }

  /** One player (or none, for headless tests) against AI boats with random boats and names. */
  private buildSinglePlayerGrid(setup: RaceSetup, boats: { boat: BoatDef; isPlayer: boolean; human: boolean; name: string }[]): void {
    if (setup.playerBoat) boats.push({ boat: getBoat(setup.playerBoat), isPlayer: true, human: true, name: 'You' });
    const pool = BOATS.map((b) => b.id).filter((id) => id !== setup.playerBoat);
    const aiCount = setup.aiCount ?? (setup.playerBoat ? 3 : 4);
    const names = [...AI_NAMES];
    for (let i = 0; i < aiCount; i++) {
      const idx = this.rng.int(0, pool.length - 1);
      const [id] = pool.splice(idx, 1);
      const nameIdx = this.rng.int(0, names.length - 1);
      const [name] = names.splice(nameIdx, 1);
      boats.push({ boat: getBoat(id), isPlayer: false, human: false, name });
    }
    // Put the player on the grid in third place.
    const pi = boats.findIndex((b) => b.isPlayer);
    if (pi >= 0 && boats.length > 2) boats.splice(2, 0, boats.splice(pi, 1)[0]);
  }

  /**
   * Swap who drives a racer. Multiplayer: a player who leaves is replaced by the AI (the boat stops
   * counting as human, so the race doesn't wait for it), and gets it back if they reconnect. With
   * `stillHuman` the AI only stands in for a player whose controls stopped arriving for a moment.
   */
  setController(id: number, controller: Controller | 'ai', stillHuman = false): void {
    const r = this.racers[id];
    if (!r) return;
    if (controller === 'ai') {
      r.human = stillHuman;
      this.controllers.set(id, new AIController(this.rng, DIFFICULTIES[this.difficulty], 0));
    } else {
      r.human = true;
      this.controllers.set(id, controller);
    }
  }

  private makeRacer(id: number, boat: BoatDef, name: string, isPlayer: boolean, x: number, y: number, heading: number, progress: number): Racer {
    const stats = deriveStats(boat);
    const near = this.track.nearest(x, y, -1);
    return {
      id, name, isPlayer, human: isPlayer, boat, stats, baseStats: stats, size: 1, soakedBy: null, draftT: 0, color: RACER_COLORS[id % RACER_COLORS.length],
      x, y, vx: 0, vy: 0, heading, spin: 0,
      hull: stats.maxHull, effects: [], inGlue: false, sinceHit: 99, sinkTimer: 0,
      slots: [null, null], rouletteT: 0, rouletteItem: null, rouletteTriple: false, recentItems: [], jigsawHit: new Set(),
      progress, nearestIndex: near.index, lapsDone: 0, nextCheckpoint: 0, position: id, finished: false,
      finishTime: 0, lapTimes: [], lapStart: 0, pace: 1, catchUp: 1, autopilot: false, firstFullThrottleT: null,
      bankHitCooldown: 0, stuckTimer: 0, throttle: 0,
    };
  }

  emit(e: RaceEvent): void {
    this.events.push(e);
  }

  takeEvents(): RaceEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** Time relative to GO: negative during the countdown. */
  get clock(): number {
    return this.phase === 'countdown' ? -this.countdownT : this.time;
  }

  step(dt: number): void {
    if (this.phase === 'over') return;
    this.steps++;
    this.trafficPoses = this.traffic.poses(this.steps * STEP);
    this.stepClock(dt);
    const canDrive = this.phase === 'racing';

    if (!this.battle) this.updateCatchUp();

    // 1. Intents
    const intents = new Map<number, ControlIntent>();
    for (const r of this.racers) {
      const ctrl = r.autopilot ? this.autopilot(r) : this.controllers.get(r.id)!;
      let intent = ctrl.update(r, this, dt);
      // A tugboat steers for its owner, who can still fire items.
      if (hasEffect(r, 'towed') && !r.autopilot) intent = { ...this.towIntent(r, dt), fire: intent.fire };
      // Electrical failure freezes the throttle at its last value (stepBoat reads it from here).
      if (!hasEffect(r, 'blackout')) r.throttle = intent.throttle;
      intents.set(r.id, intent);
      if (r.firstFullThrottleT === null && intent.throttle >= 0.8) r.firstFullThrottleT = this.clock;
    }
    if (canDrive && !this.startBoostDone && this.time >= 0.25) {
      this.startBoostDone = true;
      for (const r of this.racers) {
        const t = r.firstFullThrottleT;
        if (t !== null && t >= -0.25 && t <= 0.25) {
          addEffect(r, 'boost', 1);
          this.emit({ type: 'boost', racer: r.id });
        }
      }
    }

    // 2. Effects, sinking, repair
    for (const r of this.racers) {
      tickEffects(r, dt);
      r.sinceHit += dt;
      r.bankHitCooldown -= dt;
      if (r.sinkTimer > 0) {
        r.sinkTimer -= dt;
        if (r.sinkTimer <= 0) this.respawn(r);
      } else if (r.sinceHit > TUNING.repairDelay && r.hull < r.stats.maxHull) {
        r.hull = Math.min(r.stats.maxHull, r.hull + TUNING.repairRate * dt);
      }
      if (hasEffect(r, 'spinOut')) r.spin += dt * 14;
      else r.spin = 0;
      // Mushrooms: shrink and grow back smoothly (the hull collides at its current size).
      const targetSize = (hasEffect(r, 'shrunk') ? TUNING.mushroom.shrink : 1) * (hasEffect(r, 'enlarged') ? TUNING.enlarge.size : 1);
      if (r.size !== targetSize) {
        const step = SIZE_RATE * dt;
        setRacerSize(r, Math.abs(targetSize - r.size) <= step ? targetSize : r.size + Math.sign(targetSize - r.size) * step);
      }
    }

    // 3. Physics and item use
    for (const r of this.racers) {
      if (r.sinkTimer > 0) continue;
      const intent = intents.get(r.id)!;
      stepBoat(r, intent, dt, canDrive);
      if (canDrive && intent.fire && !hasEffect(r, 'spinOut') && !hasEffect(r, 'blackout')) this.items.use(r, intent.fire.slot, intent.fire.dir);
    }
    // Wakes push light boats around; a slipstream speeds a boat up.
    if (canDrive) applyWater(this, dt);

    // 4. Collisions
    for (const r of this.racers) {
      if (r.sinkTimer > 0) continue;
      const impact = resolveBank(r, this.track);
      if (impact > 0) this.crash(r, impact, TUNING.bankHitDamage);
      // Barges are as solid as the bank, and they move.
      if (this.isGhost(r)) continue;
      for (const p of this.trafficPoses) {
        if (!p.solid) continue;
        const hit = resolveStatic(r, bargeCapsule(p), p.vx, p.vy, { x: p.mx, y: p.my });
        if (hit > 0) this.crash(r, hit, TUNING.traffic.bumpDamage);
      }
    }
    for (let i = 0; i < this.racers.length; i++) {
      for (let j = i + 1; j < this.racers.length; j++) {
        const a = this.racers[i];
        const b = this.racers[j];
        if (this.isIntangible(a) || this.isIntangible(b)) continue;
        const s = resolveBoatPair(a, b);
        if (s > 40) this.emit({ type: 'bump', a: a.id, b: b.id, strength: s });
      }
    }

    // 5. Items, entities and hazards
    this.items.update(dt);
    this.hazards.update(dt);

    // 6. Race rules
    for (const r of this.racers) this.updateProgress(r);
    this.updateRanking();
    this.checkEnd(dt);
  }

  private stepClock(dt: number): void {
    if (this.phase === 'countdown') {
      this.countdownT -= dt;
      const v = Math.ceil(this.countdownT) as number;
      if (v < this.lastCountdown && v >= 1 && v <= 3) {
        this.lastCountdown = v;
        this.emit({ type: 'countdown', value: v as 1 | 2 | 3 });
      }
      if (this.countdownT <= 0) {
        this.phase = 'racing';
        this.time = -this.countdownT;
        this.emit({ type: 'countdown', value: 0 });
      }
    } else this.time += dt;
  }

  /**
   * Catch-up: a boat far behind the leader gets a little more top speed, growing with the gap
   * (none within TUNING.catchUp.from px, the most from `full` px). The same for players and AI.
   */
  private updateCatchUp(): void {
    const C = TUNING.catchUp;
    let lead = -Infinity;
    for (const r of this.racers) if (!r.finished && r.progress > lead) lead = r.progress;
    for (const r of this.racers) {
      const gap = r.finished ? 0 : lead - r.progress;
      r.catchUp = 1 + C.max * Math.max(0, Math.min(1, (gap - C.from) / (C.full - C.from)));
    }
  }

  /** How a tugboat steers the boat it tows (also predicted by an online client for its own boat). */
  towIntent(r: Racer, dt: number): ControlIntent {
    let c = this.tugs.get(r.id);
    if (!c) {
      c = new AIController(this.rng, DIFFICULTIES.river, 0, true, true);
      this.tugs.set(r.id, c);
    }
    return c.update(r, this, dt);
  }

  private autopilot(r: Racer): Controller {
    let c = this.autopilots.get(r.id);
    if (!c) {
      c = new AIController(this.rng, DIFFICULTIES.river, 0, true);
      this.autopilots.set(r.id, c);
    }
    return c;
  }

  /**
   * Team battles: whether two boats are on the same side (a boat is its own ally). Items never hurt,
   * slow or aim at an ally of whoever used them.
   */
  allied(a: number, b: number): boolean {
    if (a === b) return true;
    const t = this.battle?.teams;
    return !!t && t[a] >= 0 && t[a] === t[b];
  }

  /**
   * Which way round the loop a boat is going: 1 the track's way, -1 the other. Always 1 in a race;
   * in a battle (boats go both ways round an arena) from its course, or its heading when slow.
   * Items that land "in front of" or "behind" a boat use it.
   */
  facing(r: Racer): 1 | -1 {
    if (!this.battle) return 1;
    const s = this.track.samples[r.nearestIndex];
    const fast = Math.hypot(r.vx, r.vy) > 60;
    const dx = fast ? r.vx : Math.cos(r.heading), dy = fast ? r.vy : Math.sin(r.heading);
    return dx * s.tx + dy * s.ty >= 0 ? 1 : -1;
  }

  /** Spared by something `owner` set off: a team-mate always; the owner itself while `young`. */
  spares(r: Racer, owner: number | null | undefined, young: boolean): boolean {
    if (owner === null || owner === undefined) return false;
    return r.id === owner ? young : this.allied(r.id, owner);
  }

  /** Apply damage, a spin-out and brief invulnerability. Returns true if the hit landed. */
  hit(r: Racer, damage: number, by: number | null, source: HitSource, spin = true): boolean {
    if (hasEffect(r, 'invulnerable') || r.sinkTimer > 0 || this.isGhost(r)) return false;
    if (by !== null && by !== r.id && this.allied(by, r.id)) return false; // no friendly fire
    if (this.popShield(r, source)) return false;
    if (this.battle && source !== 'bank') damage *= BATTLE.damageMult;
    r.hull -= damage;
    r.sinceHit = 0;
    addEffect(r, 'invulnerable', TUNING.hitInvulnerable);
    if (spin) {
      addEffect(r, 'spinOut', TUNING.spinOutBase * r.stats.spinMult);
      r.vx *= 0.3;
      r.vy *= 0.3;
    }
    this.battle?.noteHit(r, by);
    this.emit({ type: 'hit', racer: r.id, by, source, damage });
    if (r.hull <= 0) this.sink(r);
    return true;
  }

  /** A boat ran into the bank or a barge at `impact` px/s. */
  private crash(r: Racer, impact: number, damage: number): void {
    this.emit({ type: 'bank', racer: r.id, strength: impact });
    if (r.bankHitCooldown > 0) return;
    if (this.hazards.hookedCrash(r, impact)) {
      // Dragged into the bank by an angler's line.
      r.bankHitCooldown = 1;
    } else if (hasEffect(r, 'soaked') && impact > r.stats.topSpeed * 0.06) {
      // (even shoved from close by: the jets keep it pinned there)
      // Pushed into it by a Kärcher: a proper crash, and a spin-out.
      r.bankHitCooldown = 1;
      removeEffect(r, 'soaked');
      this.hit(r, TUNING.karcher.crashDamage, r.soakedBy, 'karcher');
    } else if (impact > r.stats.topSpeed * 0.55) {
      r.bankHitCooldown = 1;
      this.hit(r, damage, null, 'bank', false);
    }
  }

  /**
   * Damage over time (toxic smoke): no spin-out and no blinking, so it can be applied every step.
   * Boats that are blinking after a hit, sinking or finished are spared. Returns true if it landed.
   */
  poison(r: Racer, amount: number): boolean {
    if (hasEffect(r, 'invulnerable') || r.sinkTimer > 0 || this.isGhost(r)) return false;
    if (this.battle) amount *= BATTLE.damageMult;
    r.hull -= amount;
    r.sinceHit = 0;
    if (r.hull <= 0) this.sink(r);
    return true;
  }

  /**
   * A beer dispenser's head of foam takes a hit instead of the boat (not a bump on the bank): it
   * bursts, and the boat blinks as if hit, so the same thing can't hurt it a moment later.
   */
  popShield(r: Racer, source: HitSource): boolean {
    if (source === 'bank' || !hasEffect(r, 'shielded')) return false;
    removeEffect(r, 'shielded');
    addEffect(r, 'invulnerable', TUNING.hitInvulnerable);
    this.emit({ type: 'shieldPop', racer: r.id });
    return true;
  }

  /**
   * A nail: damage and a jolt, but no spin-out and no blinking, so the next nail of the burst can
   * hurt too. Spared like a hit (blinking, sinking, finished). Returns true if it landed.
   */
  prick(r: Racer, damage: number, by: number, slow: number): boolean {
    if (hasEffect(r, 'invulnerable') || r.sinkTimer > 0 || this.isGhost(r)) return false;
    if (by !== r.id && this.allied(by, r.id)) return false;
    if (this.popShield(r, 'nailGun')) return false;
    if (this.battle) damage *= BATTLE.damageMult;
    r.hull -= damage;
    r.sinceHit = 0;
    r.vx *= slow;
    r.vy *= slow;
    this.battle?.noteHit(r, by);
    this.emit({ type: 'hit', racer: r.id, by, source: 'nailGun', damage });
    if (r.hull <= 0) this.sink(r);
    return true;
  }

  private sink(r: Racer): void {
    r.hull = 0;
    r.sinkTimer = TUNING.sinkTime;
    removeEffect(r, 'spinOut');
    addEffect(r, 'sinking', TUNING.sinkTime);
    r.vx = r.vy = 0;
    this.emit({ type: 'sunk', racer: r.id });
    this.battle?.onSunk(r);
  }

  /** Put a boat back on the centre line with full hull (after sinking or when stuck). */
  respawn(r: Racer): void {
    if (this.battle) {
      // A battle: back at the team's base, or wherever is farthest from the others.
      const p = this.battle.respawnPoint(r);
      r.x = p.x;
      r.y = p.y;
      r.heading = p.heading;
    } else {
      const n0 = this.track.nearest(r.x, r.y, r.nearestIndex, 60);
      const s = this.track.samples[n0.index];
      r.x = s.x;
      r.y = s.y;
      r.heading = Math.atan2(s.ty, s.tx);
    }
    const n = this.track.nearest(r.x, r.y, -1);
    r.vx = r.vy = 0;
    r.hull = r.stats.maxHull;
    r.sinkTimer = 0;
    r.stuckTimer = 0;
    r.nearestIndex = n.index;
    removeEffect(r, 'sinking');
    removeEffect(r, 'spinOut');
    addEffect(r, 'invulnerable', TUNING.respawnInvulnerable);
    this.emit({ type: 'respawn', racer: r.id });
  }

  /**
   * Boats pass straight through each other while either one is blinking after being hit (or just
   * respawned), so a boat that has just been shot is never bounced around or boxed in.
   */
  isIntangible(r: Racer): boolean {
    return r.sinkTimer > 0 || this.isGhost(r) || hasEffect(r, 'invulnerable');
  }

  /** On point-to-point tracks, boats that have finished stop interacting so they never block the line. */
  isGhost(r: Racer): boolean {
    return r.finished && !this.track.closed;
  }

  private updateProgress(r: Racer): void {
    const L = this.track.lapLength;
    const n = this.track.nearest(r.x, r.y, r.nearestIndex, 40);
    r.nearestIndex = n.index;
    r.progress = this.track.advance(r.progress, n.along);
    if (r.finished || this.battle) return; // no laps in a battle

    const cps = this.track.def.checkpoints;
    while (r.nextCheckpoint < cps.length && r.progress >= (r.lapsDone + cps[r.nextCheckpoint]) * L) r.nextCheckpoint++;
    if (r.nextCheckpoint >= cps.length && r.progress >= (r.lapsDone + 1) * L) {
      r.lapsDone++;
      r.nextCheckpoint = 0;
      const lapTime = this.time - r.lapStart;
      r.lapStart = this.time;
      r.lapTimes.push(lapTime);
      this.emit({ type: 'lap', racer: r.id, lap: r.lapsDone, time: this.time });
      if (r.lapsDone >= this.track.laps) {
        r.finished = true;
        r.finishTime = this.time;
        r.autopilot = true;
        const place = this.racers.filter((o) => o.finished).length;
        this.emit({ type: 'finish', racer: r.id, position: place - 1, time: this.time });
      }
    }
  }

  updateRanking(): void {
    if (this.battle) {
      this.battle.order().forEach((r, i) => (r.position = i));
      return;
    }
    const order = [...this.racers].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.progress - a.progress;
    });
    order.forEach((r, i) => (r.position = i));
  }

  private checkEnd(dt: number): void {
    if (this.battle) {
      this.battle.update(dt);
      if (this.battle.done) {
        this.phase = 'over';
        this.emit({ type: 'raceOver' });
      }
      return;
    }
    if (this.endTimer < 0) {
      const humans = this.racers.filter((r) => r.human);
      let done: boolean;
      if (humans.length > 1) {
        // Multiplayer: everyone finished, or the others ran out of time after the first finisher.
        done = humans.every((h) => h.finished);
        if (!done && humans.some((h) => h.finished)) {
          if (this.finishCountdown < 0) this.finishCountdown = FINISH_GRACE;
          this.finishCountdown -= dt;
          if (this.finishCountdown <= 0) done = true;
        }
      } else done = this.player ? this.player.finished : this.racers.every((r) => r.finished);
      if (done) this.endTimer = this.player ? 3 : 0;
    } else {
      this.endTimer -= dt;
      if (this.endTimer <= 0 || this.racers.every((r) => r.finished)) {
        this.phase = 'over';
        this.emit({ type: 'raceOver' });
      }
    }
  }

  /** Finishing order. Boats still racing get a time estimated from their progress so far. */
  results(): RaceResult[] {
    // A battle: the standings (time: the length of the match).
    if (this.battle) return this.battle.order().map((r) => ({ racer: r, time: this.time, finished: true }));
    const total = this.track.raceDistance;
    const out: RaceResult[] = this.racers.map((r) => {
      if (r.finished) return { racer: r, time: r.finishTime, finished: true };
      const covered = Math.max(1, r.progress);
      const avg = covered / Math.max(1, this.time);
      return { racer: r, time: this.time + Math.max(0, total - r.progress) / avg, finished: false };
    });
    return out.sort((a, b) => a.time - b.time);
  }
}
