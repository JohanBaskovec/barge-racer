import Phaser from 'phaser';
import { audio } from '../audio/AudioManager';
import { BOATS } from '../data/boats';
import { DIFFICULTIES, type Difficulty } from '../data/difficulty';
import { TRACK_DEFS, getTrackDef, hasSections } from '../data/tracks';
import { describeSection } from '../view/sectionInfo';
import { boatName, difficultyName, t, trackName } from '../i18n';
import { net } from '../net/client';
import { MAX_PLAYERS, type ServerMsg } from '../net/protocol';
import { RACER_COLORS as COLORS } from '../race/RaceSimulation';
import { saveSession, session } from '../session';
import { createBoatSprite } from '../view/boatSprite';
import { background, button, fitText, setSelected, text } from '../view/ui';


/**
 * The room before a race: its code and an invite link, who is in (up to eight people), each
 * player's boat, the AI boats that race too, and the track and difficulty. The host picks the
 * track, how many people may join, adds and removes AI boats, and starts once everyone is ready.
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

    // The host's settings: a new track brings the host's saved stretch for it; the rest stays.
    const send = (trackId: string, difficulty: Difficulty, size = lobby.settings.size): void => net.send({
      t: 'settings',
      settings: { trackId, difficulty, size, section: trackId === lobby.settings.trackId ? lobby.settings.section : session.sections?.[trackId] },
    });

    add(fitText(text(this, 640, 56, t('lobby.room', { code: net.code }), 54), 900).setStroke('#0b3a5b', 8));
    const invite = `${location.origin}${location.pathname}?room=${net.code}`;
    add(button(this, 640, 122, 380, 50, t('lobby.copy'), () => {
      void navigator.clipboard?.writeText(invite).then(() => copied.setText(t('lobby.copied')), () => copied.setText(invite));
    }, { textSize: 22, fill: 0x3d5266 }));
    const copied = add(text(this, 640, 162, '', 18, '#bfe1f7', false));

    // Players, then the AI boats: in the order of the starting grid (and its colours).
    const F = 'Trebuchet MS, Verdana, sans-serif';
    add(this.add.rectangle(330, 395, 560, 400, 0x0b3a5b, 0.65).setStrokeStyle(3, 0xffffff, 0.5));
    const boats = lobby.players.length + lobby.bots.length;
    add(this.add.text(72, 220, t('lobby.boats', { n: boats, max: MAX_PLAYERS }), { fontFamily: F, fontSize: '22px', fontStyle: 'bold', color: '#ffe08a', resolution: 2 }).setOrigin(0, 0.5));
    // Room size: how many people may join (the host sets it)
    const size = lobby.settings.size ?? MAX_PLAYERS;
    add(this.add.text(host ? 418 : 590, 220, host ? t('lobby.size') : `${t('lobby.size')} ${size}`, { fontFamily: F, fontSize: '19px', color: '#bfe1f7', resolution: 2 }).setOrigin(1, 0.5));
    if (host) {
      const setSize = (n: number): void => send(lobby.settings.trackId, lobby.settings.difficulty, Math.max(2, Math.min(MAX_PLAYERS, n)));
      add(button(this, 448, 220, 40, 34, '−', () => setSize(size - 1), { textSize: 24 }));
      add(text(this, 497, 220, String(size), 24));
      add(button(this, 546, 220, 40, 34, '+', () => setSize(size + 1), { textSize: 24 }));
    }
    const rows: { name: string; boatId: string; tag: string; tagColor: string; bot?: string; me?: boolean }[] = [
      ...lobby.players.map((p) => ({
        name: p.name + (p.id === net.you ? ` (${t('you')})` : ''),
        boatId: p.boatId,
        me: p.id === net.you,
        tag: p.away ? t('lobby.away') : p.watching ? t('lobby.watching') : p.host ? t('lobby.host') : p.ready ? t('lobby.ready') : t('lobby.notReady'),
        tagColor: p.away || p.watching ? '#bfe1f7' : p.host ? '#ffe08a' : p.ready ? '#9dff9d' : '#ffb0a0',
      })),
      ...lobby.bots.map((b) => ({ name: b.name, boatId: b.boatId, tag: t('lobby.ai'), tagColor: '#bfe1f7', bot: b.id })),
    ];
    rows.forEach((r, i) => {
      const y = 262 + i * 40;
      if (r.me) add(this.add.rectangle(330, y, 548, 36, 0x2d6a9d, 0.7));
      add(this.add.circle(86, y, 11, COLORS[i % COLORS.length]).setStrokeStyle(2, 0xffffff));
      const nm = add(this.add.text(106, y, r.name, { fontFamily: F, fontSize: '21px', fontStyle: 'bold', color: r.bot ? '#d6e6f2' : '#ffffff', resolution: 2 }).setOrigin(0, 0.5));
      if (nm.width > 215) nm.setScale(215 / nm.width);
      const bn = add(this.add.text(330, y, boatName(r.boatId), { fontFamily: F, fontSize: '17px', color: '#bfe1f7', resolution: 2 }).setOrigin(0, 0.5));
      if (bn.width > 150) bn.setScale(150 / bn.width);
      add(fitText(text(this, r.bot && host ? 520 : 540, y, r.tag, 17, r.tagColor), 110));
      if (r.bot && host) add(button(this, 582, y, 34, 30, '✕', () => net.send({ t: 'removeBot', id: r.bot! }), { fill: 0x8a4a4a, textSize: 24 }));
    });
    if (host && boats < MAX_PLAYERS) add(button(this, 330, 574, 230, 36, t('lobby.addAi'), () => net.send({ t: 'addBot' }), { fill: 0x3d5266, textSize: 20 }));

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
      if (!everyoneReady) add(text(this, 950, 606, t('lobby.waiting'), 20, '#bfe1f7', false));
    } else if (me) {
      add(button(this, 1060, 660, 340, 72, me.ready ? t('lobby.notReadyBtn') : t('lobby.readyBtn'), () => net.send({ t: 'ready', ready: !me.ready }), { fill: me.ready ? 0x3d5266 : 0x2d9d5a, textSize: 30 }));
      add(text(this, 950, 606, t('lobby.hostStarts'), 20, '#bfe1f7', false));
    }
    if (lobby.racing) add(text(this, 640, 560, t('online.racing'), 22, '#ffd0c4', false));
  }
}
