import type Phaser from 'phaser';
import { audio, engineKind, type EngineVoice, type SawLoop } from '../audio/AudioManager';
import type { ThemeName } from '../audio/music';
import type { SfxName } from '../audio/sfx';
import type { ItemId } from '../data/items';
import { hasEffect } from '../effects/effects';
import { speedOf } from '../physics/BoatPhysics';
import type { RaceSimulation } from '../race/RaceSimulation';
import type { RaceEvent } from '../race/types';
import type { TrackDef } from '../track/Track';

/** Which music plays on which kind of track. */
export const MUSIC_FOR: Record<TrackDef['theme'], ThemeName> = { canal: 'race', industrial: 'industrial', bayou: 'bayou', city: 'city', vineyard: 'vineyard' };

const ITEM_SOUND: Partial<Record<ItemId, SfxName>> = {
  volunteer: 'volunteer', jigsaw: 'jigsaw', whitePowder: 'powder',
  drill: 'drill', siliconeGun: 'silicone', fakeCrate: 'drop', mushroom: 'mushroom',
  blackout: 'blackout', raclette: 'raclette', toilet: 'toilet', karcher: 'karcher',
  titten: 'titten', dildo: 'dildo', nailGun: 'nailGun', siphon: 'siphon', tugboat: 'tugboat', beerDispenser: 'beer', vacuum: 'vacuum',
  sauna: 'steam', noise: 'partyNoise', lazyVolunteers: 'drop', paint: 'paint', translation: 'itemReady', champagne: 'pop', enlarge: 'boost', circularSaw: 'jigsaw', stairs: 'stairs',
  // glue: the sound plays when the puddle appears (also for the silicone gun's shots)
};

/**
 * The sound of a race: an engine per boat (pitch follows speed), jigsaw buzz, the item roulette,
 * and a sound for every race event. Sounds away from the camera are quieter and panned.
 */
export class RaceAudio {
  private engines = new Map<number, EngineVoice>();
  private saws = new Map<number, SawLoop>();
  private cooldowns = new Map<string, number>();
  private tickT = 0;
  private wasRolling = false;

  constructor(private scene: Phaser.Scene, private sim: RaceSimulation) {
    for (const r of sim.racers) {
      const e = audio.engine(engineKind(r.boat));
      if (e) this.engines.set(r.id, e);
    }
    audio.playMusic(MUSIC_FOR[sim.track.def.theme]);
  }

  /** Loudness (0..1) and stereo position of something at (x, y), seen from the camera. */
  private place(x: number, y: number): { vol: number; pan: number } {
    const v = this.scene.cameras.main.worldView;
    const d = Math.hypot(x - v.centerX, y - v.centerY);
    return { vol: Math.max(0, Math.min(1, 1.15 - d / 1400)), pan: Math.max(-0.8, Math.min(0.8, (x - v.centerX) / (v.width * 0.6 || 1))) };
  }

  /** Play an effect at a place in the world. */
  at(name: SfxName, x: number, y: number, volume = 1): void {
    const p = this.place(x, y);
    audio.play(name, p.vol * volume, p.pan);
  }

  /** At most once every `seconds` per key (scraping a bank fires every frame). */
  private ready(key: string, seconds: number): boolean {
    const now = this.scene.time.now / 1000;
    if ((this.cooldowns.get(key) ?? -1) > now) return false;
    this.cooldowns.set(key, now + seconds);
    return true;
  }

  update(dt: number): void {
    const player = this.sim.player;
    for (const r of this.sim.racers) {
      const p = this.place(r.x, r.y);
      const isPlayer = r === player;
      const vol = r.sinkTimer > 0 ? 0 : isPlayer ? 1 : p.vol * p.vol * 0.55;
      this.engines.get(r.id)?.set(speedOf(r) / r.stats.topSpeed, Math.abs(r.throttle), vol, isPlayer ? 0 : p.pan);

      const sawing = hasEffect(r, 'jigsaw') && r.sinkTimer <= 0;
      let saw = this.saws.get(r.id);
      if (sawing && !saw) {
        saw = audio.saw() ?? undefined;
        if (saw) this.saws.set(r.id, saw);
      } else if (!sawing && saw) {
        saw.stop();
        this.saws.delete(r.id);
      }
      saw?.set(isPlayer ? 1 : p.vol);
    }

    // The roulette ticks while it spins, and dings when it lands on an item.
    if (player) {
      const rolling = !!player.rouletteItem;
      if (rolling) {
        this.tickT -= dt;
        if (this.tickT <= 0) {
          audio.play('tick', 0.8);
          this.tickT = 0.08;
        }
      } else if (this.wasRolling && player.slots.some((s) => s)) audio.play('itemReady', 0.8);
      this.wasRolling = rolling;
    }
  }

  onEvent(e: RaceEvent): void {
    const racers = this.sim.racers;
    const me = this.sim.player?.id;
    switch (e.type) {
      case 'countdown':
        audio.play(e.value === 0 ? 'go' : 'countdown');
        break;
      case 'crate': {
        const c = this.sim.items.crates.find((k) => k.id === e.id);
        if (c && e.taken) this.at('crate', c.x, c.y);
        break;
      }
      case 'itemUsed': {
        const s = ITEM_SOUND[e.item];
        const r = racers[e.racer];
        if (s) this.at(s, r.x, r.y);
        break;
      }
      case 'drop':
        this.at('drop', racers[e.racer].x, racers[e.racer].y, 0.8);
        break;
      case 'heal':
        this.at('beer', racers[e.racer].x, racers[e.racer].y);
        break;
      case 'boost':
        this.at('boost', racers[e.racer].x, racers[e.racer].y);
        break;
      case 'hit': {
        const r = racers[e.racer];
        this.at(e.source === 'fakeCrate' ? 'trap' : e.source === 'bank' ? 'bank' : e.source === 'toilet' ? 'toxic' : 'hit', r.x, r.y, e.racer === me ? 1.2 : 1);
        break;
      }
      case 'painted':
        this.at('paint', racers[e.racer].x, racers[e.racer].y, e.racer === me ? 1.1 : 0.8);
        break;
      case 'shieldPop':
        this.at('pop', racers[e.racer].x, racers[e.racer].y, 1.1);
        break;
      case 'hooked':
        this.at('reel', racers[e.racer].x, racers[e.racer].y, 1.1);
        break;
      case 'bank':
        if (e.strength > 90 && this.ready(`bank${e.racer}`, 0.35)) this.at('bank', racers[e.racer].x, racers[e.racer].y, Math.min(1, e.strength / 300) * 0.7);
        break;
      case 'bump':
        if (this.ready(`bump${Math.min(e.a, e.b)}-${Math.max(e.a, e.b)}`, 0.25)) {
          const a = racers[e.a];
          this.at('bump', a.x, a.y, Math.min(1, e.strength / 250));
        }
        break;
      case 'sunk':
        this.at('sink', racers[e.racer].x, racers[e.racer].y);
        break;
      case 'respawn':
        this.at('respawn', racers[e.racer].x, racers[e.racer].y, 0.8);
        break;
      case 'lap':
        if (e.racer === me && e.lap < this.sim.track.laps) audio.play(e.lap === this.sim.track.laps - 1 ? 'finalLap' : 'lap');
        break;
      case 'finish':
        if (e.racer === me) audio.play('finish');
        break;
      default:
        break;
    }
  }

  destroy(): void {
    for (const e of this.engines.values()) e.stop();
    for (const s of this.saws.values()) s.stop();
    this.engines.clear();
    this.saws.clear();
  }
}
