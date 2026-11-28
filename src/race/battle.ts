import { addEffect } from '../effects/effects';
import { isTouching, touchesCapsule } from '../physics/collisions';
import { bargeCapsule } from './traffic';
import type { RaceSimulation } from './RaceSimulation';
import type { Racer } from './types';

/**
 * Battle modes, played on the arenas (wide loops of open water around an island): instead of
 * laps, boats score.
 *
 * - **Deathmatch**: sinking a boat (it sinks while your hit was the last within KILL_CREDIT s)
 *   scores a point; free for all, or in two teams (the team's points add up).
 * - **Capture the flag**: two teams, Corsica and Brittany, each with its flag at its base. Touch
 *   the other team's flag to take it, bring it to your own base while your flag is there: a
 *   capture. A boat that sinks drops the flag it carries; touched by its own team a dropped flag
 *   goes home, touched by the other team it is taken again, left alone it goes home after a while.
 *
 * A boat that sinks comes back at its team's base (a random spot there, away from opponents), or
 * in free for all, on the spot of the arena farthest from any opponent. Pure logic, seeded like
 * the rest of the race, so it runs on the server too.
 */

export type GameMode = 'race' | 'deathmatch' | 'teamDeathmatch' | 'ctf';
export const GAME_MODES: GameMode[] = ['race', 'deathmatch', 'teamDeathmatch', 'ctf'];
export const isBattle = (m: GameMode | undefined): boolean => !!m && m !== 'race';
export const isTeamMode = (m: GameMode | undefined): boolean => m === 'teamDeathmatch' || m === 'ctf';

/** Team 0 is Corsica, team 1 Brittany (the colours of their boats). */
export const TEAM_COLORS = [0xd8352b, 0x2f6fd8];

export const BATTLE = {
  /** Seconds a match lasts at most (deathmatch, capture the flag). */
  timeLimit: { deathmatch: 240, teamDeathmatch: 240, ctf: 300 },
  /** Captures that win straight away (points in deathmatch: see winLimit). */
  captureLimit: 4,
  /** The last hit counts for this long when a boat sinks. */
  killCredit: 6,
  /** Touching a flag (px, added to the boat's size). */
  flagRadius: 26,
  /** A dropped flag goes home by itself after this long. */
  flagReturn: 20,
  /** A team's base: this far along the loop either side of its spot, this share of the width. */
  baseAlong: 260,
  baseAcross: 0.6,
  /** After the end, a moment before the results. */
  endPause: 2.5,
  /** Items hurt this much more than in a race: fights end in sinkings, not in a stream of dents. */
  damageMult: 1.6,
  /** Crates come back this fast (s; 4 in a race). */
  crateRespawn: 2.5,
  /** Sudden death, when time runs out on a tie: the next point wins, or a draw after this long (s). */
  overtime: 90,
  /** Aim assist: a shot fired within this angle (rad) of an opponent, this close, goes straight at it. */
  aimCone: 0.3,
  aimRange: 1000,
  /** Golden crates: back this long after one is opened (s); the first ones turn up after `powerFirst`. */
  powerRespawn: 30,
  powerFirst: 20,
  /** A boat carrying a flag is slower (top speed ×): the others have time to catch it. */
  carrierSpeed: 0.75,
};

/**
 * What wins straight away: in deathmatch, the boats + 2 points (8 for six boats); in team
 * deathmatch 2.5 points a boat (15 for six); in capture the flag, captureLimit captures.
 */
export function winLimit(mode: Exclude<GameMode, 'race'>, boats: number): number {
  return mode === 'deathmatch' ? boats + 2 : mode === 'teamDeathmatch' ? Math.round(boats * 2.5) : BATTLE.captureLimit;
}

export interface Flag {
  team: number;
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  /** The boat carrying it, or -1. */
  carrier: number;
  /** Lying where its carrier sank (not at home, not carried). */
  dropped: boolean;
  droppedT: number;
}

/** A battle's outcome, for the results: the mode, the teams' scores, the winning team (-1: none or a draw). */
export interface BattleResult {
  mode: Exclude<GameMode, 'race'>;
  teamScores: number[];
  winnerTeam: number;
}

