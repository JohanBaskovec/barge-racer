import { beforeEach, describe, expect, it } from 'vitest';
import { savedSeat } from '../src/net/client';

/** A stand-in for the tab's session storage. */
const store = new Map<string, string>();
Object.assign(globalThis, {
  sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
});

describe('the seat kept across a page reload', () => {
  beforeEach(() => store.clear());

  it('comes back if it is recent, not if it is old or broken', () => {
    expect(savedSeat()).toBeNull();
    const seat = { code: 'ABCD', key: 'k'.repeat(32), name: 'Marie', boatId: 'tugboat', at: Date.now() - 60_000 };
    store.set('barge-racer-seat', JSON.stringify(seat));
    expect(savedSeat()).toEqual(seat);
    store.set('barge-racer-seat', JSON.stringify({ ...seat, at: Date.now() - 20 * 60_000 }));
    expect(savedSeat()).toBeNull();
    store.set('barge-racer-seat', '{oops');
    expect(savedSeat()).toBeNull();
  });
});
