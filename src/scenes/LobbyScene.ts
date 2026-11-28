import Phaser from 'phaser';
import { audio } from '../audio/AudioManager';
import { BOATS } from '../data/boats';
import { DIFFICULTIES, type Difficulty } from '../data/difficulty';
import { ARENA_DEFS, TRACK_DEFS, getTrackDef, hasSections } from '../data/tracks';
import { GAME_MODES, type GameMode, TEAM_COLORS, isBattle, isTeamMode } from '../race/battle';
import { describeSection } from '../view/sectionInfo';
import { boatName, difficultyName, t, trackName } from '../i18n';
import { net } from '../net/client';
import { MAX_PLAYERS, type RoomSettings, type ServerMsg } from '../net/protocol';
import { cleanPlan } from '../cup/championship';
import { TAUNTS } from '../data/taunts';
import { tauntBubble } from '../view/tauntBubble';
import { RACER_COLORS as COLORS } from '../race/RaceSimulation';
import { saveSession, session } from '../session';
import { createBoatSprite } from '../view/boatSprite';
import { background, button, fitText, setSelected, text } from '../view/ui';


/**
 * The room before a race: its code and an invite link, who is in (up to eight people), each
 * player's boat, the AI boats in the other seats, and the track and difficulty. The host picks the
 * track and the room size (how many boats race), can remove an AI boat (and its seat), and starts
 * once everyone is ready.
 */
