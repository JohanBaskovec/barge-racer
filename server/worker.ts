/**
 * Fast & Fluvial's Cloudflare Worker: serves the game (static files from dist/) and hosts
 * multiplayer rooms. `GET /api/room/ABCD` with a WebSocket upgrade connects to room ABCD: one
 * Durable Object per room code, running the race (src/net/room.ts) for everyone in it.
 */
import { isRoomCode, TICK_MS } from '../src/net/protocol';
import { RoomCore } from '../src/net/room';

export interface Env {
  ROOMS: DurableObjectNamespace;
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const m = /^\/api\/room\/([A-Za-z]{4})$/.exec(url.pathname);
    if (m) {
      const code = m[1].toUpperCase();
      if (!isRoomCode(code)) return new Response('Bad room code', { status: 400 });
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
      return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

/** One room. Holds the sockets and a 20 Hz timer while anyone is connected. */
export class RaceRoom implements DurableObject {
  private room: RoomCore | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextId = 1;

  async fetch(request: Request): Promise<Response> {
    const code = new URL(request.url).pathname.slice(-4).toUpperCase();
    this.room ??= new RoomCore(code);
    const room = this.room;
    const pair = new WebSocketPair();
    const [client, socket] = [pair[0], pair[1]];
    socket.accept();
    const conn = { id: `p${this.nextId++}`, send: (d: string) => socket.send(d) };
    socket.addEventListener('message', (e) => room.message(conn, typeof e.data === 'string' ? e.data : ''));
    const leave = (): void => {
      room.disconnect(conn);
      if (room.playerCount === 0) this.stopTimer();
    };
    socket.addEventListener('close', leave);
    socket.addEventListener('error', leave);
    this.timer ??= setInterval(() => room.tick(), TICK_MS);
    return new Response(null, { status: 101, webSocket: client });
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.room = null; // an empty room is forgotten; the next visitor starts a fresh one
  }
}
