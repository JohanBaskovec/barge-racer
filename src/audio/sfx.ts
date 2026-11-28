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
  /** Electrical failure: a zap, crackles and a power-down whine */
  blackout: (c: Ctx, d: AudioNode) => {
    noise(c, d, { dur: 0.12, filter: 'highpass', freq: 3000, gain: 0.5 });
    tone(c, d, { type: 'sawtooth', freq: 1100, freqEnd: 70, dur: 0.8, gain: 0.16, lowpass: 2400 });
    for (let i = 0; i < 7; i++) noise(c, d, { dur: 0.03, filter: 'bandpass', freq: 2500 + ((i * 731) % 2500), q: 3, gain: 0.3, at: 0.1 + i * 0.09 });
  },
  /** Ultimate raclette: a sizzle, a pop and a wet thwip */
  raclette: (c: Ctx, d: AudioNode) => {
    noise(c, d, { dur: 0.55, filter: 'highpass', freq: 4200, gain: 0.22, attack: 0.03 });
    tone(c, d, { type: 'triangle', freq: 520, freqEnd: 230, dur: 0.1, gain: 0.3 });
    noise(c, d, { dur: 0.22, filter: 'bandpass', freq: 700, freqEnd: 2200, q: 1.5, gain: 0.35, at: 0.08 });
    tone(c, d, { type: 'sine', freq: 300, freqEnd: 90, dur: 0.25, gain: 0.25, at: 0.3 });
  },
  /** A toilet flushing, with a gurgle */
  toilet: (c: Ctx, d: AudioNode) => {
    noise(c, d, { dur: 1.0, filter: 'lowpass', freq: 1800, freqEnd: 250, gain: 0.5, attack: 0.1 });
    tone(c, d, { type: 'sine', freq: 140, freqEnd: 70, dur: 0.7, gain: 0.3, vibrato: [25, 9] });
    for (let i = 0; i < 4; i++) tone(c, d, { type: 'sine', freq: 200 + i * 40, freqEnd: 120, dur: 0.09, gain: 0.18, at: 0.5 + i * 0.13 });
  },
  /** A pressure washer: a long hiss */
  karcher: (c: Ctx, d: AudioNode) => {
    noise(c, d, { dur: 3.3, filter: 'highpass', freq: 2200, gain: 0.3, attack: 0.15 });
    noise(c, d, { dur: 3.3, filter: 'bandpass', freq: 1200, q: 0.7, gain: 0.22, attack: 0.15 });
  },
  /** Dicke Titten falling from the sky: a slide whistle down, then a big wobbly "boing" (played on landing: splash) */
  titten: (c: Ctx, d: AudioNode) => {
    tone(c, d, { type: 'sine', freq: 1400, freqEnd: 300, dur: 0.5, gain: 0.18 });
    tone(c, d, { type: 'sine', freq: 140, freqEnd: 260, dur: 0.45, gain: 0.25, vibrato: [30, 12], at: 0.45 });
  },
  /** The dildo going on: a rubbery squeak */
  dildo: (c: Ctx, d: AudioNode) => {
    tone(c, d, { type: 'triangle', freq: 300, freqEnd: 900, dur: 0.16, gain: 0.2 });
    tone(c, d, { type: 'triangle', freq: 900, freqEnd: 500, dur: 0.12, gain: 0.15, at: 0.15 });
  },
  /** A nail gun: three sharp clacks */
  nailGun: (c: Ctx, d: AudioNode) => {
    for (let i = 0; i < 3; i++) {
      noise(c, d, { dur: 0.05, filter: 'bandpass', freq: 3000, q: 2, gain: 0.5, at: i * 0.11 });
      tone(c, d, { type: 'square', freq: 200, freqEnd: 90, dur: 0.05, gain: 0.12, lowpass: 1500, at: i * 0.11 });
    }
  },
  /** Gas siphoning: a long slurp, then an engine coughing out */
  siphon: (c: Ctx, d: AudioNode) => {
    noise(c, d, { dur: 0.5, filter: 'bandpass', freq: 500, freqEnd: 1400, q: 3, gain: 0.35, attack: 0.05 });
    for (let i = 0; i < 4; i++) tone(c, d, { type: 'sawtooth', freq: 90 - i * 12, dur: 0.07, gain: 0.18, lowpass: 700, at: 0.55 + i * 0.16 });
  },
  /** A tugboat: two cheerful toots */
  tugboat: (c: Ctx, d: AudioNode) => {
    for (const at of [0, 0.32]) {
      tone(c, d, { type: 'square', freq: 392, dur: 0.24, gain: 0.08, lowpass: 1400, attack: 0.02, at });
      tone(c, d, { type: 'sine', freq: 588, dur: 0.24, gain: 0.1, attack: 0.02, at });
    }
  },
  /** A police siren: one rise and fall */
  siren: (c: Ctx, d: AudioNode) => {
    tone(c, d, { type: 'square', freq: 700, freqEnd: 1150, dur: 0.5, gain: 0.07, lowpass: 2200 });
    tone(c, d, { type: 'square', freq: 1150, freqEnd: 700, dur: 0.5, gain: 0.07, lowpass: 2200, at: 0.5 });
  },
  /** A gunshot: a crack and a short boom */
  gunshot: (c: Ctx, d: AudioNode) => {
    noise(c, d, { dur: 0.06, filter: 'highpass', freq: 1800, gain: 0.6 });
    noise(c, d, { dur: 0.25, filter: 'lowpass', freq: 600, freqEnd: 120, gain: 0.5, at: 0.01 });
  },
  /** An angler casting: the reel whirring out */
  cast: (c: Ctx, d: AudioNode) => {
    for (let i = 0; i < 10; i++) noise(c, d, { dur: 0.02, filter: 'bandpass', freq: 3200, q: 4, gain: 0.25, at: i * 0.035 });
    tone(c, d, { type: 'sine', freq: 900, freqEnd: 500, dur: 0.15, gain: 0.08, at: 0.36 });
  },
  /** Caught on a line: a fast reel and a twang */
  reel: (c: Ctx, d: AudioNode) => {
    tone(c, d, { type: 'triangle', freq: 180, freqEnd: 90, dur: 0.3, gain: 0.25, vibrato: [20, 30] });
    for (let i = 0; i < 14; i++) noise(c, d, { dur: 0.015, filter: 'bandpass', freq: 2600, q: 4, gain: 0.2, at: 0.05 + i * 0.025 });
  },
  /** Running something over: a wet splat and a squelch */
  splat: (c: Ctx, d: AudioNode) => {
    noise(c, d, { dur: 0.22, filter: 'lowpass', freq: 1400, freqEnd: 200, gain: 0.7 });
    tone(c, d, { type: 'sine', freq: 220, freqEnd: 60, dur: 0.2, gain: 0.35 });
    noise(c, d, { dur: 0.15, filter: 'bandpass', freq: 900, q: 2, gain: 0.3, at: 0.12 });
  },
  /** The beer dispenser's foam taking a hit: a big bubble pop */
  pop: (c: Ctx, d: AudioNode) => {
    tone(c, d, { type: 'sine', freq: 400, freqEnd: 1400, dur: 0.08, gain: 0.3 });
    noise(c, d, { dur: 0.4, filter: 'highpass', freq: 4500, gain: 0.15, at: 0.05, attack: 0.02 });
  },
  /** A vacuum cleaner: a roar that rises and holds */
  vacuum: (c: Ctx, d: AudioNode) => {
    noise(c, d, { dur: 2.9, filter: 'bandpass', freq: 500, freqEnd: 900, q: 0.8, gain: 0.35, attack: 0.25 });
    tone(c, d, { type: 'sawtooth', freq: 120, freqEnd: 160, dur: 2.9, gain: 0.05, lowpass: 900, attack: 0.25 });
  },
  /** A police rocket leaving the launcher: a rising whoosh */
  rocket: (c: Ctx, d: AudioNode) => {
    noise(c, d, { dur: 0.5, filter: 'bandpass', freq: 600, freqEnd: 2600, q: 1.5, gain: 0.45, attack: 0.02 });
    tone(c, d, { type: 'sawtooth', freq: 180, freqEnd: 420, dur: 0.4, gain: 0.06, lowpass: 1200 });
  },
  /** An explosion: a crack, a deep boom and falling debris */
  explosion: (c: Ctx, d: AudioNode) => {
    noise(c, d, { dur: 0.08, filter: 'highpass', freq: 1500, gain: 0.7 });
    noise(c, d, { dur: 0.9, filter: 'lowpass', freq: 900, freqEnd: 60, gain: 0.9, at: 0.01 });
    tone(c, d, { type: 'sine', freq: 90, freqEnd: 35, dur: 0.7, gain: 0.5, at: 0.01 });
    for (let i = 0; i < 5; i++) noise(c, d, { dur: 0.04, filter: 'bandpass', freq: 1800 + i * 300, q: 3, gain: 0.15, at: 0.35 + i * 0.08 });
  },
  /**
   * A person screaming (run over while swimming or rowing): a rising then falling shriek with a
   * wobble, a few voices of it through a mouth-like filter, a breath of noise. A new pitch each time.
   */
  scream: (c: Ctx, d: AudioNode) => {
    const base = 620 + Math.random() * 420, len = 0.55 + Math.random() * 0.35;
    for (const [mult, gain] of [[1, 0.09], [2.01, 0.035], [1.5, 0.03]] as const) {
      tone(c, d, { type: 'sawtooth', freq: base * mult * 0.8, freqEnd: base * mult * 1.25, dur: len * 0.35, gain, lowpass: 3200, vibrato: [45, 7], attack: 0.02, release: 0.01 });
      tone(c, d, { type: 'sawtooth', freq: base * mult * 1.25, freqEnd: base * mult * 0.55, dur: len * 0.65, gain, lowpass: 2600, vibrato: [70, 6.5], attack: 0.01, at: len * 0.35 });
    }
    noise(c, d, { dur: len, filter: 'bandpass', freq: 1400, freqEnd: 900, q: 2, gain: 0.12, attack: 0.03 });
  },
  /** Sauna: water on the hot stones, a long hiss of steam */
  steam: (c: Ctx, d: AudioNode) => {
    noise(c, d, { dur: 1.4, filter: 'highpass', freq: 3000, freqEnd: 1800, gain: 0.35, attack: 0.05 });
    noise(c, d, { dur: 0.3, filter: 'bandpass', freq: 900, q: 1.5, gain: 0.25 });
  },
  /** Noise complaint: a loud party: thumping bass and a whoop */
  partyNoise: (c: Ctx, d: AudioNode) => {
    for (let k = 0; k < 4; k++) tone(c, d, { type: 'sine', freq: 70, freqEnd: 40, dur: 0.18, gain: 0.5, at: k * 0.22 });
    for (let k = 0; k < 4; k++) tone(c, d, { type: 'square', freq: [220, 262, 196, 247][k], dur: 0.16, gain: 0.05, lowpass: 1200, at: k * 0.22 + 0.11 });
    tone(c, d, { type: 'sawtooth', freq: 500, freqEnd: 1100, dur: 0.35, gain: 0.06, lowpass: 2400, vibrato: [30, 8], at: 0.6 });
  },
  /** Wet paint: a thick splat */
  paint: (c: Ctx, d: AudioNode) => {
    noise(c, d, { dur: 0.22, filter: 'lowpass', freq: 900, freqEnd: 300, gain: 0.45 });
    tone(c, d, { type: 'sine', freq: 300, freqEnd: 120, dur: 0.15, gain: 0.2 });
  },
  /** Motorized stairs: an electric motor whining up, and the steps clanking out one by one */
  stairs: (c: Ctx, d: AudioNode) => {
    tone(c, d, { type: 'sawtooth', freq: 180, freqEnd: 420, dur: 1, gain: 0.06, lowpass: 1500, attack: 0.05 });
    for (let k = 0; k < 6; k++) tone(c, d, { type: 'square', freq: 900 - k * 40, dur: 0.04, gain: 0.05, lowpass: 2500, at: 0.15 + k * 0.13 });
    noise(c, d, { dur: 0.12, filter: 'bandpass', freq: 600, q: 2, gain: 0.25, at: 0.95 });
  },
  /** A taunt: two cheeky toots of a car horn */
  honk: (c: Ctx, d: AudioNode) => {
    for (const at of [0, 0.22]) {
      tone(c, d, { type: 'square', freq: 415, dur: 0.16, gain: 0.07, lowpass: 1800, attack: 0.01, release: 0.04, at });
      tone(c, d, { type: 'square', freq: 523, dur: 0.16, gain: 0.06, lowpass: 1800, attack: 0.01, release: 0.04, at });
    }
  },
  /** A barge's horn: one long, low blast */
  horn: (c: Ctx, d: AudioNode) => {
    tone(c, d, { type: 'sawtooth', freq: 110, dur: 0.9, gain: 0.16, lowpass: 600, attack: 0.08, release: 0.2 });
    tone(c, d, { type: 'sawtooth', freq: 165, dur: 0.9, gain: 0.1, lowpass: 600, attack: 0.08, release: 0.2 });
  },
  /** Breathing in toxic smoke: a low, wet cough */
  toxic: (c: Ctx, d: AudioNode) => {
    tone(c, d, { type: 'sawtooth', freq: 150, freqEnd: 70, dur: 0.2, gain: 0.2, lowpass: 600 });
    noise(c, d, { dur: 0.18, filter: 'lowpass', freq: 500, gain: 0.3 });
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
