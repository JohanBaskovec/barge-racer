import { TUNING } from '../data/items';

export type EffectKind = 'boost' | 'jigsaw' | 'spinOut' | 'invulnerable' | 'sinking' | 'glued';

export interface Effect {
  kind: EffectKind;
  remaining: number;
  duration: number;
}

export interface Mods {
  topSpeed: number;
  accel: number;
  turnRate: number;
  mass: number;
  /** 0 disables steering and thrust (spin-out, sinking). */
  control: number;
}

export interface EffectHolder {
  effects: Effect[];
  inGlue: boolean;
}

export function addEffect(holder: EffectHolder, kind: EffectKind, duration: number): void {
  const e = holder.effects.find((x) => x.kind === kind);
  if (e) {
    e.remaining = Math.max(e.remaining, duration);
    e.duration = Math.max(e.duration, duration);
  } else holder.effects.push({ kind, remaining: duration, duration });
}

export const hasEffect = (holder: EffectHolder, kind: EffectKind): boolean => holder.effects.some((e) => e.kind === kind && e.remaining > 0);

export function removeEffect(holder: EffectHolder, kind: EffectKind): void {
  holder.effects = holder.effects.filter((e) => e.kind !== kind);
}

export function tickEffects(holder: EffectHolder, dt: number): void {
  for (const e of holder.effects) e.remaining -= dt;
  holder.effects = holder.effects.filter((e) => e.remaining > 0);
}

/** Multiply the multipliers of every active effect together. */
export function computeMods(holder: EffectHolder): Mods {
  const m: Mods = { topSpeed: 1, accel: 1, turnRate: 1, mass: 1, control: 1 };
  const boosted = hasEffect(holder, 'boost');
  for (const e of holder.effects) {
    switch (e.kind) {
      case 'boost':
        m.topSpeed *= TUNING.powder.topSpeedMult;
        m.accel *= TUNING.powder.accelMult;
        m.mass *= TUNING.powder.massMult;
        break;
      case 'jigsaw':
        m.topSpeed *= TUNING.jigsaw.speedMult;
        break;
      case 'glued':
        if (boosted) break;
        if (holder.inGlue) {
          m.topSpeed *= TUNING.glue.speedMult;
          m.turnRate *= TUNING.glue.turnMult;
        } else m.topSpeed *= TUNING.glue.stickyMult;
        break;
      case 'spinOut':
      case 'sinking':
        m.control = 0;
        break;
      default:
        break;
    }
  }
  return m;
}
