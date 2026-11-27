import { beforeEach, describe, expect, it } from 'vitest';
import { BOATS } from '../src/data/boats';
import { DIFFICULTIES } from '../src/data/difficulty';
import { ITEM_INFO } from '../src/data/items';
import { TRACK_DEFS } from '../src/data/tracks';
import { en } from '../src/i18n/en';
import { LANGUAGES, boatDesc, boatName, difficultyName, itemName, ordinal, setLanguage, t, trackDesc, trackName, type TranslationKey } from '../src/i18n';

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
