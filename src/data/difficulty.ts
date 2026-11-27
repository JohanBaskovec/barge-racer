export type Difficulty = 'pond' | 'river' | 'ocean';

export interface DifficultyDef {
  id: Difficulty;
  name: string;
  speedMult: number;
  rubberBand: number;
  drillDodge: number;
  reaction: [number, number];
  lineNoise: number;
  startBoostChance: number;
}

export const DIFFICULTIES: Record<Difficulty, DifficultyDef> = {
  pond: { id: 'pond', name: 'Pond', speedMult: 0.9, rubberBand: 0.12, drillDodge: 0.1, reaction: [1.5, 3], lineNoise: 0.35, startBoostChance: 0.1 },
  river: { id: 'river', name: 'River', speedMult: 1.0, rubberBand: 0.07, drillDodge: 0.35, reaction: [0.5, 1.5], lineNoise: 0.2, startBoostChance: 0.4 },
  ocean: { id: 'ocean', name: 'Ocean', speedMult: 1.04, rubberBand: 0.03, drillDodge: 0.65, reaction: [0.2, 0.6], lineNoise: 0.08, startBoostChance: 0.8 },
};
