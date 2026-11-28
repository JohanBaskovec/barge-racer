/**
 * Taunts: short phrases a player sends to the others, shown in a bubble over their boat (in the
 * lobby, beside their name). AI boats use them too, when they overtake you or answer yours.
 */
export const TAUNTS = ['honk', 'bye', 'slow', 'sorry', 'nice', 'cheers'] as const;
export type TauntId = (typeof TAUNTS)[number];

export const isTaunt = (id: unknown): id is TauntId => typeof id === 'string' && (TAUNTS as readonly string[]).includes(id);

/** How long a bubble stays up (s), and the shortest time between two taunts from one player (s). */
export const TAUNT_SHOW = 2.6;
export const TAUNT_COOLDOWN = 1.2;
