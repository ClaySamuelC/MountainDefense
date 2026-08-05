import { Client, Room } from 'colyseus.js';
import type { Intent, SimEvent, WorldState } from '@shared';
import type { SnapshotHandler, Transport } from './transport';

const SERVER_URL = (import.meta as any).env?.VITE_SERVER_URL ?? 'ws://localhost:2567';

class RemoteTransport implements Transport {
  readonly myId: string;
  readonly roomCode: string;
  private handlers: SnapshotHandler[] = [];

  constructor(private room: Room) {
    this.myId = room.sessionId;
    this.roomCode = room.roomId;
    room.onMessage('snap', (msg: { w: WorldState; ev: SimEvent[] }) => {
      for (const h of this.handlers) h(msg.w, msg.ev ?? []);
    });
    room.onMessage('welcome', () => {});
  }

  send(intent: Intent): void {
    this.room.send('intent', intent);
  }

  onSnapshot(cb: SnapshotHandler): void {
    this.handlers.push(cb);
  }

  dispose(): void {
    this.handlers = [];
    this.room.leave().catch(() => {});
  }
}

export async function hostGame(name: string): Promise<Transport> {
  const client = new Client(SERVER_URL);
  const room = await client.create('game', { name });
  return new RemoteTransport(room);
}

export async function joinGame(code: string, name: string): Promise<Transport> {
  const client = new Client(SERVER_URL);
  const room = await client.joinById(code.trim(), { name });
  return new RemoteTransport(room);
}
