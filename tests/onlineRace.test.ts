import { describe, expect, it } from 'vitest';
import { loadTrack } from '../src/data/tracks';
import { OnlineRace } from '../src/net/onlineRace';
import { encodeState } from '../src/net/snapshot';
import { RaceSimulation, STEP } from '../src/race/RaceSimulation';

const roster = [
  { name: 'A', boatId: 'tugboat', human: true },
  { name: 'B', boatId: 'narrowboat', human: true },
  { name: 'C', boatId: 'cabourg', human: false },
  { name: 'D', boatId: 'cigaretteSpeedboat', human: false },
];

/** The server's race, and a screen's copy of it. */
function setup(localRacer: number) {
  const server = new RaceSimulation({ track: loadTrack('lockAndLoad'), difficulty: 'river', seed: 7, roster });
  const screen = new RaceSimulation({ track: loadTrack('lockAndLoad'), difficulty: 'river', seed: 7, roster, localRacer });
  return { server, screen };
}

describe('online race on a screen', () => {
  it('reports how far a snapshot moved your boat from where it was predicted, so the view can smooth it', () => {
    const { server, screen } = setup(0);
    const online = new OnlineRace(screen, screen.player);
    const moves: number[][] = [];
    online.onCorrection = (dx, dy, dh) => moves.push([dx, dy, dh]);
    const me = screen.player!;
    const state = encodeState(server);
    state.racers[0].x = me.x - 12; // the server says the boat is 12 px further left (a bump)
    online.onSnap({ t: 'snap', s: 1, ack: 0, state, ev: [] }, 0);
    expect(moves).toHaveLength(1);
    expect(moves[0][0]).toBeCloseTo(12, 0);
    expect(me.x).toBeCloseTo(state.racers[0].x, 5);

    // A huge difference (a respawn) is not smoothed.
    const far = encodeState(server);
    far.racers[0].x = me.x + 2000;
    online.onSnap({ t: 'snap', s: 2, ack: 0, state: far, ev: [] }, STEP * 1000);
    expect(moves).toHaveLength(1);
  });

  it('after reconnecting, controls the server never acknowledged are not replayed', () => {
    const { server, screen } = setup(0);
    const online = new OnlineRace(screen, screen.player);
    for (let i = 0; i < 100; i++) online.local({ desiredHeading: 0, throttle: 1, fire: null });
    online.resume();
    const state = encodeState(server); // phase countdown: nothing moves either way
    state.phase = 'racing';
    online.onSnap({ t: 'snap', s: 400, ack: -1, state, ev: [] }, 0);
    // With the 100 old inputs replayed the boat would have moved well away from the snapshot.
    expect(screen.player!.x).toBeCloseTo(state.racers[0].x, 5);
    expect(screen.player!.y).toBeCloseTo(state.racers[0].y, 5);
  });

  it('watching: no boat of your own, every boat follows the snapshots', () => {
    const { server, screen } = setup(-1);
    expect(screen.racers.some((r) => r.isPlayer)).toBe(false);
    const online = new OnlineRace(screen, null);
    online.local({ desiredHeading: 0, throttle: 1, fire: null }); // ignored
    for (let i = 0; i < 300; i++) server.step(STEP);
    const now = 10_000;
    online.onSnap({ t: 'snap', s: 300, ack: -1, state: encodeState(server), ev: [] }, now);
    online.onSnap({ t: 'snap', s: 303, ack: -1, state: encodeState(server), ev: [] }, now + 50);
    online.render(now + 50 + 200);
    for (const [i, r] of server.racers.entries()) {
      expect(screen.racers[i].x).toBeCloseTo(r.x, 0);
      expect(screen.racers[i].y).toBeCloseTo(r.y, 0);
    }
  });
});