export interface BattleStats {
  kills: number;
  deaths: number;
  captures: number;
}

export class BattleSystem {
  /** Each boat's team (-1: free for all). */
  readonly teams: number[];
  readonly stats: BattleStats[];
  teamScores = [0, 0];
  flags: Flag[] = [];
  timeLeft: number;
  /** Points (or captures) that win straight away. */
  readonly limit: number;
  over = false;
  /** The team that won (team modes), or -1. */
  winnerTeam = -1;
  private endT = -1;
  private lastHit = new Map<number, { by: number; t: number }>();

  constructor(private sim: RaceSimulation, readonly mode: Exclude<GameMode, 'race'>, teams?: number[]) {
    const n = sim.racers.length;
    this.teams = isTeamMode(mode) ? Array.from({ length: n }, (_, i) => (teams?.[i] === 0 || teams?.[i] === 1 ? teams[i] : i % 2)) : Array(n).fill(-1);
    this.stats = Array.from({ length: n }, () => ({ kills: 0, deaths: 0, captures: 0 }));
    this.timeLeft = BATTLE.timeLimit[mode];
    this.limit = winLimit(mode, n);
    if (mode === 'ctf') {
      for (const team of [0, 1]) {
        const b = this.basePoint(team);
        this.flags.push({ team, x: b.x, y: b.y, homeX: b.x, homeY: b.y, carrier: -1, dropped: false, droppedT: 0 });
      }
    }
  }

  /** Where a team's base is: its spot along the arena's loop (the track's `bases`), in the middle. */
  basePoint(team: number): { x: number; y: number; heading: number; along: number } {
    const track = this.sim.track;
    const at = (track.def.bases ?? [0, 0.5])[team] ?? team * 0.5;
    const along = track.alongOf(at * track.lapLength);
    const p = track.pointAt(along, 0);
    return { ...p, along };
  }

  /** Starting positions: each team spread round its base; free for all, spread round the arena. */
  startSpot(i: number): { x: number; y: number; heading: number } {
    const track = this.sim.track;
    const team = this.teams[i];
    if (team >= 0) {
      const mates = this.teams.filter((t) => t === team).length;
      const k = this.teams.slice(0, i).filter((t) => t === team).length;
      const b = this.basePoint(team);
      const along = b.along + (k - (mates - 1) / 2) * 90;
      const hw = track.sampleAt(along).width / 2;
      return track.pointAt(along, ((k % 2) * 2 - 1) * hw * 0.3);
    }
    const n = this.teams.length;
    return track.pointAt(track.alongOf(((i + 0.5) / n) * track.lapLength), 0);
  }

  get scores(): number[] {
    return this.mode === 'ctf' ? this.stats.map((s) => s.captures) : this.stats.map((s) => s.kills);
  }

  /** A hit by `by` on `r`: if `r` sinks soon after, `by` scores. */
  noteHit(r: Racer, by: number | null): void {
    if (by === null || by === r.id) return;
    this.lastHit.set(r.id, { by, t: this.sim.time });
    // Hit by an opponent, a flag carrier drops the flag (it blinks: it can't pick it straight up again).
    if (!this.over && this.teams[by] !== this.teams[r.id]) this.dropFlags(r);
  }

  private dropFlags(r: Racer): void {
    for (const f of this.flags) {
      if (f.carrier !== r.id) continue;
      f.carrier = -1;
      f.dropped = true;
      f.droppedT = 0;
      f.x = r.x;
      f.y = r.y;
      this.sim.emit({ type: 'flag', team: f.team, action: 'dropped', racer: r.id });
    }
  }

