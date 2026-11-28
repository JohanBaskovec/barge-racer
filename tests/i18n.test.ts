import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BOATS } from '../src/data/boats';
import { DIFFICULTIES } from '../src/data/difficulty';
import { ITEM_INFO } from '../src/data/items';
import { TRACK_DEFS } from '../src/data/tracks';
import { en } from '../src/i18n/en';
import { LANGUAGES, borrowLanguage, getLanguage, homeLanguage, boatDesc, boatName, difficultyName, itemName, ordinal, setLanguage, t, trackDesc, trackName, type TranslationKey } from '../src/i18n';

const placeholders = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const keys = Object.keys(en) as TranslationKey[];

describe('translations', () => {
  for (const lang of LANGUAGES) {
    describe(lang.name, () => {
      it('has exactly the same keys as English', () => {
        expect(Object.keys(lang.strings).sort()).toEqual([...keys].sort());
      });

      it('has no empty strings and the same {placeholders} as English', () => {
        for (const k of keys) {
          expect(lang.strings[k].trim(), k).not.toBe('');
          expect(placeholders(lang.strings[k]), k).toEqual(placeholders(en[k]));
        }
      });

      it('names every boat, track, item and difficulty', () => {
        setLanguage(lang.code);
        for (const b of BOATS) {
          expect(boatName(b.id)).not.toMatch(/^boat\./);
          expect(lang.strings[`boat.${b.id}.name` as TranslationKey], b.id).toBeTruthy();
          expect(lang.strings[`boat.${b.id}.desc` as TranslationKey], b.id).toBeTruthy();
        }
        for (const d of TRACK_DEFS) {
          expect(lang.strings[`track.${d.id}.name` as TranslationKey], d.id).toBeTruthy();
          expect(lang.strings[`track.${d.id}.desc` as TranslationKey], d.id).toBeTruthy();
        }
        for (const id of Object.keys(ITEM_INFO)) expect(lang.strings[`item.${id}` as TranslationKey], id).toBeTruthy();
        for (const id of Object.keys(DIFFICULTIES)) expect(lang.strings[`difficulty.${id}` as TranslationKey], id).toBeTruthy();
        void [boatDesc, trackName, trackDesc, itemName, difficultyName];
      });
    });
  }
});

describe('t()', () => {
  beforeEach(() => setLanguage('en'));

  it('fills placeholders', () => {
    expect(t('hud.lap', { n: 2, total: 3 })).toBe('Lap 2/3');
  });

  it('switches language', () => {
    setLanguage('fr');
    expect(t('hud.lap', { n: 2, total: 3 })).toBe('Tour 2/3');
    expect(trackName('lockAndLoad')).toBe('Écluse Express');
  });

  it('Lost in Translation: a borrowed language for a while, then back to your own (never saved)', () => {
    vi.useFakeTimers();
    setLanguage('fr');
    borrowLanguage('de', 20);
    expect(getLanguage().code).toBe('de');
    expect(homeLanguage().code).toBe('fr');
    expect(t('hud.speak')).toBe('Sprechen Sie Deutsch?');
    vi.advanceTimersByTime(19000);
    expect(getLanguage().code).toBe('de');
    vi.advanceTimersByTime(1500);
    expect(getLanguage().code).toBe('fr');
    // choosing a language yourself ends a borrowed one
    borrowLanguage('es', 20);
    setLanguage('en');
    vi.advanceTimersByTime(30000);
    expect(getLanguage().code).toBe('en');
    vi.useRealTimers();
  });

  it('speaks German and Spanish too, with their own ordinals', () => {
    setLanguage('de');
    expect(t('hud.lap', { n: 2, total: 3 })).toBe('Runde 2/3');
    expect(ordinal(3)).toBe('3.');
    setLanguage('es');
    expect(ordinal(3)).toBe('3.º');
    expect(LANGUAGES.map((l) => l.code)).toEqual(['en', 'fr', 'de', 'es']);
  });

  it('calls volunteers "bénévoles" in French', () => {
    setLanguage('fr');
    expect(t('item.volunteer')).toBe('Bénévoles');
    expect(Object.values(LANGUAGES.find((l) => l.code === 'fr')!.strings).join(' ')).not.toMatch(/volontaire/i);
  });

  it('ignores unknown language codes', () => {
    setLanguage('xx');
    expect(t('pause.title')).toBe('Paused');
  });

  it('formats ordinals per language', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd']);
    setLanguage('fr');
    expect([1, 2, 3, 4].map(ordinal)).toEqual(['1er', '2e', '3e', '4e']);
  });
});
