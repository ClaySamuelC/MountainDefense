import Peer, { type DataConnection } from 'peerjs';
import {
  addPlayer,
  createWorld,
  removePlayer,
  DT,
  type Intent,
  type SimEvent,
  type WorldState,
} from '@shared';
import type { SnapshotHandler, Transport } from './transport';
import { HostSim } from './hostSim';

/** PeerJS peer id for a 4-digit room — keeps codes short while staying unique on the broker. */
const peerIdFor = (code: string) => `md-${code}`;

const MAX_PLAYERS = 4;
const OPEN_TIMEOUT_MS = 12_000;
const JOIN_TIMEOUT_MS = 12_000;

type WireMsg =
  | { type: 'hello'; name: string }
  | { type: 'welcome'; id: string; roomCode: string }
  | { type: 'snap'; w: WorldState; ev: SimEvent[] }
  | { type: 'intent'; intent: Intent }
  | { type: 'full'; reason: string };

export type DisconnectHandler = (reason: string) => void;

export interface P2PTransport extends Transport {
  whenDisconnected(cb: DisconnectHandler): void;
}

function normalizeCode(raw: string): string | null {
  const d = raw.replace(/\D/g, '');
  return d.length === 4 ? d : null;
}

function randomCode(): string {
  return String(Math.floor(Math.random() * 10000)).padStart(4, '0');
}

function openPeer(id?: string): Promise<Peer> {
  return new Promise((resolve, reject) => {
    const peer = id ? new Peer(id) : new Peer();
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      peer.destroy();
      reject(new Error('Timed out reaching the matchmaking broker'));
    }, OPEN_TIMEOUT_MS);

    peer.on('open', () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(peer);
    });

    peer.on('error', (err) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      peer.destroy();
      reject(err);
    });
  });
}

function waitConnOpen(conn: DataConnection, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (conn.open) {
      resolve();
      return;
    }
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error('Connection timed out'));
    }, ms);
    const onOpen = () => {
      cleanup();
      resolve();
    };
    const onErr = (err: Error) => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      conn.off('open', onOpen);
      conn.off('error', onErr);
    };
    conn.on('open', onOpen);
    conn.on('error', onErr);
  });
}

// ------------------------------------------------------------------ host

class HostTransport implements P2PTransport {
  readonly myId = 'p1';
  readonly roomCode: string;
  private peer: Peer;
  private sim: HostSim;
  private clients = new Map<DataConnection, string>(); // conn -> player id
  private timer: number;
  private sendCounter = 0;
  private pendingEvents: SimEvent[] = [];
  private discHandlers: DisconnectHandler[] = [];
  private dead = false;

  constructor(peer: Peer, code: string, hostName: string) {
    this.peer = peer;
    this.roomCode = code;
    const world = createWorld();
    addPlayer(world, this.myId, hostName);
    this.sim = new HostSim(world);

    peer.on('connection', (conn) => this.accept(conn));
    peer.on('disconnected', () => {
      // Broker blip — try to come back so the room code stays claimable.
      if (!this.dead) peer.reconnect();
    });
    peer.on('close', () => this.fail('Host connection closed'));
    peer.on('error', (err) => {
      console.warn('[p2p host]', err);
    });

    this.timer = window.setInterval(() => this.step(), 1000 * DT);
  }

  private get world(): WorldState {
    return this.sim.world;
  }

  private accept(conn: DataConnection) {
    let sid: string | null = null;
    let joined = false;

    const join = (name: string) => {
      if (joined || this.dead) return;
      if (this.clients.size + 1 >= MAX_PLAYERS) {
        safeSend(conn, { type: 'full', reason: 'Room is full (4 miners max)' });
        window.setTimeout(() => conn.close(), 200);
        return;
      }
      const id = this.allocId();
      if (!id) {
        conn.close();
        return;
      }
      joined = true;
      sid = id;
      this.clients.set(conn, id);
      addPlayer(this.world, id, (name || 'Miner').slice(0, 16));
      safeSend(conn, { type: 'welcome', id, roomCode: this.roomCode });
    };

    conn.on('data', (data) => {
      const msg = data as WireMsg;
      if (!msg || typeof msg.type !== 'string') return;
      if (!joined && msg.type === 'hello') {
        join(msg.name);
        return;
      }
      if (joined && sid) this.onClientData(sid, data);
    });
    conn.on('close', () => this.dropClient(conn));
    conn.on('error', () => this.dropClient(conn));

    conn.on('open', () => {
      if (this.dead) {
        conn.close();
        return;
      }
      // If the guest never greets, still seat them after a short beat.
      window.setTimeout(() => join('Miner'), 800);
    });
  }

  private allocId(): string | null {
    const used = new Set(this.clients.values());
    used.add(this.myId);
    for (let i = 2; i <= MAX_PLAYERS; i++) {
      const id = `p${i}`;
      if (!used.has(id)) return id;
    }
    return null;
  }

  private onClientData(sid: string, data: unknown) {
    const msg = data as WireMsg;
    if (!msg || msg.type !== 'intent' || !msg.intent || typeof msg.intent.type !== 'string') return;
    this.sim.applyIntent(sid, msg.intent, { clamp: true });
  }

  private dropClient(conn: DataConnection) {
    const id = this.clients.get(conn);
    if (!id) return;
    this.clients.delete(conn);
    this.sim.clearInput(id);
    removePlayer(this.world, id);
    try {
      conn.close();
    } catch {
      /* ignore */
    }
  }

  private step() {
    if (this.dead) return;
    if ((window as any).__mdPaused) return;

    const { snap, ev } = this.sim.step();
    if (ev.length) this.pendingEvents.push(...ev);
    this.sendCounter++;

    // Host paints every tick; guests get a 10 Hz snapshot with batched events.
    if (this.sendCounter % 2 === 0) {
      const outEv = this.pendingEvents;
      this.pendingEvents = [];
      const remoteSnap = { type: 'snap' as const, w: snap, ev: outEv };
      for (const conn of this.clients.keys()) safeSend(conn, remoteSnap);
    }
  }

