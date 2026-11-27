import Phaser from 'phaser';
import { audio } from '../audio/AudioManager';
import { BOATS } from '../data/boats';
import { DIFFICULTIES, type Difficulty } from '../data/difficulty';
import { TRACK_DEFS, getTrackDef, hasSections } from '../data/tracks';
import { describeSection } from '../view/sectionInfo';
import { boatName, difficultyName, t, trackName } from '../i18n';
import { net } from '../net/client';
import type { ServerMsg } from '../net/protocol';
import { saveSession, session } from '../session';
import { createBoatSprite } from '../view/boatSprite';
import { background, button, fitText, setSelected, text } from '../view/ui';

const COLORS = [0xff5a4d, 0x4da3ff, 0xffd23f, 0x62d26f];

/**
 * The room before a race: its code and an invite link, who is in (up to four), each player's boat,
 * and the track and difficulty, which the host picks. The host starts once everyone is ready;
 * empty seats are filled with AI boats.
 */
export class LobbyScene extends Phaser.Scene {
  private dyn!: Phaser.GameObjects.Container;
  private netText!: Phaser.GameObjects.Text;

  constructor() {
    super('Lobby');
  }

  create(): void {
    background(this);
    audio.playMusic('menu');
    this.dyn = this.add.container(0, 0);
    net.on(this, 'lobby', () => this.render());
    net.on(this, 'start', (m) => this.scene.start('Race', { online: m }));
    net.on(this, 'closed', () => this.scene.start('Online', { error: t('online.lost') }));
    if (!net.inRoom) {
      this.scene.start('Online', { error: t('online.lost') });
      return;
    }
    // Joined while a race is on (its start came with the welcome): watch it.
    if (net.lobby?.racing && net.start) {
      this.scene.start('Race', { online: net.start });
      return;
    }
    this.netText = text(this, 640, 190, t('online.reconnecting'), 24, '#ffd0c4', false).setDepth(10).setVisible(false);
    this.render();
  }

  update(): void {
    this.netText.setVisible(net.reconnecting);
  }

  private me(lobby: Extract<ServerMsg, { t: 'lobby' }>) {
    return lobby.players.find((p) => p.id === net.you);
  }

