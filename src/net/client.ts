import type Phaser from 'phaser';
import type { ClientMsg, ServerMsg } from './protocol';

type Msg<T extends ServerMsg['t']> = Extract<ServerMsg, { t: T }>;
type Handler = (m: ServerMsg) => void;

/** Where the multiplayer server is: the same site the game is served from (/api/room/CODE). */
function roomUrl(code: string): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/api/room/${code}`;
}

/**
 * The connection to a multiplayer room, shared by the lobby, race and results screens.
 * Scenes subscribe with `on(scene, type, fn)`, which unsubscribes when the scene shuts down.
 */
class NetClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  you = '';
  code = '';
  /** Last lobby state and race start received (scenes read them when they open). */
  lobby: Msg<'lobby'> | null = null;
  start: Msg<'start'> | null = null;
  /** Round-trip time to the server, in ms. */
  rtt = 0;

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /** Open room `code` and join it. Resolves once in; rejects with 'full', 'racing' or 'connection'. */
  join(code: string, name: string, boatId: string): Promise<void> {
    this.leave();
    this.code = code;
    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(roomUrl(code));
      this.ws = ws;
      ws.onopen = () => this.send({ t: 'join', name, boatId });
      ws.onmessage = (e) => {
        let m: ServerMsg;
        try {
          m = JSON.parse(e.data as string);
        } catch {
          return;
        }
        if (m.t === 'welcome') {
          this.you = m.you;
          settled = true;
          this.startPing();
          resolve();
        } else if (m.t === 'error' && !settled) {
          settled = true;
          reject(new Error(m.reason));
          ws.close();
          return;
        } else if (m.t === 'lobby') this.lobby = m;
        else if (m.t === 'start') this.start = m;
        else if (m.t === 'pong') this.rtt = performance.now() - m.c;
        for (const h of this.handlers.get(m.t) ?? []) h(m);
      };
      ws.onclose = () => {
        if (!settled) {
          settled = true;
          reject(new Error('connection'));
        }
        if (this.ws === ws) {
          this.stopPing();
          this.ws = null;
          for (const h of this.handlers.get('closed') ?? []) h({ t: 'error', reason: 'bad' });
        }
      };
    });
  }

  send(msg: ClientMsg): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  /** Listen for a message type (or 'closed') while `scene` is running. */
  on<T extends ServerMsg['t'] | 'closed'>(scene: Phaser.Scene, type: T, fn: (m: T extends ServerMsg['t'] ? Msg<T> : void) => void): void {
    const set = this.handlers.get(type) ?? new Set();
    this.handlers.set(type, set);
    const h = fn as Handler;
    set.add(h);
    scene.events.once('shutdown', () => set.delete(h));
  }

  leave(): void {
    this.stopPing();
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    this.lobby = null;
    this.start = null;
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => this.send({ t: 'ping', c: performance.now() }), 2000);
  }

  private stopPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }
}

export const net = new NetClient();
