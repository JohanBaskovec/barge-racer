import Phaser from 'phaser';
import { t } from '../i18n';
import { net, savedSeat } from '../net/client';
import { isRoomCode, randomRoomCode } from '../net/protocol';
import { session } from '../session';
import { background, button, fitText, text } from '../view/ui';

const NAME_KEY = 'barge-racer-name';

// Single quotes inside: this goes into a double-quoted style="..." attribute.
const inputStyle = "font: bold 30px 'Trebuchet MS', Verdana, sans-serif; padding: 10px 16px; border-radius: 12px; border: 3px solid #ffffff; background: #0b3a5b; color: #ffffff; text-align: center; outline: none;";

/** Play online: pick a name, then create a room (a new code) or join one with a friend's code. */
export class OnlineScene extends Phaser.Scene {
  private code = '';
  private status!: Phaser.GameObjects.Text;
  private busy = false;

  constructor() {
    super('Online');
  }

  private rejoining = false;

  /** `rejoin`: the page was reloaded while in a room: take the seat back straight away. */
  init(data: { code?: string; error?: string; rejoin?: boolean }): void {
    this.code = data?.code && isRoomCode(data.code) ? data.code : '';
    this.busy = false;
    this.rejoining = !!data?.rejoin;
    if (data?.error) this.time.delayedCall(0, () => this.setStatus(data.error!));
  }

  create(): void {
    background(this);
    fitText(text(this, 640, 70, t('online.title'), 56), 1000).setStroke('#0b3a5b', 8);

    text(this, 640, 160, t('online.name'), 26, '#bfe1f7', false);
    let saved = '';
    try {
      saved = localStorage.getItem(NAME_KEY) ?? '';
    } catch {
      /* ignore */
    }
    const nameEl = this.add.dom(640, 215).createFromHTML(`<input type="text" maxlength="16" placeholder="Captain" style="${inputStyle} width: 360px;">`);
    const name = nameEl.node.querySelector('input') as HTMLInputElement;
    name.value = saved;

    button(this, 640, 330, 420, 76, t('online.create'), () => this.go(randomRoomCode(), name.value), { fill: 0x2d9d5a, textSize: 32 });

    text(this, 640, 430, t('online.orJoin'), 24, '#bfe1f7', false);
    const codeEl = this.add.dom(560, 500).createFromHTML(`<input type="text" maxlength="4" placeholder="ABCD" style="${inputStyle} width: 180px; letter-spacing: 8px; text-transform: uppercase;">`);
    const code = codeEl.node.querySelector('input') as HTMLInputElement;
    code.value = this.code;
    button(this, 790, 500, 200, 64, t('online.join'), () => this.go(code.value.toUpperCase().trim(), name.value), { textSize: 30 });
    code.addEventListener('keydown', (e) => e.key === 'Enter' && this.go(code.value.toUpperCase().trim(), name.value));

    this.status = text(this, 640, 580, '', 24, '#ffd0c4', false);
    button(this, 150, 660, 200, 64, t('common.back'), () => this.scene.start('Title'), { fill: 0x555f6b, textSize: 28 });
    if (this.rejoining) void this.rejoin();
  }

  /** Back into the room this tab was in before it was reloaded, in the same seat (a race goes on). */
  private async rejoin(): Promise<void> {
    const seat = savedSeat();
    if (!seat) return;
    this.busy = true;
    this.setStatus(t('online.rejoining', { code: seat.code }));
    try {
      await net.join(seat.code, seat.name, seat.boatId, seat.key);
      this.scene.start('Lobby'); // straight on to the race if one is going
    } catch {
      this.setStatus(t('online.lost'));
      this.busy = false;
    }
  }

  private setStatus(s: string): void {
    this.status?.setText(s);
    fitText(this.status, 1100);
  }

  private async go(code: string, rawName: string): Promise<void> {
    if (this.busy) return;
    if (!isRoomCode(code)) return this.setStatus(t('online.badCode'));
    const name = rawName.trim().slice(0, 16) || 'Captain';
    try {
      localStorage.setItem(NAME_KEY, name);
    } catch {
      /* ignore */
    }
    this.busy = true;
    this.setStatus(t('online.connecting'));
    try {
      await net.join(code, name, session.boatId);
      this.scene.start('Lobby');
    } catch (e) {
      const reason = (e as Error).message;
      this.setStatus(reason === 'full' ? t('online.full') : reason === 'racing' ? t('online.racing') : t('online.noServer'));
      this.busy = false;
    }
  }
}