  send(intent: Intent): void {
    this.sim.applyIntent(this.myId, intent, { clamp: true });
  }

  onSnapshot(cb: SnapshotHandler): void {
    this.sim.onSnapshot(cb);
  }

  whenDisconnected(cb: DisconnectHandler): void {
    this.discHandlers.push(cb);
  }

  private fail(reason: string) {
    if (this.dead) return;
    this.dead = true;
    for (const h of this.discHandlers) h(reason);
  }

  dispose(): void {
    this.dead = true;
    window.clearInterval(this.timer);
    this.sim.clearHandlers();
    this.discHandlers = [];
    for (const conn of [...this.clients.keys()]) {
      try {
        conn.close();
      } catch {
        /* ignore */
      }
    }
    this.clients.clear();
    try {
      this.peer.destroy();
    } catch {
      /* ignore */
    }
  }
}

// ------------------------------------------------------------------ guest

class GuestTransport implements P2PTransport {
  myId = '';
  roomCode: string;
  private peer: Peer;
  private conn: DataConnection;
  private handlers: SnapshotHandler[] = [];
  private discHandlers: DisconnectHandler[] = [];
  private dead = false;

  private constructor(peer: Peer, conn: DataConnection, roomCode: string, myId: string) {
    this.peer = peer;
    this.conn = conn;
    this.roomCode = roomCode;
    this.myId = myId;

    conn.on('data', (data) => {
      const msg = data as WireMsg;
      if (!msg || typeof msg.type !== 'string') return;
      if (msg.type === 'snap') {
        for (const h of this.handlers) h(msg.w, msg.ev ?? []);
      } else if (msg.type === 'full') {
        this.fail(msg.reason || 'Room is full');
      }
    });
    conn.on('close', () => this.fail('Host left the expedition'));
    conn.on('error', () => this.fail('Lost connection to host'));
    peer.on('error', (err) => console.warn('[p2p guest]', err));
  }

  static connect(code: string, name: string): Promise<GuestTransport> {
    const roomCode = normalizeCode(code);
    if (!roomCode) return Promise.reject(new Error('Enter a 4-digit room code'));

    return (async () => {
      const peer = await openPeer();
      const conn = peer.connect(peerIdFor(roomCode), { reliable: true });

      try {
        await waitConnOpen(conn, JOIN_TIMEOUT_MS);
      } catch {
        peer.destroy();
        throw new Error(
          'Could not reach that room — check the code and that the host is still in-game',
        );
      }

      safeSend(conn, { type: 'hello', name: (name || 'Miner').slice(0, 16) });

      const welcome = await waitWelcome(conn, JOIN_TIMEOUT_MS).catch((err) => {
        peer.destroy();
        throw err;
      });

      return new GuestTransport(peer, conn, welcome.roomCode || roomCode, welcome.id);
    })();
  }

  send(intent: Intent): void {
    if (this.dead || !this.conn.open) return;
    safeSend(this.conn, { type: 'intent', intent });
  }

  onSnapshot(cb: SnapshotHandler): void {
    this.handlers.push(cb);
  }

  whenDisconnected(cb: DisconnectHandler): void {
    this.discHandlers.push(cb);
  }

  private fail(reason: string) {
    if (this.dead) return;
    this.dead = true;
    for (const h of this.discHandlers) h(reason);
  }

  dispose(): void {
    this.dead = true;
    this.handlers = [];
    this.discHandlers = [];
    try {
      this.conn.close();
    } catch {
      /* ignore */
    }
    try {
      this.peer.destroy();
    } catch {
      /* ignore */
    }
  }
}

function waitWelcome(
  conn: DataConnection,
  ms: number,
): Promise<{ id: string; roomCode: string }> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error('Host did not answer — room may be full or offline'));
    }, ms);

    const onData = (data: unknown) => {
      const msg = data as WireMsg;
      if (!msg) return;
      if (msg.type === 'welcome') {
        cleanup();
        resolve({ id: msg.id, roomCode: msg.roomCode });
      } else if (msg.type === 'full') {
        cleanup();
        reject(new Error(msg.reason || 'Room is full'));
      }
    };
    const onClose = () => {
      cleanup();
      reject(new Error('Connection closed before join finished'));
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      conn.off('data', onData);
      conn.off('close', onClose);
    };
    conn.on('data', onData);
    conn.on('close', onClose);
  });
}

function safeSend(conn: DataConnection, msg: WireMsg) {
  if (!conn.open) return;
  try {
    conn.send(msg);
  } catch (err) {
    console.warn('[p2p send]', err);
  }
}

/** Host a co-op session. Returns once the 4-digit room code is claimed on PeerJS. */
export async function hostGame(name: string): Promise<P2PTransport> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 28; attempt++) {
    const code = randomCode();
    try {
      const peer = await openPeer(peerIdFor(code));
      return new HostTransport(peer, code, name.slice(0, 16) || 'Miner');
    } catch (err) {
      lastErr = err;
      // unavailable-id → try another code; anything else may be a broker outage
      const errType = String((err as { type?: string })?.type ?? '');
      const errMsg = String((err as Error)?.message ?? err);
      if (!/unavailable/i.test(errType) && !/unavailable/i.test(errMsg) && attempt > 4) break;
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error('Could not claim a room code — try again in a moment');
}

/** Join an existing host by 4-digit room code. */
export async function joinGame(code: string, name: string): Promise<P2PTransport> {
  return GuestTransport.connect(code, name);
}

export { normalizeCode };
