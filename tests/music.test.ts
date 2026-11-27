import { describe, expect, it } from 'vitest';
import { THEMES, compileTheme, noteToMidi, parseTrack } from '../src/audio/music';
import { DEFAULT_OPTIONS, parseOptions } from '../src/options';

describe('music notation', () => {
  it('reads note names', () => {
    expect(noteToMidi('A4')).toBe(69);
    expect(noteToMidi('C4')).toBe(60);
    expect(noteToMidi('C#4')).toBe(61);
    expect(noteToMidi('Bb3')).toBe(58);
  });

  it('reads lengths, chords and rests', () => {
    const { events, length } = parseTrack('pad', 'C4+E4+G4:4 . D4:2 .:3');
    expect(length).toBe(10);
    expect(events).toEqual([
      { step: 0, inst: 'pad', midi: [60, 64, 67], steps: 4 },
      { step: 5, inst: 'pad', midi: [62], steps: 2 },
    ]);
  });

  it('rejects nonsense', () => {
    expect(() => parseTrack('lead', 'H4')).toThrow();
    expect(() => parseTrack('lead', 'C4:0')).toThrow();
  });

  for (const [name, theme] of Object.entries(THEMES)) {
    it(`theme "${name}": every track fills exactly the loop`, () => {
      expect(() => compileTheme(theme)).not.toThrow();
      expect(compileTheme(theme).length).toBeGreaterThan(10);
      for (const p of Object.values(theme.drums ?? {})) expect(p.length).toBe(theme.stepsPerBar);
    });
  }
});

describe('options', () => {
  it('fall back to defaults for missing or broken values', () => {
    expect(parseOptions(null)).toEqual(DEFAULT_OPTIONS);
    expect(parseOptions({ musicVolume: 7, sfxVolume: 'loud', itemsRight: true, autoFire: 1 })).toEqual({
      ...DEFAULT_OPTIONS,
      musicVolume: 1,
      itemsRight: true,
    });
  });
});
