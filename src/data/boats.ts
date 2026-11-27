import { lerp } from '../physics/math';

export interface BoatRatings {
  speed: number;
  accel: number;
  handling: number;
  weight: number;
  hull: number;
}

export type BoatShape = 'barge' | 'tug' | 'narrow' | 'speedboat' | 'pontoon' | 'fireboat' | 'hovercraft';

export interface BoatDef {
  id: string;
  ratings: BoatRatings;
  /** Collision/visual size in world px. */
  size: { length: number; width: number };
  shape: BoatShape;
  specials?: { washesGlue?: boolean; hover?: boolean };
  unlockedByDefault: boolean;
}

/** Physics values derived from the 1-10 ratings (see docs/boats.md). */
export interface BoatStats {
  topSpeed: number;
  accel: number;
  turnRate: number;
  lateralGrip: number;
  mass: number;
  maxHull: number;
  spinMult: number;
  radius: number;
}

const r01 = (rating: number): number => (rating - 1) / 9;

export function deriveStats(def: BoatDef): BoatStats {
  const r = def.ratings;
  let lateralGrip = lerp(1.5, 6, r01(r.handling));
  if (def.specials?.hover) lateralGrip *= 0.4;
  return {
    topSpeed: lerp(260, 440, r01(r.speed)),
    accel: lerp(120, 420, r01(r.accel)) / (0.7 + 0.03 * r.weight),
    turnRate: lerp(1.6, 3.6, r01(r.handling)) / (0.8 + 0.02 * r.weight),
    lateralGrip,
    mass: lerp(1, 4, r01(r.weight)),
    maxHull: lerp(60, 150, r01(r.hull)),
    spinMult: lerp(1.2, 0.6, r01(r.weight)),
    radius: (def.size.length + def.size.width) / 4,
  };
}

export const BOATS: BoatDef[] = [
  {
    id: 'coalBarge', shape: 'barge', unlockedByDefault: true,
    ratings: { speed: 5, accel: 3, handling: 3, weight: 10, hull: 9 },
    size: { length: 104, width: 34 },
  },
  {
    id: 'tugboat', shape: 'tug', unlockedByDefault: true,
    ratings: { speed: 4, accel: 8, handling: 5, weight: 8, hull: 5 },
    size: { length: 66, width: 36 },
  },
  {
    id: 'narrowboat', shape: 'narrow', unlockedByDefault: true,
    ratings: { speed: 5, accel: 6, handling: 9, weight: 4, hull: 6 },
    size: { length: 92, width: 24 },
  },
  {
    id: 'cigaretteSpeedboat', shape: 'speedboat', unlockedByDefault: true,
    ratings: { speed: 10, accel: 8, handling: 7, weight: 2, hull: 3 },
    size: { length: 88, width: 26 },
  },
  {
    id: 'partyPontoon', shape: 'pontoon', unlockedByDefault: true,
    ratings: { speed: 6, accel: 7, handling: 7, weight: 5, hull: 5 },
    size: { length: 72, width: 44 },
  },
  {
    id: 'fireBoat', shape: 'fireboat', unlockedByDefault: true,
    ratings: { speed: 6, accel: 5, handling: 5, weight: 7, hull: 7 },
    size: { length: 84, width: 34 },
    specials: { washesGlue: true },
  },
  {
    id: 'hovercraft', shape: 'hovercraft', unlockedByDefault: true,
    ratings: { speed: 9, accel: 8, handling: 4, weight: 4, hull: 5 },
    size: { length: 64, width: 46 },
    specials: { hover: true },
  },
];

export const getBoat = (id: string): BoatDef => BOATS.find((b) => b.id === id) ?? BOATS[0];
