import Phaser from 'phaser';
import type { BoatDef } from '../data/boats';
import { onOptionsChange, options } from '../options';
import { MusicPlayer, type ThemeName } from './music';
import { SFX, type SfxName } from './sfx';
import { noiseBuffer } from './synth';

export type EngineKind = 'diesel' | 'outboard' | 'fan';

/** Which engine a boat has: barges, tugs and canal boats chug; light boats buzz; the hovercraft whines. */
export function engineKind(boat: BoatDef): EngineKind {
  if (boat.shape === 'hovercraft') return 'fan';
  if (boat.shape === 'speedboat' || boat.shape === 'pontoon') return 'outboard';
  return 'diesel';
}

/** A continuous engine sound whose pitch and loudness follow the boat. */
export class EngineVoice {
  private out: GainNode;
  private pan: StereoPannerNode | null;
  /** The tone oscillators and their pitch ratio to the engine's base frequency. */
  private oscs: { o: OscillatorNode; ratio: number }[] = [];
  private filter: BiquadFilterNode;
  private lfo: OscillatorNode | null = null;
  private sources: AudioScheduledSourceNode[] = [];

  constructor(private ctx: AudioContext, dest: AudioNode, private kind: EngineKind) {
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.pan = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null;
    this.filter = ctx.createBiquadFilter();
    const chain = this.pan ? (this.out.connect(this.pan), this.pan) : this.out;
    chain.connect(dest);

    if (kind === 'fan') {
      const n = ctx.createBufferSource();
      n.buffer = noiseBuffer(ctx);
      n.loop = true;
      this.filter.type = 'bandpass';
      this.filter.Q.value = 1.5;
      n.connect(this.filter).connect(this.out);
      const whine = this.osc('sine', 0.05);
      this.sources.push(n, whine);
      n.start();
    } else {
      this.filter.type = kind === 'diesel' ? 'lowpass' : 'bandpass';
      this.filter.Q.value = kind === 'diesel' ? 0.8 : 2;
      const body = ctx.createGain();
      body.connect(this.out);
      this.filter.connect(body);
      const a = this.osc('sawtooth', 0.5, this.filter);
      const b = this.osc(kind === 'diesel' ? 'square' : 'sawtooth', 0.35, this.filter, kind === 'diesel' ? 0.5 : 1.01);
      this.sources.push(a, b);
      if (kind === 'diesel') {
        // The diesel's chug: the body's loudness pulses with the engine speed.
        this.lfo = ctx.createOscillator();
        const depth = ctx.createGain();
        depth.gain.value = 0.35;
        body.gain.value = 0.65;
        this.lfo.connect(depth).connect(body.gain);
        this.lfo.start();
        this.sources.push(this.lfo);
      }
    }
  }

  private osc(type: OscillatorType, gain: number, into: AudioNode = this.out, ratio = 1): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    o.connect(g).connect(into);
    o.start();
    this.oscs.push({ o, ratio });
    return o;
  }

  /** speed and throttle 0..1, volume 0..1, pan -1..1 */
  set(speed: number, throttle: number, volume: number, pan: number): void {
    const t = this.ctx.currentTime;
    const s = Math.max(0, Math.min(1.4, speed));
    const th = Math.max(0, Math.min(1, throttle));
    let base: number;
    if (this.kind === 'diesel') {
      base = 34 + 46 * s + 10 * th;
      this.filter.frequency.setTargetAtTime(350 + 900 * th + 300 * s, t, 0.08);
      this.lfo?.frequency.setTargetAtTime(base / 2, t, 0.1);
    } else if (this.kind === 'outboard') {
      base = 65 + 170 * s + 25 * th;
      this.filter.frequency.setTargetAtTime(700 + 1200 * s, t, 0.08);
    } else {
      base = 220 + 380 * s;
      this.filter.frequency.setTargetAtTime(700 + 900 * s, t, 0.08);
    }
    for (const { o, ratio } of this.oscs) o.frequency.setTargetAtTime(base * ratio, t, 0.06);
    const loud = volume * (0.3 + 0.7 * Math.max(th, s * 0.6));
    this.out.gain.setTargetAtTime(loud * (this.kind === 'fan' ? 0.5 : 0.22), t, 0.05);
    this.pan?.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), t, 0.05);
  }

  stop(): void {
    const t = this.ctx.currentTime;
    this.out.gain.setTargetAtTime(0, t, 0.05);
    for (const s of this.sources) {
      try {
        s.stop(t + 0.3);
      } catch {
        /* already stopped */
      }
    }
  }
}

