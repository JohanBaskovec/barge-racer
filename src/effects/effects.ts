import { TUNING } from '../data/items';

export type EffectKind =
  | 'boost' | 'jigsaw' | 'spinOut' | 'invulnerable' | 'sinking' | 'glued'
  /** Mushrooms: on the user, crates fly to them. */
  | 'magnet'
  /** Mushrooms: was ahead of the user, now small, light and a little slower. */
  | 'shrunk'
  /** Mushrooms: was behind the user, now faster. */
  | 'hasty'
  /** Electrical failure: controls are stuck. */
  | 'blackout'
  /** Raclette: the screen is covered in melted cheese (the AI can't see where it is going either). */
  | 'cheesed'
  /** Kärcher, on the user: spraying water to both sides. */
  | 'karcher'
  /** Kärcher, on the victims: wet, so reaching the bank is a crash. */
  | 'soaked'
  /** In another boat's slipstream: a little faster. */
  | 'draft'
  /** Rocked by a wake (for the view). */
  | 'rocked'
  /** A giant dildo on the bow: ramming hurts. */
  | 'dildo'
  /** Gas siphoned: no thrust, the boat stops. */
  | 'siphoned'
  /** Towed by a tugboat: steered along the canal, fast, through glue. */
  | 'towed'
  /** Beer: tipsy, the boat weaves and the screen goes green and wavy. */
  | 'drunk'
  /** Clogged toilet, on the user: leaving a trail of toxic smoke. */
  | 'flushing'
  /** Beer dispenser: a head of foam that takes the next hit. */
  | 'shielded'
  /** Vacuum cleaner, on the user: sucking the boats ahead in. */
  | 'vacuum'
  /** Pulled over by the police: stopped while the ticket is written. */
  | 'ticketed'
  /** Caught on an angler's line: dragged towards the bank. */
  | 'hooked'
  /** Ran over birds, rowers or swimmers: slowed by the mess for a moment. */
  | 'splattered';

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
  /** Extra forward drag per second (glue). */
  drag: number;
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
  const m: Mods = { topSpeed: 1, accel: 1, turnRate: 1, mass: 1, control: 1, drag: 0 };
  const boosted = hasEffect(holder, 'boost') || hasEffect(holder, 'towed');
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
      case 'dildo':
        m.topSpeed *= TUNING.dildo.speedMult;
        break;
      case 'siphoned':
        m.accel = 0;
        m.drag += TUNING.siphon.drag;
        break;
      case 'ticketed':
        m.accel = 0;
        m.control = 0;
        m.drag += TUNING.cops.ticketDrag;
        break;
      case 'splattered':
        m.topSpeed *= TUNING.critters.slowMult;
        m.drag += TUNING.critters.drag;
        break;
      case 'towed':
        m.topSpeed *= TUNING.tugboat.topSpeed;
        m.accel *= TUNING.tugboat.accel;
        m.mass *= TUNING.tugboat.mass;
        break;
      case 'glued':
        if (boosted) break;
        if (holder.inGlue) {
          m.topSpeed *= TUNING.glue.speedMult;
          m.turnRate *= TUNING.glue.turnMult;
          m.accel *= TUNING.glue.accelMult;
          m.drag += TUNING.glue.drag;
        } else {
          m.topSpeed *= TUNING.glue.stickyMult;
          m.accel *= TUNING.glue.stickyAccelMult;
        }
        break;
      case 'shrunk':
        m.topSpeed *= TUNING.mushroom.shrunkSpeed;
        break;
      case 'draft':
        m.topSpeed *= TUNING.draft.topSpeed;
        m.accel *= TUNING.draft.accel;
        break;
      case 'soaked':
        m.turnRate *= TUNING.karcher.soakedTurnMult;
        break;
      case 'hasty':
        m.topSpeed *= TUNING.mushroom.hastySpeed;
        m.accel *= TUNING.mushroom.hastyAccel;
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
