import { type Ctx, midiToFreq, noise, tone } from './synth';

/**
 * A tiny step sequencer and the game's music, written as text.
 *
 * Note tracks are space-separated tokens, each `NOTE[:steps]`: `C4`, `F#3:2`, `Bb4:3`, chords
 * joined with `+` (`C4+E4+G4:8`), and rests `.` or `.:steps`. A step is an eighth note.
 * Drum patterns are one bar long and repeat: `x` = hit, `.` = nothing.
 */

export type Instrument = 'bass' | 'lead' | 'pad' | 'acc' | 'slide' | 'stab';

export interface Theme {
  bpm: number;
  /** Steps (eighth notes) per bar: 8 for 4/4, 6 for a 3/4 waltz. */
  stepsPerBar: number;
  bars: number;
  transpose?: number;
  tracks: { inst: Instrument; notes: string }[];
  drums?: { kick?: string; snare?: string; hat?: string };
}

export interface NoteEvent {
  step: number;
  inst: Instrument;
  midi: number[];
  steps: number;
}

const NOTE_INDEX: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "C#4" -> 61 */
export function noteToMidi(name: string): number {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) throw new Error(`Bad note: ${name}`);
  return (Number(m[3]) + 1) * 12 + NOTE_INDEX[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

/** Parse a note track into events; returns them with the total length in steps. */
export function parseTrack(inst: Instrument, text: string): { events: NoteEvent[]; length: number } {
  const events: NoteEvent[] = [];
  let step = 0;
  for (const tok of text.trim().split(/\s+/)) {
    const [what, len] = tok.split(':');
    const steps = len ? Number(len) : 1;
    if (!Number.isFinite(steps) || steps <= 0) throw new Error(`Bad length in ${tok}`);
    if (what !== '.') events.push({ step, inst, midi: what.split('+').map(noteToMidi), steps });
    step += steps;
  }
  return { events, length: step };
}

/** All note events of a theme, checking every track is exactly the loop's length. */
export function compileTheme(theme: Theme): NoteEvent[] {
  const loop = theme.bars * theme.stepsPerBar;
  const out: NoteEvent[] = [];
  for (const t of theme.tracks) {
    const { events, length } = parseTrack(t.inst, t.notes);
    if (length !== loop) throw new Error(`${t.inst} track is ${length} steps, the loop is ${loop}`);
    out.push(...events.map((e) => ({ ...e, midi: e.midi.map((m) => m + (theme.transpose ?? 0)) })));
  }
  return out;
}

// ---------------------------------------------------------------------------- themes

const MENU: Theme = {
  bpm: 100,
  stepsPerBar: 8,
  bars: 8,
  tracks: [
    {
      inst: 'bass',
      notes: `C3:2 G2:2 C3:2 G2:2  A2:2 E2:2 A2:2 E2:2  F2:2 C3:2 F2:2 C3:2  G2:2 D3:2 G2:2 D3:2
              C3:2 G2:2 C3:2 G2:2  A2:2 E2:2 A2:2 E2:2  F2:2 C3:2 G2:2 D3:2  C3:4 G2:4`,
    },
    {
      inst: 'lead',
      notes: `E5:2 G5:2 E5 D5 C5:2  A4:3 C5 E5:4  F5:2 E5 D5 C5:2 A4:2  B4:2 D5:2 G4:4
              E5:2 G5:2 C6:2 B5 A5  G5:3 E5 C5:4  A5:2 G5:2 F5:2 D5:2  C5:6 .:2`,
    },
    {
      inst: 'pad',
      notes: `C4+E4+G4:8 A3+C4+E4:8 F3+A3+C4:8 G3+B3+D4:8 C4+E4+G4:8 A3+C4+E4:8 F3+A3+C4:4 G3+B3+D4:4 C4+E4+G4:8`,
    },
  ],
  drums: { kick: 'x...x...', hat: '..x...x.' },
};

const RACE: Theme = {
  bpm: 140,
  stepsPerBar: 8,
  bars: 8,
  tracks: [
    {
      inst: 'bass',
      notes: `A2 A2 A3 A2 A2 A3 A2 A3  F2 F2 F3 F2 F2 F3 F2 F3  C3 C3 C4 C3 C3 C4 C3 C4  G2 G2 G3 G2 G2 G3 G2 G3
              A2 A2 A3 A2 A2 A3 A2 A3  F2 F2 F3 F2 F2 F3 F2 F3  G2 G2 G3 G2 G2 G3 G2 G3  E2 E2 E3 E2 E2 E3 E2 E3`,
    },
    {
      inst: 'lead',
      notes: `A4 C5 E5 A5 G5:2 E5:2  F5:2 E5 C5 A4:2 C5:2  G4 C5 E5 G5 E5:2 C5:2  D5:2 B4 G4 B4:2 D5:2
              A5:2 G5 E5 C5:2 E5:2  F5:2 A5:2 G5:2 F5:2  G5 F5 E5 D5 B4:2 D5:2  E5:3 G#4 B4:2 E5:2`,
    },
    {
      inst: 'stab',
      notes: `.:2 A3+C4+E4:2 .:2 A3+C4+E4:2  .:2 F3+A3+C4:2 .:2 F3+A3+C4:2  .:2 C4+E4+G4:2 .:2 C4+E4+G4:2  .:2 G3+B3+D4:2 .:2 G3+B3+D4:2
              .:2 A3+C4+E4:2 .:2 A3+C4+E4:2  .:2 F3+A3+C4:2 .:2 F3+A3+C4:2  .:2 G3+B3+D4:2 .:2 G3+B3+D4:2  .:2 E3+G#3+B3:2 .:2 E3+G#3+B3:2`,
    },
  ],
  drums: { kick: 'x...x...', snare: '..x...x.', hat: 'xxxxxxxx' },
};

/** Same tune, a tone lower, with a heavier kick: factories and cranes. */
const INDUSTRIAL: Theme = { ...RACE, bpm: 132, transpose: -2, drums: { kick: 'x..xx...', snare: '..x...x.', hat: 'x.xxx.xx' } };

const BAYOU: Theme = {
  bpm: 96,
  stepsPerBar: 8,
  bars: 8,
  tracks: [
    {
      inst: 'bass',
      notes: `E2:2 G2:2 A2:2 B2:2  B2:2 A2:2 G2:2 E2:2  A2:2 C3:2 D3:2 E3:2  E2:2 G2:2 B2:2 G2:2
              B2:2 D#3:2 F#3:2 A3:2  A2:2 C3:2 E3:2 C3:2  E2:2 B2:2 G2:2 E2:2  B2:2 A2:2 F#2:2 D#2:2`,
    },
    {
      inst: 'slide',
      notes: `E4:2 G4:2 A4 A#4 B4:2  B4:4 .:2 G4:2  A4:2 C5:2 A4:2 E4:2  G4:3 E4 E4:4
              F#4:2 A4:2 B4:2 D#5:2  E5:2 C5:2 A4:4  G4:2 E4:2 B3:2 E4:2  D#4:4 F#4:2 B3:2`,
    },
  ],
  drums: { kick: 'x..x..x.', snare: '....x...', hat: 'x.x.x.x.' },
};

/** Reims: a musette waltz on the accordion, oom-pah-pah. */
const CITY: Theme = {
  bpm: 168,
  stepsPerBar: 6,
  bars: 8,
  tracks: [
    { inst: 'bass', notes: `G2:2 .:4  E2:2 .:4  A2:2 .:4  D2:2 .:4  G2:2 .:4  E2:2 .:4  A2:2 .:1 D2:2 .:1  G2:2 .:4` },
    {
      inst: 'stab',
      notes: `.:2 G3+B3+D4 . G3+B3+D4 .  .:2 G3+B3+E4 . G3+B3+E4 .  .:2 A3+C4+E4 . A3+C4+E4 .  .:2 F#3+A3+C4 . F#3+A3+C4 .
              .:2 G3+B3+D4 . G3+B3+D4 .  .:2 G#3+B3+D4 . G#3+B3+D4 .  .:2 A3+C4+E4 . F#3+A3+C4 .  .:2 G3+B3+D4 . G3+B3+D4 .`,
    },
    {
      inst: 'acc',
      notes: `D5:2 B4 C5 D5:2  E5:2 G5:2 E5:2  C5:2 A4 B4 C5:2  D5:3 C5 A4:2
              B4:2 D5:2 G5:2  G#4:2 B4:2 E5:2  A4:2 C5 E5 D5 F#4  G4:4 .:2`,
    },
  ],
  drums: { hat: '..x.x.' },
};

/** Champagne Hills: a quick galop on the accordion, bass and chords on the beat and off it. */
const VINEYARD: Theme = {
  bpm: 152,
  stepsPerBar: 8,
  bars: 8,
  tracks: [
    {
      inst: 'bass',
      notes: `D3 A2 D3 A2 D3 A2 D3 A2  D3 A2 D3 A2 D3 A2 D3 A2  G2 D3 G2 D3 G2 D3 G2 D3  A2 E3 A2 E3 A2 E3 A2 E3
              D3 A2 D3 A2 D3 A2 D3 A2  B2 F#3 B2 F#3 B2 F#3 B2 F#3  E3 B2 E3 B2 A2 E3 A2 E3  D3 A2 D3 A2 D3:4`,
    },
    {
      inst: 'stab',
      notes: `. D4+F#4+A4 . D4+F#4+A4 . D4+F#4+A4 . D4+F#4+A4  . D4+F#4+A4 . D4+F#4+A4 . D4+F#4+A4 . D4+F#4+A4
              . D4+G4+B4 . D4+G4+B4 . D4+G4+B4 . D4+G4+B4  . C#4+E4+A4 . C#4+E4+A4 . C#4+E4+A4 . C#4+E4+A4
              . D4+F#4+A4 . D4+F#4+A4 . D4+F#4+A4 . D4+F#4+A4  . B3+D4+F#4 . B3+D4+F#4 . B3+D4+F#4 . B3+D4+F#4
              . E4+G4+B4 . E4+G4+B4 . C#4+E4+A4 . C#4+E4+A4  . D4+F#4+A4 . D4+F#4+A4 .:4`,
    },
    {
      inst: 'acc',
      notes: `A4 D5 F#5 A5 F#5:2 D5:2  E5 F#5 E5 D5 A4:4  B4 D5 G5 B5 G5:2 D5:2  C#5 E5 A5 G5 F#5:2 E5:2
              F#5 A5 D6:2 C#6 B5 A5:2  B5 A5 F#5 D5 B4:4  G5 F#5 E5 G5 C#5:2 E5:2  D5:4 .:2 A4:2`,
    },
  ],
  drums: { kick: 'x...x...', snare: '..x...x.', hat: 'x.x.x.x.' },
};

/** Harbour Rush and the Frozen Fjord: a sea shanty in 6/8, on the accordion. */
const SHANTY: Theme = {
  bpm: 150,
  stepsPerBar: 6,
  bars: 8,
  tracks: [
    { inst: 'bass', notes: `D2:3 A2:3  D2:3 A2:3  C3:3 G2:3  C3:3 G2:3  Bb2:3 F2:3  G2:3 D2:3  A2:3 E2:3  D2:3 A2:3` },
    {
      inst: 'stab',
      notes: `. D4+F4+A4 .:2 D4+F4+A4 .  . D4+F4+A4 .:2 D4+F4+A4 .  . C4+E4+G4 .:2 C4+E4+G4 .  . C4+E4+G4 .:2 C4+E4+G4 .
              . Bb3+D4+F4 .:2 Bb3+D4+F4 .  . G3+Bb3+D4 .:2 G3+Bb3+D4 .  . A3+C#4+E4 .:2 A3+C#4+E4 .  . D4+F4+A4 .:2 D4+F4+A4 .`,
    },
    {
      inst: 'acc',
      notes: `D4:2 F4 A4:2 D5  C5:2 A4 F4:3  E4:2 G4 C5:2 E5  D5:2 C5 G4:3
              F4:2 A4 D5:2 F5  E5:2 D5 Bb4:3  A4:2 C#5 E5:2 G5  F5:3 D5:3`,
    },
  ],
  drums: { kick: 'x.....', snare: '...x..', hat: '..x..x' },
};

/** The Tropical Lagoon: a sunny calypso. */
const CALYPSO: Theme = {
  bpm: 124,
  stepsPerBar: 8,
  bars: 8,
  tracks: [
    {
      inst: 'bass',
      notes: `C3:3 C3 . G2:3  F2:3 F2 . C3:3  G2:3 G2 . D3:3  C3:3 C3 . G2:3
              C3:3 C3 . G2:3  F2:3 F2 . C3:3  G2:3 G2 . D3:3  C3:3 C3 . G2:3`,
    },
    {
      inst: 'stab',
      notes: `. C4+E4+G4 . C4+E4+G4 . C4+E4+G4 . C4+E4+G4  . C4+F4+A4 . C4+F4+A4 . C4+F4+A4 . C4+F4+A4
              . B3+D4+G4 . B3+D4+G4 . B3+D4+G4 . B3+D4+G4  . C4+E4+G4 . C4+E4+G4 . C4+E4+G4 . C4+E4+G4
              . C4+E4+G4 . C4+E4+G4 . C4+E4+G4 . C4+E4+G4  . C4+F4+A4 . C4+F4+A4 . C4+F4+A4 . C4+F4+A4
              . B3+D4+G4 . B3+D4+G4 . B3+D4+G4 . B3+D4+G4  . C4+E4+G4 . C4+E4+G4 . C4+E4+G4 . C4+E4+G4`,
    },
    {
      inst: 'lead',
      notes: `E5 G5 E5 C5:2 E5 G5:2  A5:2 G5 F5 A4:2 C5:2  B4 D5 G5 F5 D5:2 B4:2  C5:6 .:2
              G5 E5 G5 C6:2 G5 E5:2  F5:2 A5 F5 C5:2 A4:2  D5 F5 B5 A5 G5:2 F5:2  E5:2 D5:2 C5:4`,
    },
  ],
  drums: { kick: 'x..x..x.', snare: '....x...', hat: '.x.x.x.x' },
};

export const THEMES = { menu: MENU, race: RACE, industrial: INDUSTRIAL, bayou: BAYOU, city: CITY, vineyard: VINEYARD, shanty: SHANTY, calypso: CALYPSO };
export type ThemeName = keyof typeof THEMES;

// ---------------------------------------------------------------------------- instruments

function play(c: Ctx, d: AudioNode, inst: Instrument, midi: number[], at: number, dur: number): void {
  for (const m of midi) {
    const freq = midiToFreq(m);
    switch (inst) {
      case 'bass':
        tone(c, d, { type: 'triangle', freq, dur: dur * 0.9, gain: 0.26, at, release: 0.04 });
        tone(c, d, { type: 'square', freq, dur: dur * 0.9, gain: 0.04, at, lowpass: 500, release: 0.04 });
        break;
      case 'lead':
        tone(c, d, { type: 'square', freq, dur: dur * 0.92, gain: 0.07, at, lowpass: 2600, vibrato: [8, 5.5], release: 0.06 });
        break;
      case 'pad':
        tone(c, d, { type: 'triangle', freq, dur, gain: 0.045, at, attack: 0.12, release: 0.25 });
        break;
      case 'acc':
        tone(c, d, { type: 'sawtooth', freq, dur: dur * 0.95, gain: 0.04, at, lowpass: 2200, detune: -8, vibrato: [10, 5.5], release: 0.05 });
        tone(c, d, { type: 'sawtooth', freq, dur: dur * 0.95, gain: 0.04, at, lowpass: 2200, detune: 8, vibrato: [10, 5.5], release: 0.05 });
        break;
      case 'slide':
        tone(c, d, { type: 'triangle', freq, dur: dur * 0.95, gain: 0.13, at, vibrato: [22, 5], attack: 0.03, release: 0.08 });
        tone(c, d, { type: 'sine', freq: freq / 2, dur: dur * 0.95, gain: 0.05, at, release: 0.08 });
        break;
      case 'stab':
        tone(c, d, { type: 'square', freq, dur: Math.min(dur, 0.16), gain: 0.028, at, lowpass: 1400, release: 0.05 });
        break;
    }
  }
}

function drum(c: Ctx, d: AudioNode, kind: 'kick' | 'snare' | 'hat', at: number): void {
  if (kind === 'kick') tone(c, d, { type: 'sine', freq: 150, freqEnd: 45, dur: 0.16, gain: 0.5, at });
  else if (kind === 'snare') {
    noise(c, d, { dur: 0.12, filter: 'bandpass', freq: 1800, q: 0.9, gain: 0.22, at });
    tone(c, d, { type: 'triangle', freq: 190, dur: 0.06, gain: 0.12, at });
  } else noise(c, d, { dur: 0.04, filter: 'highpass', freq: 7000, gain: 0.07, at });
}

// ---------------------------------------------------------------------------- player

/** Plays one theme in a loop, scheduling notes a little ahead of time (the standard Web Audio way). */
export class MusicPlayer {
  private timer: ReturnType<typeof setInterval> | null = null;
  private events: NoteEvent[][] = [];
  private theme: Theme | null = null;
  private step = 0;
  private nextTime = 0;
  current: ThemeName | null = null;

  constructor(private ctx: Ctx, private dest: AudioNode) {}

  start(name: ThemeName): void {
    if (this.current === name) return;
    this.stop();
    const theme = THEMES[name];
    const loop = theme.bars * theme.stepsPerBar;
    this.events = Array.from({ length: loop }, () => []);
    for (const e of compileTheme(theme)) this.events[e.step].push(e);
    this.theme = theme;
    this.current = name;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.12;
    this.timer = setInterval(() => this.schedule(), 25);
    this.schedule();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.current = null;
    this.theme = null;
  }

  /** Render `seconds` of a theme straight away (used by tests with an OfflineAudioContext). */
  renderAll(name: ThemeName, seconds: number): void {
    this.start(name);
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const end = this.ctx.currentTime + seconds;
    while (this.nextTime < end) this.scheduleStep();
  }

  private schedule(): void {
    if (!this.theme) return;
    while (this.nextTime < this.ctx.currentTime + 0.15) this.scheduleStep();
  }

  private scheduleStep(): void {
    const theme = this.theme!;
    const stepDur = 60 / theme.bpm / 2;
    const at = this.nextTime - this.ctx.currentTime;
    for (const e of this.events[this.step]) play(this.ctx, this.dest, e.inst, e.midi, at, e.steps * stepDur);
    const inBar = this.step % theme.stepsPerBar;
    for (const kind of ['kick', 'snare', 'hat'] as const) {
      const pattern = theme.drums?.[kind];
      if (pattern && pattern[inBar % pattern.length] === 'x') drum(this.ctx, this.dest, kind, at);
    }
    this.step = (this.step + 1) % this.events.length;
    this.nextTime += stepDur;
  }
}