/** The buzzing of an active jigsaw. */
export class SawLoop {
  private out: GainNode;
  private srcs: OscillatorNode[] = [];

  constructor(private ctx: AudioContext, dest: AudioNode) {
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1500;
    f.Q.value = 2.5;
    const trem = ctx.createGain();
    trem.gain.value = 0.7;
    f.connect(trem).connect(this.out).connect(dest);
    for (const [type, freq] of [['sawtooth', 120], ['square', 241]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.connect(f);
      o.start();
      this.srcs.push(o);
    }
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = 18;
    depth.gain.value = 0.3;
    lfo.connect(depth).connect(trem.gain);
    lfo.start();
    this.srcs.push(lfo);
  }

  set(volume: number): void {
    this.out.gain.setTargetAtTime(volume * 0.12, this.ctx.currentTime, 0.04);
  }

  stop(): void {
    this.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
    for (const s of this.srcs) s.stop(this.ctx.currentTime + 0.2);
  }
}

/**
 * All of the game's sound. Uses Phaser's Web Audio context (Phaser unlocks it on the first tap
 * and suspends it when the tab is hidden). Without Web Audio the game is simply silent.
 */
class AudioManager {
  ctx: AudioContext | null = null;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private engineBus!: GainNode;
  private music: MusicPlayer | null = null;
  private wantedTheme: ThemeName | null = null;
  private ducked = false;

  init(game: Phaser.Game): void {
    if (this.ctx) return;
    const sm = game.sound;
    if (!(sm instanceof Phaser.Sound.WebAudioSoundManager)) return;
    const ctx = sm.context;
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 6;
    comp.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.engineBus = ctx.createGain();
    this.engineBus.connect(this.sfxBus);
    this.sfxBus.connect(comp);
    this.musicBus.connect(comp);
    this.music = new MusicPlayer(ctx, this.musicBus);
    this.applyOptions();
    onOptionsChange(() => this.applyOptions());
    if (this.wantedTheme) this.music.start(this.wantedTheme);
  }

  private applyOptions(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(options.musicVolume * 0.55 * (this.ducked ? 0.35 : 1), t, 0.05);
    this.sfxBus.gain.setTargetAtTime(options.sfxVolume * 0.9, t, 0.05);
  }

  /** Play a sound effect. `pan` is -1 (left) to 1 (right). */
  play(name: SfxName, volume = 1, pan = 0): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || volume <= 0.01) return;
    const g = ctx.createGain();
    g.gain.value = Math.min(1.5, volume);
    if (pan !== 0 && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p).connect(this.sfxBus);
    } else g.connect(this.sfxBus);
    SFX[name](ctx, g);
    setTimeout(() => g.disconnect(), 3000); // every effect is shorter than this
  }

  /** Switch the music (null = silence). Remembered until audio is available. */
  playMusic(theme: ThemeName | null): void {
    this.wantedTheme = theme;
    if (!this.music) return;
    if (theme) this.music.start(theme);
    else this.music.stop();
  }

  /** Quieter music, e.g. while paused. */
  duckMusic(on: boolean): void {
    this.ducked = on;
    this.applyOptions();
  }

  engine(kind: EngineKind): EngineVoice | null {
    return this.ctx ? new EngineVoice(this.ctx, this.engineBus, kind) : null;
  }

  saw(): SawLoop | null {
    return this.ctx ? new SawLoop(this.ctx, this.engineBus) : null;
  }

  /** Silence engines and loops (pause menu) without stopping them. */
  muteEngines(on: boolean): void {
    if (!this.ctx) return;
    this.engineBus.gain.setTargetAtTime(on ? 0 : 1, this.ctx.currentTime, 0.04);
  }
}

export const audio = new AudioManager();