export class LobbyScene extends Phaser.Scene {
  private dyn!: Phaser.GameObjects.Container;
  private netText!: Phaser.GameObjects.Text;
  /** The taunt menu, while open (outside `dyn`: it stays open when the lobby changes). */
  private tauntMenu: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('Lobby');
  }

  create(): void {
    background(this);
    audio.playMusic('menu');
    this.dyn = this.add.container(0, 0);
    this.tauntMenu = null;
    net.on(this, 'lobby', () => this.render());
    // A taunt: a bubble beside that player's name (rows are people first, in the room's order).
    net.on(this, 'taunt', (m) => {
      const i = net.lobby?.players.findIndex((p) => p.id === m.from) ?? -1;
      if (i >= 0) tauntBubble(this, 616, 262 + i * 40, m.id, 'left', null, 120).setDepth(20);
    });
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

  private toggleTaunts(): void {
    if (this.tauntMenu) {
      this.tauntMenu.destroy();
      this.tauntMenu = null;
      return;
    }
    const bg = this.add.rectangle(330, 503, 552, 104, 0x0b3a5b, 0.95).setStrokeStyle(2, 0xffffff, 0.6).setInteractive();
    const chips = TAUNTS.map((id, k) => button(this, 150 + (k % 3) * 180, 480 + Math.floor(k / 3) * 46, 170, 38, t(`taunt.${id}`), () => {
      net.send({ t: 'taunt', id });
      this.toggleTaunts();
    }, { fill: 0x3d5266, textSize: 18 }));
    this.tauntMenu = this.add.container(0, 0, [bg, ...chips]).setDepth(30);
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
    const mode: GameMode = lobby.settings.mode ?? 'race';
    const battle = isBattle(mode), teams = isTeamMode(mode);
    const send = (patch: Partial<RoomSettings>): void => {
      const s = { ...lobby.settings, ...patch };
      const cup = !isBattle(s.mode) && !!s.cup;
      net.send({
        t: 'settings',
        settings: {
          trackId: s.trackId, difficulty: s.difficulty, size: s.size, cup, mode: s.mode,
          section: s.trackId === lobby.settings.trackId ? lobby.settings.section : session.sections?.[s.trackId],
          // A championship: the races as they are, or (turning it on) the host's own from single player.
          plan: cup ? (lobby.settings.plan ?? cleanPlan(session.cupPlan)) : undefined,
        },
      });
    };
    // A new mode: a battle goes to an arena, a race back to a race track.
    const setMode = (m: GameMode): void => {
      const list = isBattle(m) ? ARENA_DEFS : TRACK_DEFS;
      const keep = list.some((d) => d.id === lobby.settings.trackId);
      const fallback = isBattle(m) ? (session.battle?.arena ?? ARENA_DEFS[0].id) : session.trackId;
      send({ mode: m, trackId: keep ? lobby.settings.trackId : list.some((d) => d.id === fallback) ? fallback : list[0].id, cup: false });
    };
    // In a championship, everyone's points so far.
    const cup = lobby.cup;
    const pts = (key: string): number | null => (cup ? (cup.standings.find((e) => e.key === key)?.points ?? 0) : null);

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
    // Room size: how many boats race; the seats people don't take are AI boats (the host sets it).
    const size = lobby.settings.size ?? boats;
    add(this.add.text(72, 220, t('lobby.boats', { n: boats, max: size }), { fontFamily: F, fontSize: '22px', fontStyle: 'bold', color: '#ffe08a', resolution: 2 }).setOrigin(0, 0.5));
    if (host) {
      add(this.add.text(418, 220, t('lobby.size'), { fontFamily: F, fontSize: '19px', color: '#bfe1f7', resolution: 2 }).setOrigin(1, 0.5));
      // Smaller removes the last AI boat (never a person); bigger adds one.
      const canShrink = size > lobby.players.length;
      const canGrow = size < MAX_PLAYERS;
      const setSize = (n: number): void => send({ size: n });
      add(button(this, 448, 220, 40, 34, '−', () => canShrink && setSize(size - 1), { textSize: 24, fill: canShrink ? undefined : 0x55606a }));
      add(text(this, 497, 220, String(size), 24));
      add(button(this, 546, 220, 40, 34, '+', () => canGrow && setSize(size + 1), { textSize: 24, fill: canGrow ? undefined : 0x55606a }));
    }
    const rows: { name: string; boatId: string; tag: string; tagColor: string; bot?: string; me?: boolean; pts?: number | null; team?: number }[] = [
      ...lobby.players.map((p) => ({
        team: p.team,
        pts: pts(p.id),
        name: p.name + (p.id === net.you ? ` (${t('you')})` : ''),
        boatId: p.boatId,
        me: p.id === net.you,
        tag: p.away ? t('lobby.away') : p.watching ? t('lobby.watching') : p.host ? t('lobby.host') : p.ready ? t('lobby.ready') : t('lobby.notReady'),
        tagColor: p.away || p.watching ? '#bfe1f7' : p.host ? '#ffe08a' : p.ready ? '#9dff9d' : '#ffb0a0',
      })),
      ...lobby.bots.map((b) => ({ name: b.name, boatId: b.boatId, tag: t('lobby.ai'), tagColor: '#bfe1f7', bot: b.id, pts: pts(b.id), team: b.team })),
    ];
    rows.forEach((r, i) => {
      const y = 262 + i * 40;
      if (r.me) add(this.add.rectangle(330, y, 548, 36, 0x2d6a9d, 0.7));
      // Team battles: the team's flag and colour instead of the grid colour.
      if (teams && r.team !== undefined) add(this.add.image(86, y, `flatFlag_${r.team}`).setDisplaySize(27, 18));
      else add(this.add.circle(86, y, 11, COLORS[i % COLORS.length]).setStrokeStyle(2, 0xffffff));
      const nm = add(this.add.text(106, y, r.name, { fontFamily: F, fontSize: '21px', fontStyle: 'bold', color: r.bot ? '#d6e6f2' : '#ffffff', resolution: 2 }).setOrigin(0, 0.5));
      if (nm.width > 215) nm.setScale(215 / nm.width);
      const bn = add(this.add.text(330, y, boatName(r.boatId), { fontFamily: F, fontSize: '17px', color: '#bfe1f7', resolution: 2 }).setOrigin(0, 0.5));
      const bw = r.pts === undefined || r.pts === null ? 150 : 100;
      if (bn.width > bw) bn.setScale(bw / bn.width);
      if (r.pts !== undefined && r.pts !== null) add(this.add.text(482, y, t('cup.pts', { n: r.pts }), { fontFamily: F, fontSize: '17px', fontStyle: 'bold', color: '#ffe08a', resolution: 2 }).setOrigin(1, 0.5));
      add(fitText(text(this, r.bot && host ? 520 : 540, y, r.tag, 17, r.tagColor), 110));
      if (r.bot && host) {
        // The ✕ drawn with lines: the glyph is tiny or missing in some phone fonts.
        const x = add(button(this, 582, y, 34, 30, '', () => net.send({ t: 'removeBot', id: r.bot! }), { fill: 0x8a4a4a }));
        x.add(this.add.graphics().lineStyle(4, 0xffffff, 1).lineBetween(-7, -7, 7, 7).lineBetween(-7, 7, 7, -7));
      }
    });

    // Taunts: a button at the bottom of the panel opens the phrases over it.
    add(button(this, teams ? 200 : 330, 574, 220, 34, t('taunt.button'), () => this.toggleTaunts(), { fill: 0x3d5266, textSize: 18 }));
    // Team battles: change sides.
    if (teams && me && me.team !== undefined) {
      const other = 1 - me.team;
      const sw = add(button(this, 460, 574, 220, 34, t('lobby.join', { team: t(`battle.team${other}` as 'battle.team0') }), () => net.send({ t: 'team', team: other }), { fill: TEAM_COLORS[other], textSize: 18 }));
      sw.add(this.add.image(-88, 0, `flatFlag_${other}`).setDisplaySize(27, 18));
    }

    // My boat
    const bi = Math.max(0, BOATS.findIndex((b) => b.id === (me?.boatId ?? session.boatId)));
    add(text(this, 950, 215, t('lobby.yourBoat'), 22, '#bfe1f7', false));
    const boat = BOATS[bi];
    const sprite = add(createBoatSprite(this, boat, teams && me?.team !== undefined ? TEAM_COLORS[me.team] : COLORS[Math.max(0, lobby.players.findIndex((p) => p.id === net.you))]).setPosition(950, 265));
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

    // The mode: a race, or a battle on an arena (the host picks; everyone sees it).
    const modeName = (m: GameMode): string => (m === 'race' ? t('lobby.raceMode') : t(`battle.${m}` as 'battle.ctf'));
    if (host) {
      const mi = GAME_MODES.indexOf(mode);
      add(button(this, 790, 356, 44, 36, '‹', () => setMode(GAME_MODES[(mi - 1 + GAME_MODES.length) % GAME_MODES.length]), { textSize: 26 }));
      add(button(this, 1110, 356, 44, 36, '›', () => setMode(GAME_MODES[(mi + 1) % GAME_MODES.length]), { textSize: 26 }));
    }
    add(fitText(text(this, 950, 356, modeName(mode), 24, battle ? '#ffb0a0' : '#ffffff'), 260));

    // Track and difficulty (host changes them; everyone sees them)
    add(text(this, (cup || host) && !battle ? 870 : 950, 395, battle ? t('lobby.arena') : t('lobby.track'), 22, '#bfe1f7', false));
    const tracks = battle ? ARENA_DEFS : TRACK_DEFS;
    const ti = Math.max(0, tracks.findIndex((d) => d.id === lobby.settings.trackId));
    add(fitText(text(this, 950, 440, trackName(lobby.settings.trackId), 28), 300));
    // Championship: the host turns it on; the cup then picks the track, race after race.
    if (host && !battle) {
      const b = add(button(this, 1060, 395, 190, 36, t('cup.toggle'), () => send({ cup: !cup }), { fill: 0x8a6a2a, textSize: 18 }));
      setSelected(b, !!cup);
    } else if (cup) add(text(this, 1060, 395, t('cup.toggle'), 20, '#ffe08a'));
    // A battle: what it's about, under the arena.
    if (battle) add(this.add.text(950, 468, t(`battle.${mode}Desc` as 'battle.ctfDesc'), { fontFamily: 'Trebuchet MS, Verdana, sans-serif', fontSize: '15px', color: '#ffe08a', align: 'center', wordWrap: { width: 440 }, resolution: 2 }).setOrigin(0.5, 0));
    if (cup) {
      // Which race of how many, and its laps (or its stretch); the host sets the races up before the first one.
      const race = cup.plan[Math.min(cup.done, cup.plan.length - 1)];
      const what = race.section ? describeSection(race.trackId, race.section, true) : race.laps === 1 ? t('cup.oneLap') : t('cup.laps', { n: race.laps ?? 3 });
      const editable = host && cup.done === 0;
      add(fitText(text(this, editable ? 870 : 950, 482, `${t('cup.race', { n: cup.done + 1, total: cup.total })} · ${what}`, 19, '#ffe08a', false), editable ? 290 : 470));
      if (editable) add(button(this, 1100, 482, 150, 36, t('cup.edit'), () => this.scene.start('CupSetup', { online: true }), { fill: 0x3d5266, textSize: 18 }));
    }
    const diffs = Object.keys(DIFFICULTIES) as Difficulty[];
    if (host && !cup) {
      add(button(this, 760, 440, 60, 56, '‹', () => send({ trackId: tracks[(ti - 1 + tracks.length) % tracks.length].id }), { textSize: 36 }));
      add(button(this, 1140, 440, 60, 56, '›', () => send({ trackId: tracks[(ti + 1) % tracks.length].id }), { textSize: 36 }));
    }
    // The stretch of the Reims canal: the host can change it.
    if (!cup && !battle && hasSections(getTrackDef(lobby.settings.trackId))) {
      const desc = describeSection(lobby.settings.trackId, lobby.settings.section, true);
      if (host) {
        add(button(this, 950, 482, 470, 38, `✎ ${desc}`, () => this.scene.start('Section', { trackId: lobby.settings.trackId, section: lobby.settings.section, online: true }), { fill: 0x3d5266, textSize: 17 }));
      } else add(fitText(text(this, 950, 482, desc, 18, '#ffe08a', false), 470));
    }
    diffs.forEach((d, k) => {
      const b = add(button(this, 820 + k * 130, 540, 120, 50, difficultyName(d), () => host && send({ difficulty: d }), { textSize: 22 }));
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
      add(button(this, 1060, 660, 340, 72, battle ? t('battle.start') : t('lobby.start'), () => everyoneReady && net.send({ t: 'start' }), { fill: everyoneReady ? 0x2d9d5a : 0x4a5a66, textSize: 32 }));
      if (!everyoneReady) add(text(this, 950, 606, t('lobby.waiting'), 20, '#bfe1f7', false));
    } else if (me) {
      add(button(this, 1060, 660, 340, 72, me.ready ? t('lobby.notReadyBtn') : t('lobby.readyBtn'), () => net.send({ t: 'ready', ready: !me.ready }), { fill: me.ready ? 0x3d5266 : 0x2d9d5a, textSize: 30 }));
      add(text(this, 950, 606, t('lobby.hostStarts'), 20, '#bfe1f7', false));
    }
    if (lobby.racing) add(text(this, 640, 560, t('online.racing'), 22, '#ffd0c4', false));
  }
}
