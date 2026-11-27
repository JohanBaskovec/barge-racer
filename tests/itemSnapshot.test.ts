import { describe, expect, it } from 'vitest';
import { TUNING } from '../src/data/items';
import { loadTrack } from '../src/data/tracks';
import { addEffect, hasEffect } from '../src/effects/effects';
import { OnlineRace } from '../src/net/onlineRace';
import { applyState, encodeState } from '../src/net/snapshot';
import { RaceSimulation, STEP } from '../src/race/RaceSimulation';

const roster = [
  { name: 'A', boatId: 'tugboat', human: true },
  { name: 'B', boatId: 'narrowboat', human: false },
  { name: 'C', boatId: 'cabourg', human: false },
  { name: 'D', boatId: 'cigaretteSpeedboat', human: false },
];
const make = (localRacer = 0) => new RaceSimulation({ track: loadTrack('lockAndLoad'), difficulty: 'river', seed: 7, roster, localRacer });

/** What a screen receives: the server's state, through JSON. */
const wire = (sim: RaceSimulation) => JSON.parse(JSON.stringify(encodeState(sim)));

describe('the new items cross the network', () => {
  it('shots, clouds, shrunk boats, magnetised crates and the new effects arrive on the other screen', () => {
    const server = make(), screen = make();
    for (let i = 0; i < 4 * 60; i++) server.step(STEP);
    const [a, b] = server.racers;
    server.items.give(a, 'raclette');
    server.items.use(a, 0, 'forward');
    server.items.give(a, 'toilet');
    server.items.use(a, 0, 'forward');
    addEffect(b, 'shrunk', 5);
    addEffect(b, 'blackout', 5);
    addEffect(b, 'cheesed', 5);
    addEffect(a, 'magnet', 5);
    addEffect(a, 'karcher', 5);
    for (let i = 0; i < 40; i++) server.step(STEP); // b shrinks
    const c = server.items.crates[0];
    c.x = c.homeX + 123;
    c.y = c.homeY - 45;

    applyState(screen, wire(server));
    const ia = server.items, ib = screen.items;
    expect(ib.shots.map((s) => [s.id, s.kind, Math.round(s.x), Math.round(s.y)])).toEqual(ia.shots.map((s) => [s.id, s.kind, Math.round(s.x), Math.round(s.y)]));
    expect(ib.shots.length).toBe(3);
    expect(ib.clouds.map((x) => [x.id, x.kind, x.owner])).toEqual(ia.clouds.map((x) => [x.id, x.kind, x.owner]));
    expect(ib.clouds.map((x) => x.kind).sort()).toEqual([0, 1]);
    expect(screen.racers[1].size).toBeCloseTo(TUNING.mushroom.shrink, 2);
    expect(screen.racers[1].stats.mass).toBeLessThan(screen.racers[1].baseStats.mass);
    for (const kind of ['shrunk', 'blackout', 'cheesed'] as const) expect(hasEffect(screen.racers[1], kind), kind).toBe(true);
    expect(hasEffect(screen.racers[0], 'magnet') && hasEffect(screen.racers[0], 'karcher')).toBe(true);
    // the displaced crate: here, and the others at home
    expect([ib.crates[0].x, ib.crates[0].y]).toEqual([Math.round((c.homeX + 123) * 10) / 10, Math.round((c.homeY - 45) * 10) / 10]);
    // (the magnet pulled some others too: every crate is where the server has it, to the decimetre)
    ib.crates.forEach((k, i) => {
      expect(Math.abs(k.x - ia.crates[i].x)).toBeLessThan(0.1);
      expect(Math.abs(k.y - ia.crates[i].y)).toBeLessThan(0.1);
    });
    expect(ib.crates.filter((k) => k.x === k.homeX && k.y === k.homeY).length).toBeGreaterThan(ib.crates.length / 2); // most are at home
    // ...and a crate that went home is sent home
    c.x = c.homeX;
    c.y = c.homeY;
    applyState(screen, wire(server));
    expect([ib.crates[0].x, ib.crates[0].y]).toEqual([c.homeX, c.homeY]);
  });

  it('only crates that have been pulled away cost bandwidth', () => {
    const sim = make();
    expect(encodeState(sim).cpos).toEqual([]);
    sim.items.crates[3].x += 10;
    expect(encodeState(sim).cpos.map((r) => r[0])).toEqual([sim.items.crates[3].id]);
  });

  it('a boat knocked out by an electrical failure is predicted on the screen with the same frozen controls', () => {
    const server = make(), screen = make();
    for (let i = 0; i < 4 * 60; i++) server.step(STEP);
    const mine = server.racers[0];
    server.setController(0, { update: () => ({ desiredHeading: mine.heading, throttle: 1, fire: null }) });
    for (let i = 0; i < 90; i++) server.step(STEP);
    addEffect(mine, 'blackout', 3);
    server.step(STEP);
    screen.phase = 'racing'; // (on a real screen applyState does this every frame)
    const online = new OnlineRace(screen, screen.player);
    // The player turns hard and brakes on their own screen: the boat must ignore that, like the server's.
    online.onSnap({ t: 'snap', s: 1, ack: 0, state: wire(server), ev: [] }, 0);
    const h = screen.player!.heading;
    const before = Math.hypot(screen.player!.vx, screen.player!.vy);
    for (let i = 0; i < 30; i++) online.local({ desiredHeading: h + 2, throttle: -1, fire: null });
    expect(screen.player!.heading).toBeCloseTo(h, 5);
    expect(screen.player!.throttle).toBeGreaterThan(0.9);
    expect(Math.hypot(screen.player!.vx, screen.player!.vy)).toBeGreaterThan(before * 0.9); // still on the throttle it had: it did not brake
  });
});
