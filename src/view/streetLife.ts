import Phaser from 'phaser';
import type { Track } from '../track/Track';
import { type SceneryData, TOWPATH } from './scenery';
import { CAR, CAR_COLORS, SHIRTS, STREET_ART_SCALE } from './streetArt';

/**
 * Decoration only: cars driving the streets and people out and about, round the camera. Nothing
 * here touches the race; each screen animates its own, with plain random numbers.
 *
 * - **Cars** drive on the right along the roads, turn at junctions, slow down behind each other,
 *   and go over bridges (drawn above the deck there).
 * - **People** walk the towpaths (some with a dog), the pavements and the footpaths; joggers and
 *   cyclists on the towpaths go faster; anglers sit on the quays.
 *
 * Only a few dozen exist at a time, in a ring round the camera: one that wanders too far away is
 * put back somewhere just out of sight.
 */

/** Following a road's polyline: on segment i -> i + dir, `t` px along it, `offset` px to the right. */
interface RoadWay {
  road: number;
  i: number;
  dir: 1 | -1;
  t: number;
  offset: number;
}
/** Along a towpath: `along` the centre line, `side` of the canal, `lat` px beyond the water's edge. */
interface TowWay {
  along: number;
  dir: 1 | -1;
  side: 1 | -1;
  lat: number;
}

interface Mover {
  sprite: Phaser.GameObjects.Image;
  kind: 'car' | 'walker' | 'jogger' | 'cyclist' | 'angler';
  speed: number;
  /** A car's speed right now (it brakes behind others), and how long it has been stuck. */
  cur: number;
  stuckT: number;
  road?: RoadWay;
  tow?: TowWay;
  dog?: Phaser.GameObjects.Image;
  heading: number;
  /** Checks for something in the way (a building on the towpath) happen now and then. */
  checkT: number;
  /** Placed once already: from then on, put back only out of sight. */
  placed: boolean;
}

const CELL = 512;
/** Segment codes: road index * SEG + segment index. */
const SEG = 1 << 16;
const COUNTS = { car: 28, walker: 16, roadWalker: 14, jogger: 3, cyclist: 5, angler: 6 };
/** Cars per road class (0 motorway, 1 road), px/s; about 80 and 45 km/h at the Reims scale. */
const CAR_SPEED = [220, 125];
/** People are drawn a little larger than life, or they would be specks at race zoom. */
const PEOPLE_SCALE = 1.5;

export class StreetLife {
  private movers: Mover[] = [];
  /** Road segments by grid cell (road * SEG + segment index), and roads by vertex for junctions. */
  private segCells = new Map<string, number[]>();
  private atVertex = new Map<string, number[]>();
  /** Railway segments (not on bridges) by grid cell, the same way: nobody walks there. */
  private railCells = new Map<string, number[]>();
  private buildingCells = new Map<string, number[]>();
  private area = new Phaser.Geom.Rectangle();
  /** The centre-line sample nearest the camera: towpath spots are looked for round it. */
  private hint = -1;