  /** A boat sank: the kill goes to the last boat that hit it, lately; a flag it carried drops. */
  onSunk(r: Racer): void {
    if (this.over) return;
    this.stats[r.id].deaths++;
    const last = this.lastHit.get(r.id);
    this.lastHit.delete(r.id);
    let by: number | null = null;
    if (last && this.sim.time - last.t <= BATTLE.killCredit && (this.teams[r.id] < 0 || this.teams[last.by] !== this.teams[r.id])) {
      by = last.by;
      this.stats[by].kills++;
      if (this.mode === 'teamDeathmatch') this.teamScores[this.teams[by]]++;
    }
    this.sim.emit({ type: 'kill', racer: r.id, by });
    this.dropFlags(r);
    this.checkEnd();
  }

  /**
   * Where a sunk boat comes back: at its team's base, the spot there farthest from opponents; free
   * for all, the spot of the arena farthest from any opponent.
   */
  respawnPoint(r: Racer): { x: number; y: number; heading: number } {
    const sim = this.sim, track = sim.track, rng = sim.rng;
    const team = this.teams[r.id];
    const foes = this.sim.racers.filter((o) => o !== r && o.sinkTimer <= 0 && (team < 0 || this.teams[o.id] !== team));
    const far = (p: { x: number; y: number }): number => foes.reduce((m, o) => Math.min(m, Math.hypot(o.x - p.x, o.y - p.y)), Infinity);
    let best: { x: number; y: number; heading: number } | null = null, bestD = -1;
    for (let k = 0; k < 12; k++) {
      let along: number;
      if (team >= 0) along = this.basePoint(team).along + rng.range(-BATTLE.baseAlong, BATTLE.baseAlong);
      else along = rng.range(0, track.length);
      along = ((along % track.length) + track.length) % track.length;
      const hw = track.sampleAt(along).width / 2;
      const p = track.pointAt(along, rng.range(-1, 1) * hw * BATTLE.baseAcross);
      // Facing either way round the loop at random.
      const spot = { x: p.x, y: p.y, heading: rng.chance(0.5) ? p.heading : p.heading + Math.PI };
      // never inside (or touching) a moored barge
      if (sim.trafficPoses.some((b) => b.solid && touchesCapsule(spot.x, spot.y, r.stats.radius + 24, bargeCapsule(b)))) continue;
      const d = far(spot);
      if (d > bestD) {
        bestD = d;
        best = spot;
      }
    }
    return best ?? track.pointAt(team >= 0 ? this.basePoint(team).along : 0, 0);
  }

  /** Time is up and the lead is shared: the next point wins (timeLeft goes on below 0 meanwhile). */
  get suddenDeath(): boolean {
    return this.timeLeft <= 0 && !this.over;
  }

  /** The lead is shared: two teams level, or (free for all) two boats on the top score. */
  private tied(): boolean {
    if (isTeamMode(this.mode)) return this.teamScores[0] === this.teamScores[1];
    const s = [...this.scores].sort((a, b) => b - a);
    return s.length > 1 && s[0] === s[1];
  }

  update(dt: number): void {
    if (this.sim.phase !== 'racing') return;
    if (this.over) {
      this.endT -= dt;
      return;
    }
    const before = this.timeLeft;
    this.timeLeft -= dt;
    if (this.mode === 'ctf') this.updateFlags(dt);
    if (this.over) return;
    if (before > 0 && this.timeLeft <= 0) {
      // Time's up: a winner, or sudden death.
      if (this.tied()) this.sim.emit({ type: 'suddenDeath' });
      else this.finish();
    } else if (this.timeLeft <= -BATTLE.overtime) this.finish(); // still level: a draw
  }

  /** The match is over and the results can show. */
  get done(): boolean {
    return this.over && this.endT <= 0;
  }

