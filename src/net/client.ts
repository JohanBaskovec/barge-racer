import type Phaser from 'phaser';
import type { ClientMsg, ServerMsg } from './protocol';

type Msg<T extends ServerMsg['t']> = Extract<ServerMsg, { t: T }>;
type Handler = (m: ServerMsg) => void;

/** Where the multiplayer server is: the same site the game is served from (/api/room/CODE). */
function roomUrl(code: string): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/api/room/${code}`;
}

/** Waits between reconnection attempts (ms): about 30 s in all before giving up. */
const RETRY_MS = [300, 1000, 2000, 3000, 4000, 5000, 5000, 5000, 5000];
/** No message for this long (the server sends at least a pong every 2 s): the connection is dead. */
const SILENCE_MS = 6000;

/**
 * The connection to a multiplayer room, shared by the lobby, race and results screens.
 * Scenes subscribe with `on(scene, type, fn)`, which unsubscribes when the scene shuts down.
 *
 * If the connection drops (a phone changing network, a tunnel, the game put in the background),
 * it reconnects by itself and takes the player's seat back with the key the server gave them.
 * `reconnecting` is true meanwhile; 'closed' is only reported once it gives up.
 */
class NetClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private lastHeard = 0;
  private key = '';
  private name = '';
  private boatId = '';
  you = '';
  code = '';
  /** Last lobby state and race start received (scenes read them when they open). */
  lobby: Msg<'lobby'> | null = null;
  start: Msg<'start'> | null = null;
  /** Round-trip time to the server, in ms. */
  rtt = 0;
  /** The connection dropped and is being re-established. */
  reconnecting = false;

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /** In a room: connected, or reconnecting to it. */
  get inRoom(): boolean {
    return this.connected || this.reconnecting;
  }

  /** Open room `code` and join it. Resolves once in; rejects with 'full' or 'connection'. */
  join(code: string, name: string, boatId: string): Promise<void> {
    this.leave();
    this.code = code;
    this.name = name;
    this.boatId = boatId;
    return new Promise((resolve, reject) => this.open(resolve, reject));
  }

  /** One connection attempt. The first one reports to `join`; reconnections have no callbacks. */
  private open(onIn?: () => void, onFail?: (e: Error) => void): void {
    let settled = false;
    const ws = new WebSocket(roomUrl(this.code));
    this.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ t: 'join', name: this.name, boatId: this.boatId, key: this.key || undefined } satisfies ClientMsg));
    ws.onmessage = (e) => {
      if (this.ws !== ws) return;
      let m: ServerMsg;
      try {
        m = JSON.parse(e.data as string);
      } catch {
        return;
      }
      this.lastHeard = performance.now();
      if (m.t === 'welcome') {
        this.you = m.you;
        this.key = m.key;
        settled = true;
        this.attempt = 0;
        this.reconnecting = false;
        this.startPing();
        onIn?.();
      } else if (m.t === 'error' && !settled) {
        settled = true;
        this.ws = null;
        ws.close();
        if (onFail) onFail(new Error(m.reason));
        else this.lost();
        return;
      } else if (m.t === 'lobby') this.lobby = m;
      else if (m.t === 'start') this.start = m;
      else if (m.t === 'pong') this.rtt = performance.now() - m.c;
      this.emit(m.t, m);
    };
    ws.onclose = (e) => {
      if (this.ws !== ws) return; // left, or already given up on
      this.ws = null;
      this.stopPing();
      if (!settled && onFail) onFail(new Error('connection'));
      else if (e.code === 4000) this.lost(); // this seat was taken over by another connection
      else this.retry();
    };
  }

  /** The connection is gone: try again shortly, a few times, then give up. */
  private retry(): void {
    if (this.attempt >= RETRY_MS.length) return this.lost();
    this.reconnecting = true;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.open();
    }, RETRY_MS[this.attempt++]);
  }

  private lost(): void {
    this.reconnecting = false;
    this.key = '';
    this.lobby = null;
    this.start = null;
    this.emit('closed', { t: 'error', reason: 'bad' });
  }

  private emit(type: string, m: ServerMsg): void {
    for (const h of this.handlers.get(type) ?? []) h(m);
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
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.attempt = 0;
    this.reconnecting = false;
    this.key = '';
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    this.lobby = null;
    this.start = null;
  }

  private startPing(): void {
    this.stopPing();
    this.lastHeard = performance.now();
    this.pingTimer = setInterval(() => {
      // A connection can die without closing (mobile networks): silence means it's gone.
      if (performance.now() - this.lastHeard > SILENCE_MS && this.ws) {
        const ws = this.ws;
        this.ws = null;
        this.stopPing();
        ws.close();
        this.retry();
        return;
      }
      this.send({ t: 'ping', c: performance.now() });
    }, 2000);
  }

  private stopPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }
}

export const net = new NetClient();