  constructor(private scene: Phaser.Scene, private track: Track, private data: SceneryData) {
    const d = data;
    // Each segment of a line goes into every cell it (and its width) touches.
    const index = (cells: Map<string, number[]>, i: number, w: number, l: number[]): void => {
      for (let k = 0; k + 3 < l.length; k += 2) {
        const ax = l[k], ay = l[k + 1], bx = l[k + 2], by = l[k + 3];
        const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (CELL / 4)));
        const touched = new Set<string>();
        for (let j = 0; j <= steps; j++) {
          const x = ax + ((bx - ax) * j) / steps, y = ay + ((by - ay) * j) / steps;
          for (const [ox, oy] of [[0, 0], [-w, 0], [w, 0], [0, -w], [0, w]]) touched.add(this.cell(x + ox, y + oy));
        }
        for (const c of touched) (cells.get(c) ?? cells.set(c, []).get(c)!).push(i * SEG + k / 2);
      }
    };
    d.roads.forEach(([, w, , l], i) => {
      for (let k = 0; k + 1 < l.length; k += 2) {
        const v = `${l[k]},${l[k + 1]}`;
        (this.atVertex.get(v) ?? this.atVertex.set(v, []).get(v)!).push(i);
      }
      index(this.segCells, i, w, l);
    });
    d.rails.forEach(([w, bridge, l], i) => {
      if (!bridge) index(this.railCells, i, w, l);
    });
    d.buildings.forEach(([, , r], i) => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let k = 0; k + 1 < r.length; k += 2) {
        x0 = Math.min(x0, r[k]); x1 = Math.max(x1, r[k]);
        y0 = Math.min(y0, r[k + 1]); y1 = Math.max(y1, r[k + 1]);
      }
      for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
        for (let cy = Math.floor(y0 / CELL); cy <= Math.floor(y1 / CELL); cy++) {
          const c = `${cx},${cy}`;
          (this.buildingCells.get(c) ?? this.buildingCells.set(c, []).get(c)!).push(i);
        }
      }
    });
    const add = (kind: Mover['kind'], n: number, texture: () => string): void => {
      for (let i = 0; i < n; i++) {
        const sprite = scene.add.image(0, 0, texture()).setVisible(false).setScale((kind === 'car' ? 1 : PEOPLE_SCALE) / STREET_ART_SCALE);
        this.movers.push({ sprite, kind, speed: 0, cur: 0, stuckT: 0, heading: 0, checkT: 0, placed: false });
      }
    };
    add('car', COUNTS.car, () => `car_${Phaser.Math.Between(0, CAR_COLORS.length * 3 - 1)}`);
    add('walker', COUNTS.walker + COUNTS.roadWalker, () => `walker_${Phaser.Math.Between(0, SHIRTS.length - 1)}`);
    add('jogger', COUNTS.jogger, () => `walker_${Phaser.Math.Between(0, SHIRTS.length - 1)}`);
    add('cyclist', COUNTS.cyclist, () => `cyclist_${Phaser.Math.Between(0, 3)}`);
    add('angler', COUNTS.angler, () => `angler_${Phaser.Math.Between(0, 2)}`);
    // Every other walker on a towpath has a dog.
    this.movers.filter((m) => m.kind === 'walker').forEach((m, i) => {
      if (i % 3 === 0 && i < COUNTS.walker) m.dog = scene.add.image(0, 0, 'dog').setVisible(false).setScale(PEOPLE_SCALE / STREET_ART_SCALE);
    });
  }

  private cell(x: number, y: number): string {
    return `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;
  }

  update(dt: number): void {
    const v = this.scene.cameras.main.worldView;
    if (v.width === 0) return;
    this.area.setTo(v.x - 450, v.y - 450, v.width + 900, v.height + 900);
    this.hint = this.track.nearest(v.centerX, v.centerY, this.hint, this.hint < 0 ? 40 : 60).index;
    let roadWalkers = 0;
    for (const m of this.movers) {
      const onRoad = m.kind === 'walker' && roadWalkers++ >= COUNTS.walker;
      if (!m.sprite.visible || !this.area.contains(m.sprite.x, m.sprite.y)) {
        if (!this.spawn(m, onRoad, v)) {
          m.sprite.setVisible(false);
          m.dog?.setVisible(false);
          continue;
        }
      }
      this.move(m, dt);
    }
  }

  // ---- placing --------------------------------------------------------------------------

  /** Put a mover somewhere in the area round the camera, preferably just out of sight. */
  private spawn(m: Mover, onRoad: boolean, view: Phaser.Geom.Rectangle): boolean {
    const first = !m.placed;
    for (let attempt = 0; attempt < 14; attempt++) {
      const x = this.area.x + Math.random() * this.area.width;
      const y = this.area.y + Math.random() * this.area.height;
      if (!first && view.contains(x, y)) continue; // don't pop up in plain view
      const ok = m.kind === 'car' ? this.placeOnRoad(m, x, y, false) : m.kind === 'walker' && onRoad ? this.placeOnRoad(m, x, y, true) : this.placeOnTowpath(m, x, y, first ? null : view);
      if (ok) {
        m.sprite.setVisible(true);
        m.dog?.setVisible(!!m.tow);
        m.placed = true;
        m.stuckT = 0;
        m.heading = NaN; // face the way at once
        this.setSpeed(m);
        return true;
      }
    }
    return false;
  }

  private setSpeed(m: Mover): void {
    const r = Math.random();
    if (m.kind === 'car') m.cur = m.speed = CAR_SPEED[this.data.roads[m.road!.road][0] === 0 ? 0 : 1] * (0.9 + r * 0.2);
    else if (m.kind === 'cyclist') m.speed = 45 + r * 15;
    else if (m.kind === 'jogger') m.speed = 28 + r * 6;
    else if (m.kind === 'angler') m.speed = 0;
    else m.speed = 11 + r * 6;
  }

  private placeOnRoad(m: Mover, x: number, y: number, pedestrian: boolean): boolean {
    const segs = this.segCells.get(this.cell(x, y));
    if (!segs?.length) return false;
    const code = segs[Math.floor(Math.random() * segs.length)];
    const road = Math.floor(code / SEG), seg = code % SEG;
    const [cls, w, , l] = this.data.roads[road];
    // No cars on footpaths, no people on motorways.
    if (pedestrian ? cls === 0 : cls === 2) return false;
    const ax = l[seg * 2], ay = l[seg * 2 + 1], bx = l[seg * 2 + 2], by = l[seg * 2 + 3];
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 1) return false;
    // Start level with the point picked, along this segment.
    const t = Math.max(0, Math.min(len - 1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / len));
    const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
    const way: RoadWay = dir === 1 ? { road, i: seg, dir, t, offset: 0 } : { road, i: seg + 1, dir, t: len - t, offset: 0 };
    // Cars keep right; people walk on either pavement (in the middle of a footpath).
    way.offset = pedestrian ? (cls === 2 ? (Math.random() - 0.5) * 4 : (Math.random() < 0.5 ? 1 : -1) * (w / 2 + 8)) : Math.max(5, w * 0.24);
    m.road = way;
    m.tow = undefined;
    m.sprite.setDepth(this.data.roads[road][2] ? 20.25 : 1.62);
    return true;
  }

  private placeOnTowpath(m: Mover, x: number, y: number, hidden: Phaser.Geom.Rectangle | null): boolean {
    const n = this.track.nearest(x, y, this.hint, 200);
    const side: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
    const lat = m.kind === 'angler' ? 9 : 14 + Math.random() * (TOWPATH - 26);
    const tow: TowWay = { along: n.along, dir: Math.random() < 0.5 ? 1 : -1, side, lat };
    if (!this.track.closed && (tow.along < 50 || tow.along > this.track.length - 50)) return false;
    const p = this.towPoint(tow);
    if (!this.area.contains(p.x, p.y) || hidden?.contains(p.x, p.y) || this.blocked(p.x, p.y)) return false;
    m.tow = tow;
    m.road = undefined;
    m.sprite.setDepth(1.62);
    return true;
  }

  private towPoint(w: TowWay): { x: number; y: number; heading: number } {
    const s = this.track.sampleAt(w.along);
    return this.track.pointAt(w.along, w.side * (s.width / 2 + w.lat));
  }

  /** On a building, a road or a railway (a towpath walker must not stroll over roofs, a motorway or the tracks). */
  private blocked(x: number, y: number): boolean {
    for (const i of this.buildingCells.get(this.cell(x, y)) ?? []) if (inRing(x, y, this.data.buildings[i][2])) return true;
    for (const code of this.segCells.get(this.cell(x, y)) ?? []) {
      const [cls, w, bridge, l] = this.data.roads[Math.floor(code / SEG)];
      if (cls === 2 || bridge) continue;
      const k = (code % SEG) * 2;
      if (segDist(x, y, l[k], l[k + 1], l[k + 2], l[k + 3]) < w / 2 + 6) return true;
    }
    for (const code of this.railCells.get(this.cell(x, y)) ?? []) {
      const [w, , l] = this.data.rails[Math.floor(code / SEG)];
      const k = (code % SEG) * 2;
      if (segDist(x, y, l[k], l[k + 1], l[k + 2], l[k + 3]) < w / 2 + 4) return true;
    }
    return false;
  }

  // ---- moving ---------------------------------------------------------------------------

  private move(m: Mover, dt: number): void {
    let pos: { x: number; y: number; heading: number };
    if (m.road) pos = this.moveOnRoad(m, dt);
    else if (m.tow) pos = this.moveOnTowpath(m, dt);
    else return;
    // Turn smoothly at corners.
    if (Number.isNaN(m.heading)) m.heading = pos.heading;
    const d = Phaser.Math.Angle.Wrap(pos.heading - m.heading);
    m.heading += Math.abs(d) < 0.02 ? d : d * Math.min(1, dt * (m.kind === 'car' ? 9 : 6));
    m.sprite.setPosition(pos.x, pos.y).setRotation(m.heading);
    if (m.dog && m.tow) {
      const lag = 8 * PEOPLE_SCALE, side = 4 * PEOPLE_SCALE;
      const c = Math.cos(m.heading), s = Math.sin(m.heading);
      m.dog.setPosition(pos.x + c * lag - s * side, pos.y + s * lag + c * side).setRotation(m.heading + Math.sin(this.scene.time.now / 120) * 0.3).setDepth(1.61);
    }
  }

  private moveOnRoad(m: Mover, dt: number): { x: number; y: number; heading: number } {
    const w = m.road!;
    let speed = m.speed;
    if (m.kind === 'car') {
      // Brake at once behind another car, pick up speed gently.
      const want = m.stuckT > 3 ? m.speed : this.followSpeed(m);
      m.cur = want < m.cur ? want : Math.min(want, m.cur + 160 * dt);
      // Stuck for long (cars waiting on each other round a junction): drive on through.
      m.stuckT = m.cur < 5 ? m.stuckT + dt : m.stuckT > 3 && m.stuckT < 5 ? m.stuckT + dt : 0;
      speed = m.cur;
    }
    let dist = speed * dt;
    for (let guard = 0; guard < 8 && dist > 0; guard++) {
      const l = this.data.roads[w.road][3];
      const ax = l[w.i * 2], ay = l[w.i * 2 + 1], bx = l[(w.i + w.dir) * 2], by = l[(w.i + w.dir) * 2 + 1];
      const len = Math.hypot(bx - ax, by - ay);
      if (w.t + dist < len) {
        w.t += dist;
        dist = 0;
      } else {
        dist -= len - w.t;
        w.t = 0;
        w.i += w.dir;
        if (w.i + w.dir < 0 || w.i + w.dir >= l.length / 2) this.junction(m);
      }
    }
    const l = this.data.roads[w.road][3];
    const ax = l[w.i * 2], ay = l[w.i * 2 + 1], bx = l[(w.i + w.dir) * 2], by = l[(w.i + w.dir) * 2 + 1];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const ux = (bx - ax) / len, uy = (by - ay) / len;
    const k = w.t / len;
    // To the right of the way it goes (y points down on screen: right of (1, 0) is (0, 1)).
    return { x: ax + (bx - ax) * k - uy * w.offset, y: ay + (by - ay) * k + ux * w.offset, heading: Math.atan2(uy, ux) };
  }

  /** At the end of a road: carry on along another one that starts or passes here, or turn back. */
  private junction(m: Mover): void {
    const w = m.road!;
    const l = this.data.roads[w.road][3];
    const vx = l[w.i * 2], vy = l[w.i * 2 + 1];
    const options = (this.atVertex.get(`${vx},${vy}`) ?? []).filter((r) => r !== w.road && (m.kind !== 'car' || this.data.roads[r][0] !== 2));
    if (options.length) {
      const road = options[Math.floor(Math.random() * options.length)];
      const nl = this.data.roads[road][3];
      const n = nl.length / 2;
      let at = 0;
      for (let k = 0; k < n; k++) if (nl[k * 2] === vx && nl[k * 2 + 1] === vy) at = k;
      const dir: 1 | -1 = at === 0 ? 1 : at === n - 1 ? -1 : Math.random() < 0.5 ? 1 : -1;
      w.road = road;
      w.i = at;
      w.dir = dir;
      w.t = 0;
      if (m.kind === 'car') w.offset = Math.max(5, this.data.roads[road][1] * 0.24);
      m.sprite.setDepth(this.data.roads[road][2] ? 20.25 : 1.62);
      if (m.kind === 'car' && Math.abs(m.speed - CAR_SPEED[this.data.roads[road][0] === 0 ? 0 : 1]) > 60) {
        const cur = m.cur;
        this.setSpeed(m);
        m.cur = Math.min(cur, m.speed);
      }
    } else {
      // A dead end: turn round.
      w.dir = w.dir === 1 ? -1 : 1;
      w.t = 0;
      if (w.i + w.dir < 0 || w.i + w.dir >= l.length / 2) w.dir = w.dir === 1 ? -1 : 1;
    }
  }

  /** How fast it may go behind the next car ahead going the same way: slower when close, stopped when very close. */
  private followSpeed(m: Mover): number {
    const c = Math.cos(m.heading), s = Math.sin(m.heading);
    let speed = m.speed;
    for (const o of this.movers) {
      if (o === m || o.kind !== 'car' || !o.sprite.visible) continue;
      const dx = o.sprite.x - m.sprite.x, dy = o.sprite.y - m.sprite.y;
      const f = dx * c + dy * s, p = -dx * s + dy * c;
      if (f <= 0 || f > CAR.length + 50 || Math.abs(p) > 12 || Math.cos(o.heading - m.heading) < 0.5) continue;
      const gap = f - CAR.length;
      speed = Math.min(speed, gap < 8 ? 0 : Math.min(o.cur + 20, (m.speed * (gap - 8)) / 42));
    }
    return speed;
  }

  private moveOnTowpath(m: Mover, dt: number): { x: number; y: number; heading: number } {
    const w = m.tow!;
    if (m.speed > 0) {
      w.along += w.dir * m.speed * dt;
      if (this.track.closed) w.along = ((w.along % this.track.length) + this.track.length) % this.track.length;
      else if (w.along < 40 || w.along > this.track.length - 40) w.dir = w.dir === 1 ? -1 : 1;
      m.checkT -= dt;
      if (m.checkT <= 0) {
        m.checkT = 0.5;
        // Something across the towpath ahead: turn back.
        const ahead = this.towPoint({ ...w, along: w.along + w.dir * 20 });
        if (this.blocked(ahead.x, ahead.y)) w.dir = w.dir === 1 ? -1 : 1;
      }
    }
    const p = this.towPoint(w);
    let heading = w.dir === 1 ? p.heading : p.heading + Math.PI;
    // An angler sits facing the water.
    if (m.kind === 'angler') heading = p.heading - (w.side * Math.PI) / 2;
    return { x: p.x, y: p.y, heading };
  }

  destroy(): void {
    for (const m of this.movers) {
      m.sprite.destroy();
      m.dog?.destroy();
    }
  }
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
}

function inRing(x: number, y: number, r: number[]): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi) inside = !inside;
  }
  return inside;
}

