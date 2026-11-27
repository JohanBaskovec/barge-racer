/** Player options, saved in localStorage (versioned so a future change can migrate them). */
export interface Options {
  version: 1;
  /** 0..1 */
  musicVolume: number;
  /** 0..1 */
  sfxVolume: number;
  /**
   * Item buttons on the bottom right instead of the bottom left. By default they are on the left,
   * for the left thumb, while the right hand steers (replaces the old `leftHanded`, which put them
   * on the left when set).
   */
  itemsRight: boolean;
  /** Fire held items automatically when a good target is in range. */
  autoFire: boolean;
  /** No screen shake and no hit pauses. */
  reducedShake: boolean;
}

const KEY = 'barge-racer-options';

export const DEFAULT_OPTIONS: Options = {
  version: 1,
  musicVolume: 0.6,
  sfxVolume: 0.8,
  itemsRight: false,
  autoFire: false,
  reducedShake: false,
};

export const options: Options = { ...DEFAULT_OPTIONS };

const listeners: ((o: Options) => void)[] = [];

/** Merge saved values over the defaults, ignoring anything of the wrong type. */
export function parseOptions(raw: unknown): Options {
  const out: Options = { ...DEFAULT_OPTIONS };
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  const vol = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d);
  const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
  out.musicVolume = vol(r.musicVolume, out.musicVolume);
  out.sfxVolume = vol(r.sfxVolume, out.sfxVolume);
  out.itemsRight = bool(r.itemsRight, out.itemsRight);
  out.autoFire = bool(r.autoFire, out.autoFire);
  out.reducedShake = bool(r.reducedShake, out.reducedShake);
  return out;
}

try {
  Object.assign(options, parseOptions(JSON.parse(localStorage.getItem(KEY) ?? 'null')));
} catch {
  /* storage unavailable: defaults */
}

export function setOption<K extends keyof Options>(key: K, value: Options[K]): void {
  options[key] = value;
  try {
    localStorage.setItem(KEY, JSON.stringify(options));
  } catch {
    /* ignore */
  }
  for (const l of listeners) l(options);
}

export function onOptionsChange(fn: (o: Options) => void): void {
  listeners.push(fn);
}
