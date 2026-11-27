import { type Ctx, midiToFreq, noise, tone } from './synth';

/** Every sound effect in the game, synthesised. Each one plays into `dest` starting now. */
export const SFX = {
  /** UI button */
  click: (c: Ctx, d: AudioNode) => {
    tone(c, d, { type: 'sine', freq: 900, freqEnd: 650, dur: 0.05, gain: 0.25 });
    noise(c, d, { dur: 0.02, filter: 'highpass', freq: 3000, gain: 0.08 });
  },
  countdown: (c: Ctx, d: AudioNode) => tone(c, d, { type: 'square', freq: 660, dur: 0.14, gain: 0.16, lowpass: 3000 }),
  go: (c: Ctx, d: AudioNode) => {
    tone(c, d, { type: 'square', freq: 990, dur: 0.45, gain: 0.16, lowpass: 3500 });
    tone(c, d, { type: 'square', freq: 1320, dur: 0.45, gain: 0.08, lowpass: 3500 });
  },
  /** A crate breaking open: wood crack and a low knock */
  crate: (c: Ctx, d: AudioNode) => {
    noise(c, d, { dur: 0.09, filter: 'bandpass', freq: 1800, q: 2, gain: 0.5 });
    noise(c, d, { dur: 0.18, filter: 'lowpass', freq: 500, gain: 0.35, at: 0.01 });
    tone(c, d, { type: 'triangle', freq: 230, freqEnd: 110, dur: 0.1, gain: 0.3 });
  },
  /** One tick of the item roulette */
  tick: (c: Ctx, d: AudioNode) => tone(c, d, { type: 'square', freq: 1250, dur: 0.03, gain: 0.06, lowpass: 4000 }),
  /** The roulette stops on an item */
  itemReady: (c: Ctx, d: AudioNode) => {
    tone(c, d, { type: 'sine', freq: 1046, dur: 0.3, gain: 0.2 });
    tone(c, d, { type: 'sine', freq: 1568, dur: 0.35, gain: 0.12, at: 0.06 });
  },
  /** A volunteer flying off: "wheee!" */
  volunteer: (c: Ctx, d: AudioNode) => {
    tone(c, d, { type: 'triangle', freq: 520, freqEnd: 1150, dur: 0.5, gain: 0.22, vibrato: [40, 9], attack: 0.03 });
    tone(c, d, { type: 'square', freq: 520, freqEnd: 1150, dur: 0.5, gain: 0.04, lowpass: 1800, attack: 0.03 });
    noise(c, d, { dur: 0.18, filter: 'bandpass', freq: 900, freqEnd: 2400, gain: 0.12 });
  },
  jigsaw: (c: Ctx, d: AudioNode) => {
    tone(c, d, { type: 'sawtooth', freq: 70, freqEnd: 150, dur: 0.3, gain: 0.12, lowpass: 2500 });
  },
  /** White powder: whoosh and sparkles */
  powder: (c: Ctx, d: AudioNode) => {
    noise(c, d, { dur: 0.6, filter: 'bandpass', freq: 400, freqEnd: 3500, q: 1.2, gain: 0.7, attack: 0.05 });
    [2093, 2637, 3136].forEach((f, i) => tone(c, d, { type: 'sine', freq: f, dur: 0.12, gain: 0.08, at: 0.05 + i * 0.06 }));
  },
  drill: (c: Ctx, d: AudioNode) => {
    tone(c, d, { type: 'sawtooth', freq: 300, freqEnd: 1500, dur: 0.35, gain: 0.12, lowpass: 3200 });
    noise(c, d, { dur: 0.08, filter: 'highpass', freq: 2500, gain: 0.15 });
  },
  /** Glue puddle landing */
  glue: (c: Ctx, d: AudioNode) => {
    noise(c, d, { dur: 0.28, filter: 'lowpass', freq: 700, freqEnd: 180, gain: 0.45 });
    tone(c, d, { type: 'sine', freq: 190, freqEnd: 85, dur: 0.22, gain: 0.3 });
  },
  silicone: (c: Ctx, d: AudioNode) => {
    noise(c, d, { dur: 0.2, filter: 'bandpass', freq: 1300, freqEnd: 450, q: 2, gain: 0.35 });
    tone(c, d, { type: 'triangle', freq: 420, freqEnd: 240, dur: 0.12, gain: 0.15 });
  },
  /** Dropping a fake crate behind */
  drop: (c: Ctx, d: AudioNode) => {
    tone(c, d, { type: 'triangle', freq: 170, freqEnd: 90, dur: 0.14, gain: 0.3 });
    noise(c, d, { dur: 0.07, filter: 'bandpass', freq: 1200, gain: 0.2 });
  },
  /** Driving into a fake crate: crack, then a cartoon "boing" */
  trap: (c: Ctx, d: AudioNode) => {
    noise(c, d, { dur: 0.1, filter: 'bandpass', freq: 1600, q: 2, gain: 0.45 });
    tone(c, d, { type: 'sine', freq: 220, freqEnd: 660, dur: 0.18, gain: 0.25, at: 0.05 });
    tone(c, d, { type: 'sine', freq: 660, freqEnd: 260, dur: 0.25, gain: 0.2, at: 0.22 });
  },
  /** Beer: bottle pop and fizz */
  beer: (c: Ctx, d: AudioNode) => {
    noise(c, d, { dur: 0.04, filter: 'highpass', freq: 2500, gain: 0.35 });
    tone(c, d, { type: 'sine', freq: 650, freqEnd: 300, dur: 0.07, gain: 0.25 });
    noise(c, d, { dur: 0.7, filter: 'highpass', freq: 5500, gain: 0.08, at: 0.05, attack: 0.05 });
  },
  /** Mushrooms: a wobbly, dreamy chord */
  mushroom: (c: Ctx, d: AudioNode) => {
    [60, 64, 68, 71].forEach((m, i) =>
      tone(c, d, { type: 'sine', freq: midiToFreq(m), freqEnd: midiToFreq(m + 12), dur: 1.3, gain: 0.07, attack: 0.2, release: 0.5, vibrato: [60, 3 + i], at: i * 0.05 }),
    );
  },
  /** Being hit by an item: thud and clang */
  hit: (c: Ctx, d: AudioNode) => {
    tone(c, d, { type: 'sine', freq: 130, freqEnd: 50, dur: 0.28, gain: 0.5 });
    tone(c, d, { type: 'square', freq: 390, dur: 0.14, gain: 0.08, lowpass: 1800 });
    noise(c, d, { dur: 0.16, filter: 'lowpass', freq: 1800, gain: 0.3 });
  },
  /** Scraping the bank */
  bank: (c: Ctx, d: AudioNode) => {
    noise(c, d, { dur: 0.2, filter: 'lowpass', freq: 900, gain: 0.35 });
    tone(c, d, { type: 'sine', freq: 95, freqEnd: 60, dur: 0.16, gain: 0.3 });
  },
  /** Two boats bumping */
  bump: (c: Ctx, d: AudioNode) => {
    tone(c, d, { type: 'sine', freq: 150, freqEnd: 80, dur: 0.13, gain: 0.35 });
    noise(c, d, { dur: 0.06, filter: 'lowpass', freq: 600, gain: 0.15 });
  },
  splash: (c: Ctx, d: AudioNode) => {
    noise(c, d, { dur: 0.45, filter: 'bandpass', freq: 1600, freqEnd: 500, q: 0.8, gain: 0.4 });
    noise(c, d, { dur: 0.3, filter: 'lowpass', freq: 350, gain: 0.25 });
  },
  /** Sinking: a long bloop and bubbles */
  sink: (c: Ctx, d: AudioNode) => {
    tone(c, d, { type: 'sine', freq: 420, freqEnd: 70, dur: 0.7, gain: 0.35 });
    for (let i = 0; i < 6; i++) tone(c, d, { type: 'sine', freq: 300 + ((i * 173) % 600), freqEnd: 900 + ((i * 97) % 400), dur: 0.06, gain: 0.1, at: 0.2 + i * 0.11 });
  },
  respawn: (c: Ctx, d: AudioNode) => tone(c, d, { type: 'sine', freq: 300, freqEnd: 950, dur: 0.28, gain: 0.2 }),
  /** A start boost or a boost item */
  boost: (c: Ctx, d: AudioNode) => noise(c, d, { dur: 0.5, filter: 'bandpass', freq: 600, freqEnd: 2600, q: 1, gain: 0.7, attack: 0.04 }),
  lap: (c: Ctx, d: AudioNode) => {
    tone(c, d, { type: 'triangle', freq: 784, dur: 0.16, gain: 0.25 });
    tone(c, d, { type: 'triangle', freq: 1046, dur: 0.3, gain: 0.25, at: 0.14 });
  },
  finalLap: (c: Ctx, d: AudioNode) => {
    [523, 659, 784, 1046].forEach((f, i) => tone(c, d, { type: 'square', freq: f, dur: i === 3 ? 0.4 : 0.12, gain: 0.1, lowpass: 2600, at: i * 0.11 }));
  },
  /** The finish: two blasts of a ship's horn */
  finish: (c: Ctx, d: AudioNode) => {
    for (const at of [0, 0.75]) {
      tone(c, d, { type: 'sawtooth', freq: 98, dur: 0.6, gain: 0.18, lowpass: 650, attack: 0.08, release: 0.15, at });
      tone(c, d, { type: 'sawtooth', freq: 147, dur: 0.6, gain: 0.12, lowpass: 650, attack: 0.08, release: 0.15, at });
    }
  },
  win: (c: Ctx, d: AudioNode) => {
    [60, 64, 67, 72, 76, 79, 84].forEach((m, i) => tone(c, d, { type: 'square', freq: midiToFreq(m), dur: i === 6 ? 0.6 : 0.12, gain: 0.09, lowpass: 3000, at: i * 0.09 }));
  },
  lose: (c: Ctx, d: AudioNode) => {
    [67, 64, 60, 55].forEach((m, i) => tone(c, d, { type: 'triangle', freq: midiToFreq(m), dur: i === 3 ? 0.5 : 0.18, gain: 0.18, at: i * 0.16 }));
  },
} satisfies Record<string, (c: Ctx, d: AudioNode) => void>;

export type SfxName = keyof typeof SFX;
