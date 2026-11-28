import Phaser from 'phaser';
import { audio } from './audio/AudioManager';
import { net } from './net/client';
import { DEBUG, GAME_HEIGHT } from './config';
import { widthFor } from './view/layout';
import { itemName } from './i18n';
import { BoatSelectScene } from './scenes/BoatSelectScene';
import { BootScene } from './scenes/BootScene';
import { DebugScene } from './scenes/DebugScene';
import { HudScene } from './scenes/HudScene';
import { OptionsScene } from './scenes/OptionsScene';
import { SectionScene } from './scenes/SectionScene';
import { LobbyScene } from './scenes/LobbyScene';
import { OnlineScene } from './scenes/OnlineScene';
import { RaceScene } from './scenes/RaceScene';
import { ResultsScene } from './scenes/ResultsScene';
import { StandingsScene } from './scenes/StandingsScene';
import { TitleScene } from './scenes/TitleScene';
import { TrackSelectScene } from './scenes/TrackSelectScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  // As wide as the screen's shape, so the game fills it without bands at the sides (layout.ts).
  width: widthFor(window.innerWidth, window.innerHeight),
  height: GAME_HEIGHT,
  backgroundColor: '#0b3a5b',
  // Fullscreen the whole #game element, not just the canvas, so the HTML text fields (player name,
  // room code) and the rotate notice come along.
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, fullscreenTarget: 'game' },
  input: { activePointers: 3 },
  // HTML text fields (player name, room code) on the online screen.
  dom: { createContainer: true },
  render: { antialias: true },
  scene: [BootScene, TitleScene, BoatSelectScene, TrackSelectScene, RaceScene, HudScene, ResultsScene, StandingsScene, OptionsScene, OnlineScene, LobbyScene, SectionScene, DebugScene],
});

/**
 * Keep filling the screen when its shape changes (rotation, going fullscreen, a resized window):
 * a new game width, and every screen laid out for a width is laid out again (the race view itself
 * simply shows more or less).
 */
let refitTimer = 0;
function refit(): void {
  const w = widthFor(window.innerWidth, window.innerHeight);
  if (w === game.scale.gameSize.width) return;
  game.scale.setGameSize(w, GAME_HEIGHT);
  for (const s of game.scene.getScenes(true)) if (s.scene.key !== 'Race' && s.scene.key !== 'Boot') s.scene.restart();
}
window.addEventListener('resize', () => {
  clearTimeout(refitTimer);
  refitTimer = window.setTimeout(refit, 150);
});

if (DEBUG.enabled) Object.assign(window, { game, audio, net, __itemName: itemName });
