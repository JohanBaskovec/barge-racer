# Localization

All text the player sees comes from `src/i18n/`. Languages so far: **English**
(reference) and **French**.

## How it works

- `src/i18n/en.ts` holds every string, keyed (`'hud.lap': 'Lap {n}/{total}'`).
  `{placeholders}` are filled by `t(key, { n: 2, total: 3 })`.
- Other languages (`fr.ts`) are typed as `Record<TranslationKey, string>`, so the
  compiler refuses a language that is missing a key.
- `src/i18n/index.ts` picks the language: the saved choice (`localStorage`), else
  the first supported language in the browser's preferences, else English. It also
  sets `<html lang>` and the "rotate your device" overlay.
- The player changes language with the buttons at the top left of the title screen.
- Names of boats, tracks, items and difficulties are **not** in the data files;
  they are looked up by id (`boat.<id>.name`, `track.<id>.desc`, `item.<id>`,
  `difficulty.<id>`) through `boatName()`, `trackName()`, `itemName()` and so on.
- Ordinals ("1st", "1er") differ per language, so each language supplies an
  `ordinal(n)` function.
- Computer opponents' names (Captain Bob, ...) are the same in every language.

## Adding a language

1. Copy `src/i18n/fr.ts` to e.g. `de.ts` and translate every value. Keep the
   `{placeholders}` exactly as they are. Write an `ordinal` function.
2. Register it in the `LANGUAGES` list in `src/i18n/index.ts`
   (`{ code: 'de', name: 'Deutsch', strings: de, ordinal: deOrdinal }`).
3. Run `npm test`: `tests/i18n.test.ts` checks that no key is missing or empty and
   that the placeholders match English. `npm run typecheck` checks the keys too.
4. Look at it in the game. Translations are often longer than English; labels shrink
   to fit their button, but check the track cards and boat descriptions.

The title screen shows one button per language, which works for a handful of
languages. With many more, change it to a single button that opens a list.

## Adding or changing text

Add the key to `en.ts`, then to every other language (the compiler will point at
each file that is missing it). Never build sentences by joining pieces in code:
word order differs between languages, so use one string with placeholders.

## Not translated yet

- The debug overlay (`?debug=1`).
- Fonts: the game uses a system font stack that covers Latin scripts with accents.
  Languages such as Japanese, Arabic or Korean will need font and layout work
  (right-to-left in particular).
