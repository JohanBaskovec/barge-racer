/**
 * Tiny synthesiser helpers on top of the Web Audio API. Everything in the game's sound is made
 * from these (no audio files): oscillators, filtered noise and envelopes.
 * They take a context and a destination so they also work in an OfflineAudioContext (tests).
 */

export type Ctx = BaseAudioContext;

const noiseBuffers = new WeakMap<Ctx, AudioBuffer>();

/** One second of white noise, made once per context. */
export function noiseBuffer(ctx: Ctx): AudioBuffer {
  let b = noiseBuffers.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = b.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < d.length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      d[i] = (seed / 4294967296) * 2 - 1;
    }
    noiseBuffers.set(ctx, b);
  }
  return b;
}

export const midiToFreq = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

export interface ToneOpts {
  type?: OscillatorType;
  freq: number;
  /** Glide to this frequency by the end of the note. */
  freqEnd?: number;
  dur: number;
  gain?: number;
  attack?: number;
  release?: number;
  /** Start time offset from now, in seconds. */
  at?: number;
  /** Optional low-pass cutoff. */
  lowpass?: number;
  detune?: number;
  /** Vibrato depth in cents and rate in Hz. */
  vibrato?: [number, number];
}

/** A single oscillator note with an attack/release envelope. */
export function tone(ctx: Ctx, dest: AudioNode, o: ToneOpts): void {
  const t0 = ctx.currentTime + (o.at ?? 0);
  const t1 = t0 + o.dur;
  const osc = ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, t0);
  if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.freqEnd), t1);
  if (o.detune) osc.detune.value = o.detune;
  const g = ctx.createGain();
  const peak = o.gain ?? 0.3;
  const a = Math.min(o.attack ?? 0.005, o.dur / 2);
  const r = Math.min(o.release ?? 0.05, o.dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + a);
  g.gain.setValueAtTime(peak, Math.max(t0 + a, t1 - r));
  g.gain.exponentialRampToValueAtTime(0.0001, t1);
  let last: AudioNode = osc;
  if (o.vibrato) {
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = o.vibrato[1];
    depth.gain.value = o.vibrato[0];
    lfo.connect(depth).connect(osc.detune);
    lfo.start(t0);
    lfo.stop(t1 + 0.05);
  }
  if (o.lowpass) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.lowpass;
    last.connect(f);
    last = f;
  }
  last.connect(g).connect(dest);
  osc.start(t0);
  osc.stop(t1 + 0.05);
}

export interface NoiseOpts {
  dur: number;
  gain?: number;
  filter?: BiquadFilterType;
  freq?: number;
  /** Sweep the filter to this frequency by the end. */
  freqEnd?: number;
  q?: number;
  attack?: number;
  release?: number;
  at?: number;
}

/** A burst of filtered noise: splashes, crunches, whooshes, hats. */
export function noise(ctx: Ctx, dest: AudioNode, o: NoiseOpts): void {
  const t0 = ctx.currentTime + (o.at ?? 0);
  const t1 = t0 + o.dur;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = o.filter ?? 'lowpass';
  f.frequency.setValueAtTime(o.freq ?? 2000, t0);
  if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.freqEnd), t1);
  f.Q.value = o.q ?? 1;
  const g = ctx.createGain();
  const peak = o.gain ?? 0.3;
  const a = Math.min(o.attack ?? 0.003, o.dur / 2);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t1);
  src.connect(f).connect(g).connect(dest);
  src.start(t0, Math.random() * 0.5);
  src.stop(t1 + 0.05);
}
