import Phaser from 'phaser';
import { DIFFICULTIES, type Difficulty } from '../data/difficulty';
import { ARENA_DEFS, loadTrack } from '../data/tracks';
import { type GameMode, isTeamMode, winLimit } from '../race/battle';
import { difficultyName, t, trackDesc, trackName } from '../i18n';
import { audio } from '../audio/AudioManager';
import { saveSession, session } from '../session';
import { background, button, fitText, setSelected, text } from '../view/ui';

const F = 'Trebuchet MS, Verdana, sans-serif';
type BattleMode = Exclude<GameMode, 'race'>;
const MODES: BattleMode[] = ['deathmatch', 'teamDeathmatch', 'ctf'];

/**
 * Set up a battle in single player: the mode (deathmatch, team deathmatch, capture the flag), the
 * arena, how many boats, your team (Corsica or Brittany) and the opponents' level.
 */
export class BattleSetupScene extends Phaser.Scene {
  private dyn!: Phaser.GameObjects.Container;

  constructor() {
    super('BattleSetup');
  }

  private get setup(): NonNullable<typeof session.battle> {
    session.battle ??= { mode: 'deathmatch', arena: ARENA_DEFS[0].id, boats: 6, team: 0 };
    if (!ARENA_DEFS.some((a) => a.id === session.battle!.arena)) session.battle.arena = ARENA_DEFS[0].id;
    return session.battle;
  }

  create(): void {
    background(this);
    audio.playMusic('menu');
    fitText(text(this, 640, 50, t('battle.title'), 50), 1000).setStroke('#0b3a5b', 8);
    this.dyn = this.add.container(0, 0);
    this.render();
    button(this, 150, 660, 200, 64, t('common.back'), () => this.scene.start('Mode'), { fill: 0x555f6b, textSize: 28 });
    button(this, 1090, 660, 300, 72, t('battle.start'), () => {
      saveSession();
      this.scene.start('Race', { ...session, trackId: this.setup.arena, battle: true });
    }, { fill: 0x2d9d5a, textSize: 36 });
  }

  private render(): void {
    this.dyn.removeAll(true);
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => (this.dyn.add(o), o);
    const s = this.setup;
    const redo = (): void => {
      saveSession();
      this.render();
    };
    // The mode, and what it is.
    MODES.forEach((m, i) => {
      const b = add(button(this, 290 + i * 350, 118, 330, 54, t(`battle.${m}`), () => ((s.mode = m), redo()), { textSize: 24 }));
      setSelected(b, s.mode === m);
    });
    add(this.add.text(640, 160, t(`battle.${s.mode}Desc`, { n: winLimit(s.mode, s.boats) }), { fontFamily: F, fontSize: '19px', color: '#ffe08a', align: 'center', wordWrap: { width: 1000 }, resolution: 2 }).setOrigin(0.5, 0));
    // The arenas: tap one.
    ARENA_DEFS.forEach((def, i) => {
      const x = 430 + i * 420, y = 330;
      const on = def.id === s.arena;
      const frame = add(this.add.rectangle(x, y, 400, 220, 0x0b3a5b, 0.7).setStrokeStyle(on ? 7 : 4, on ? 0xffe08a : 0xffffff, on ? 1 : 0.5).setInteractive({ useHandCursor: true }));
      frame.on('pointerup', () => ((s.arena = def.id), redo()));
      this.preview(add(this.add.graphics()), def.id, x - 95, y - 10, 170, 150);
      // the bases, for the team modes
      add(fitText(text(this, x + 95, y - 70, trackName(def.id), 24), 190));
      add(this.add.text(x + 95, y - 45, trackDesc(def.id), { fontFamily: F, fontSize: '15px', color: '#d7efff', align: 'center', wordWrap: { width: 190 }, resolution: 2 }).setOrigin(0.5, 0));
    });
    // How many boats, and (team modes) your team.
    add(fitText(text(this, 210, 482, t('battle.boats'), 24, '#bfe1f7', false), 160));
    add(button(this, 320, 482, 50, 46, '−', () => ((s.boats = Math.max(isTeamMode(s.mode) ? 4 : 3, s.boats - 1)), redo()), { textSize: 28 }));
    add(text(this, 385, 482, String(s.boats), 30));
    add(button(this, 450, 482, 50, 46, '+', () => ((s.boats = Math.min(8, s.boats + 1)), redo()), { textSize: 28 }));
    if (isTeamMode(s.mode)) {
      add(fitText(text(this, 640, 482, t('battle.team'), 24, '#bfe1f7', false), 180));
      [0, 1].forEach((team) => {
        const b = add(button(this, 820 + team * 230, 482, 210, 56, t(`battle.team${team}` as 'battle.team0'), () => ((s.team = team), redo()), { textSize: 22, fill: team === 0 ? 0x8a2a24 : 0x24448a }));
        setSelected(b, s.team === team);
        add(this.add.image(820 + team * 230 - 72, 482, `flatFlag_${team}`).setDisplaySize(42, 28));
      });
    }
    // The opponents' level.
    add(fitText(text(this, 250, 572, t('trackSelect.opponents'), 24, '#bfe1f7', false), 200));
    (Object.keys(DIFFICULTIES) as Difficulty[]).forEach((id, i) => {
      const b = add(button(this, 470 + i * 190, 572, 170, 50, difficultyName(id), () => ((session.difficulty = id), redo()), { textSize: 24 }));
      setSelected(b, session.difficulty === id);
    });
  }

  /** An arena's outline, the two bases marked in the teams' colours. */
  private preview(g: Phaser.GameObjects.Graphics, id: string, cx: number, cy: number, w: number, h: number): void {
    const track = loadTrack(id);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of track.samples) {
      minX = Math.min(minX, p.x - p.width / 2); maxX = Math.max(maxX, p.x + p.width / 2);
      minY = Math.min(minY, p.y - p.width / 2); maxY = Math.max(maxY, p.y + p.width / 2);
    }
    const k = Math.min(w / (maxX - minX), h / (maxY - minY));
    const X = (x: number): number => cx + (x - (minX + maxX) / 2) * k, Y = (y: number): number => cy + (y - (minY + maxY) / 2) * k;
    for (const p of track.samples) g.fillStyle(track.def.colors.water, 1).fillCircle(X(p.x), Y(p.y), (p.width / 2) * k);
    (track.def.bases ?? [0, 0.5]).forEach((at, team) => {
      const p = track.pointAt(track.alongOf(at * track.lapLength), 0);
      g.fillStyle(team === 0 ? 0xd8352b : 0x2f6fd8, 1).fillCircle(X(p.x), Y(p.y), 8).lineStyle(2, 0xffffff, 1).strokeCircle(X(p.x), Y(p.y), 8);
    });
  }
}
