import Phaser from 'phaser';
import { audio } from './audio/AudioManager';
import { net } from './net/client';
import { DEBUG, GAME_HEIGHT, GAME_WIDTH } from './config';
import { BoatSelectScene } from './scenes/BoatSelectScene';
import { BootScene } from './scenes/BootScene';
import { HudScene } from './scenes/HudScene';
import { OptionsScene } from './scenes/OptionsScene';
import { SectionScene } from './scenes/SectionScene';
import { LobbyScene } from './scenes/LobbyScene';
import { OnlineScene } from './scenes/OnlineScene';
import { RaceScene } from './scenes/RaceScene';
import { ResultsScene } from './scenes/ResultsScene';
import { TitleScene } from './scenes/TitleScene';
import { TrackSelectScene } from './scenes/TrackSelectScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#0b3a5b',
  // Fullscreen the whole #game element, not just the canvas, so the HTML text fields (player name,
  // room code) and the rotate notice come along.
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, fullscreenTarget: 'game' },
  input: { activePointers: 3 },
  // HTML text fields (player name, room code) on the online screen.
  dom: { createContainer: true },
  render: { antialias: true },
  scene: [BootScene, TitleScene, BoatSelectScene, TrackSelectScene, RaceScene, HudScene, ResultsScene, OptionsScene, OnlineScene, LobbyScene, SectionScene],
});

if (DEBUG.enabled) Object.assign(window, { game, audio, net });