  private render(): void {
    const lobby = net.lobby;
    if (!lobby) return;
    this.dyn.removeAll(true);
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => (this.dyn.add(o), o);
    const me = this.me(lobby);
    const host = !!me?.host;

    add(fitText(text(this, 640, 56, t('lobby.room', { code: net.code }), 54), 900).setStroke('#0b3a5b', 8));
    const invite = `${location.origin}${location.pathname}?room=${net.code}`;
    add(button(this, 640, 122, 380, 50, t('lobby.copy'), () => {
      void navigator.clipboard?.writeText(invite).then(() => copied.setText(t('lobby.copied')), () => copied.setText(invite));
    }, { textSize: 22, fill: 0x3d5266 }));
    const copied = add(text(this, 640, 162, '', 18, '#bfe1f7', false));

    // Players
    add(this.add.rectangle(330, 380, 540, 380, 0x0b3a5b, 0.65).setStrokeStyle(3, 0xffffff, 0.5));
    for (let i = 0; i < 4; i++) {
      const p = lobby.players[i];
      const y = 230 + i * 92;
      if (!p) {
        add(text(this, 330, y, t('lobby.aiSeat'), 22, '#7fa6c4', false));
        continue;
      }
      add(this.add.circle(100, y, 14, COLORS[i]).setStrokeStyle(3, 0xffffff));
      const nm = add(this.add.text(130, y - 26, p.name + (p.id === net.you ? ` (${t('you')})` : ''), { fontFamily: 'Trebuchet MS, Verdana, sans-serif', fontSize: '26px', fontStyle: 'bold', color: '#ffffff', resolution: 2 }));
      if (nm.width > 300) nm.setScale(300 / nm.width);
      add(this.add.text(130, y + 6, boatName(p.boatId), { fontFamily: 'Trebuchet MS, Verdana, sans-serif', fontSize: '20px', color: '#bfe1f7', resolution: 2 }));
      const tag = p.away ? t('lobby.away') : p.watching ? t('lobby.watching') : p.host ? t('lobby.host') : p.ready ? t('lobby.ready') : t('lobby.notReady');
      add(text(this, 530, y, tag, 22, p.away || p.watching ? '#bfe1f7' : p.host ? '#ffe08a' : p.ready ? '#9dff9d' : '#ffb0a0'));
    }

    // My boat
    const bi = Math.max(0, BOATS.findIndex((b) => b.id === (me?.boatId ?? session.boatId)));
    add(text(this, 950, 215, t('lobby.yourBoat'), 22, '#bfe1f7', false));
    const boat = BOATS[bi];
    const sprite = add(createBoatSprite(this, boat, COLORS[Math.max(0, lobby.players.findIndex((p) => p.id === net.you))]).setPosition(950, 265));
    sprite.setScale(Math.min(1.6, 200 / boat.size.length));
    add(fitText(text(this, 950, 315, boatName(boat.id), 26), 260));
    const pickBoat = (d: number): void => {
      const next = BOATS[(bi + d + BOATS.length) % BOATS.length];
      session.boatId = next.id;
      saveSession();
      net.send({ t: 'boat', boatId: next.id });
    };
    add(button(this, 760, 285, 60, 60, '‹', () => pickBoat(-1), { textSize: 40 }));
    add(button(this, 1140, 285, 60, 60, '›', () => pickBoat(1), { textSize: 40 }));

    // Track and difficulty (host changes them; everyone sees them)
    add(text(this, 950, 395, t('lobby.track'), 22, '#bfe1f7', false));
    const ti = Math.max(0, TRACK_DEFS.findIndex((d) => d.id === lobby.settings.trackId));
    add(fitText(text(this, 950, 440, trackName(lobby.settings.trackId), 28), 300));
    const diffs = Object.keys(DIFFICULTIES) as Difficulty[];
    // A new track brings the host's saved stretch for it; a new difficulty keeps the stretch.
    const send = (trackId: string, difficulty: Difficulty): void => net.send({
      t: 'settings',
      settings: { trackId, difficulty, section: trackId === lobby.settings.trackId ? lobby.settings.section : session.sections?.[trackId] },
    });
    if (host) {
      add(button(this, 760, 440, 60, 56, '‹', () => send(TRACK_DEFS[(ti - 1 + TRACK_DEFS.length) % TRACK_DEFS.length].id, lobby.settings.difficulty), { textSize: 36 }));
      add(button(this, 1140, 440, 60, 56, '›', () => send(TRACK_DEFS[(ti + 1) % TRACK_DEFS.length].id, lobby.settings.difficulty), { textSize: 36 }));
    }
    // The stretch of the Reims canal: the host can change it.
    if (hasSections(getTrackDef(lobby.settings.trackId))) {
      const desc = describeSection(lobby.settings.trackId, lobby.settings.section, true);
      if (host) {
        add(button(this, 950, 482, 470, 38, `✎ ${desc}`, () => this.scene.start('Section', { trackId: lobby.settings.trackId, section: lobby.settings.section, online: true }), { fill: 0x3d5266, textSize: 17 }));
      } else add(fitText(text(this, 950, 482, desc, 18, '#ffe08a', false), 470));
    }
    diffs.forEach((d, k) => {
      const b = add(button(this, 820 + k * 130, 540, 120, 50, difficultyName(d), () => host && send(lobby.settings.trackId, d), { textSize: 22 }));
      setSelected(b, d === lobby.settings.difficulty);
      if (!host) b.disableInteractive();
    });

    // Leave / ready / start
    add(button(this, 150, 660, 200, 64, t('lobby.leave'), () => {
      net.leave();
      this.scene.start('Online');
    }, { fill: 0x8a4a4a, textSize: 28 }));
    if (host) {
      const everyoneReady = lobby.players.every((p) => p.host || p.ready);
      add(button(this, 1060, 660, 340, 72, t('lobby.start'), () => everyoneReady && net.send({ t: 'start' }), { fill: everyoneReady ? 0x2d9d5a : 0x4a5a66, textSize: 32 }));
      if (!everyoneReady) add(text(this, 640, 600, t('lobby.waiting'), 22, '#bfe1f7', false));
    } else if (me) {
      add(button(this, 1060, 660, 340, 72, me.ready ? t('lobby.notReadyBtn') : t('lobby.readyBtn'), () => net.send({ t: 'ready', ready: !me.ready }), { fill: me.ready ? 0x3d5266 : 0x2d9d5a, textSize: 30 }));
      add(text(this, 640, 600, t('lobby.hostStarts'), 22, '#bfe1f7', false));
    }
    if (lobby.racing) add(text(this, 640, 560, t('online.racing'), 22, '#ffd0c4', false));
  }
}