  private updateFlags(dt: number): void {
    const sim = this.sim;
    // Carrying a flag slows you down (through the catch-up factor, which battles don't otherwise use).
    for (const r of sim.racers) r.catchUp = this.flags.some((f) => f.carrier === r.id) ? BATTLE.carrierSpeed : 1;
    for (const f of this.flags) {
      if (f.carrier >= 0) {
        const c = sim.racers[f.carrier];
        f.x = c.x;
        f.y = c.y;
        // A capture: back at its own base, its own flag at home.
        const own = this.flags[this.teams[c.id]];
        if (own.carrier < 0 && !own.dropped && Math.hypot(c.x - own.homeX, c.y - own.homeY) < BATTLE.flagRadius + c.stats.radius + 20) {
          this.stats[c.id].captures++;
          this.teamScores[this.teams[c.id]]++;
          f.carrier = -1;
          f.dropped = false;
          f.x = f.homeX;
          f.y = f.homeY;
          sim.emit({ type: 'flag', team: f.team, action: 'captured', racer: c.id });
          this.checkEnd();
        }
        continue;
      }
      if (f.dropped) {
        f.droppedT += dt;
        if (f.droppedT > BATTLE.flagReturn) this.sendHome(f, -1);
      }
      for (const r of sim.racers) {
        if (r.sinkTimer > 0 || sim.isIntangible(r)) continue;
        if (!isTouching(r, f.x, f.y, BATTLE.flagRadius)) continue;
        // (a boat of its own team guarding the flag at home doesn't stop the others taking it)
        if (this.teams[r.id] === f.team) {
          if (!f.dropped) continue;
          this.sendHome(f, r.id);
        } else {
          if (this.flags.some((o) => o.carrier === r.id)) continue;
          f.carrier = r.id;
          f.dropped = false;
          sim.emit({ type: 'flag', team: f.team, action: 'taken', racer: r.id });
        }
        break;
      }
    }
  }

  private sendHome(f: Flag, by: number): void {
    f.dropped = false;
    f.carrier = -1;
    f.x = f.homeX;
    f.y = f.homeY;
    this.sim.emit({ type: 'flag', team: f.team, action: 'returned', racer: by });
  }

  private checkEnd(): void {
    if (this.suddenDeath && !this.tied()) return this.finish();
    const won = this.mode === 'deathmatch'
      ? this.stats.some((s) => s.kills >= this.limit)
      : this.teamScores.some((s) => s >= this.limit);
    if (won) this.finish();
  }

  private finish(): void {
    if (this.over) return;
    this.over = true;
    this.endT = BATTLE.endPause;
    if (isTeamMode(this.mode)) this.winnerTeam = this.teamScores[0] === this.teamScores[1] ? -1 : this.teamScores[0] > this.teamScores[1] ? 0 : 1;
    // Everyone stops shooting: blinking boats can't be hurt any more.
    for (const r of this.sim.racers) addEffect(r, 'invulnerable', BATTLE.endPause + 1);
    this.sim.emit({ type: 'battleOver', team: this.winnerTeam });
  }

  /**
   * Which column of the item odds a boat draws from (0: the leader's weak items, 3: the strongest),
   * by how far it (or its team) is ahead or behind on points, not by place: at 0-0 nobody leads.
   */
  oddsColumn(r: Racer): number {
    let lead: number, steps: number[];
    if (isTeamMode(this.mode)) {
      const t = this.teams[r.id];
      lead = this.teamScores[t] - this.teamScores[1 - t];
      // a capture is worth a lot more than a sinking
      steps = this.mode === 'ctf' ? [1, 0, -2] : [3, 0, -3];
    } else {
      const s = this.scores;
      lead = s[r.id] - Math.max(...s.filter((_, i) => i !== r.id));
      steps = [1, 0, -2];
    }
    // ahead by the first step or more: 0; level (or a little ahead): 1; a little behind: 2; far behind: 3
    return lead >= steps[0] ? 0 : lead >= steps[1] ? 1 : lead > steps[2] ? 2 : 3;
  }

  get result(): BattleResult {
    return { mode: this.mode, teamScores: [...this.teamScores], winnerTeam: this.winnerTeam };
  }

  /** The standings: team modes by team then points; free for all by points, then fewest deaths. */
  order(): Racer[] {
    const s = this.scores;
    return [...this.sim.racers].sort((a, b) => {
      if (isTeamMode(this.mode) && this.teams[a.id] !== this.teams[b.id]) return this.teamScores[this.teams[b.id]] - this.teamScores[this.teams[a.id]];
      return s[b.id] - s[a.id] || this.stats[a.id].deaths - this.stats[b.id].deaths || a.id - b.id;
    });
  }
}
