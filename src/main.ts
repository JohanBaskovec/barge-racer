import Phaser from 'phaser';
import { DEBUG, GAME_HEIGHT, GAME_WIDTH } from './config';
import { BoatSelectScene } from './scenes/BoatSelectScene';
import { BootScene } from './scenes/BootScene';
import { HudScene } from './scenes/HudScene';
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
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { activePointers: 3 },
  render: { antialias: true },
  scene: [BootScene, TitleScene, BoatSelectScene, TrackSelectScene, RaceScene, HudScene, ResultsScene],
});

if (DEBUG.enabled) (window as unknown as { game: Phaser.Game }).game = game;
