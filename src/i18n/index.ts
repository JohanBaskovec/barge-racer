import { en, enOrdinal, type TranslationKey } from './en';
import { fr, frOrdinal } from './fr';
import { de, deOrdinal } from './de';
import { es, esOrdinal } from './es';

export type { TranslationKey };

export interface Language {
  /** BCP 47 code, also used for <html lang>. */
  code: string;
  /** Name in the language itself, shown in the language picker. */
  name: string;
  strings: Record<TranslationKey, string>;
  ordinal: (n: number) => string;
}

/** Add a language here (and create its file next to en.ts); see docs/localization.md. */
export const LANGUAGES: Language[] = [
  { code: 'en', name: 'English', strings: en, ordinal: enOrdinal },
  { code: 'fr', name: 'Français', strings: fr, ordinal: frOrdinal },
  { code: 'de', name: 'Deutsch', strings: de, ordinal: deOrdinal },
  { code: 'es', name: 'Español', strings: es, ordinal: esOrdinal },
];

const KEY = 'barge-racer-lang';
const byCode = (code: string | null | undefined): Language | undefined => LANGUAGES.find((l) => l.code === code);

/** Saved choice, else the first browser language we support, else English. */
function detect(): Language {
  try {
    const saved = byCode(localStorage.getItem(KEY));
    if (saved) return saved;
  } catch {
    /* storage unavailable */
  }
  const prefs = typeof navigator !== 'undefined' ? (navigator.languages?.length ? navigator.languages : [navigator.language]) : [];
  for (const p of prefs) {
    const found = byCode(p?.toLowerCase().split('-')[0]);
    if (found) return found;
  }
  return LANGUAGES[0];
}

let current: Language = detect();

/** Keep the page itself (lang attribute, the "rotate your device" overlay) in the chosen language. */
function applyToDocument(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = current.code;
  const rotate = document.getElementById('rotate');
  if (rotate) rotate.textContent = t('rotate');
}

export const getLanguage = (): Language => current;

/** Lost in Translation: the player's own language while another one is borrowed (null: none borrowed). */
let home: Language | null = null;
let borrowTimer: ReturnType<typeof setTimeout> | undefined;

/** The player's own language (the one chosen), even while another is borrowed. */
export const homeLanguage = (): Language => home ?? current;

/**
 * Lost in Translation: the whole game in another language for `seconds` (menus too, whatever
 * screen the player is on by then), then back. Not saved.
 */
export function borrowLanguage(code: string, seconds: number): void {
  const lang = byCode(code);
  if (!lang) return;
  home ??= current;
  current = lang;
  applyToDocument();
  clearTimeout(borrowTimer);
  borrowTimer = setTimeout(() => {
    if (home) current = home;
    home = null;
    applyToDocument();
  }, seconds * 1000);
}

export function setLanguage(code: string): void {
  const lang = byCode(code);
  if (!lang) return;
  // Choosing a language ends a borrowed one.
  clearTimeout(borrowTimer);
  home = null;
  current = lang;
  try {
    localStorage.setItem(KEY, lang.code);
  } catch {
    /* ignore */
  }
  applyToDocument();
}

/** Translate a key, filling {placeholders}. Missing keys fall back to English. */
export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  const s = current.strings[key] ?? en[key];
  return params ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : s;
}

export const ordinal = (n: number): string => current.ordinal(n);

/** A number with a fixed count of decimals, in the current language's style (9.9 / 9,9). */
/** Number formatters by language and digits: making one is slow, and the HUD formats every frame. */
const formatters = new Map<string, Intl.NumberFormat>();
export function formatNumber(n: number, digits = 1): string {
  const k = `${current.code}/${digits}`;
  let f = formatters.get(k);
  if (!f) formatters.set(k, (f = new Intl.NumberFormat(current.code, { minimumFractionDigits: digits, maximumFractionDigits: digits })));
  return f.format(n);
}

// Names of game content, looked up by id so the data files stay language-free.
const key = (s: string): TranslationKey => s as TranslationKey;
export const boatName = (id: string): string => t(key(`boat.${id}.name`));
export const boatDesc = (id: string): string => t(key(`boat.${id}.desc`));
export const trackName = (id: string): string => t(key(`track.${id}.name`));
export const trackDesc = (id: string): string => t(key(`track.${id}.desc`));
export const itemName = (id: string): string => t(key(`item.${id}`));
export const difficultyName = (id: string): string => t(key(`difficulty.${id}`));

applyToDocument();
