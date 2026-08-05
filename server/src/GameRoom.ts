import { Room, type Client } from '@colyseus/core';
import {
  addPlayer,
  createWorld,
  removePlayer,
  tickWorld,
  DT,
  type Intent,
  type PlayerInput,
  type QueuedIntent,
  type SimEvent,
  type WorldState,
} from '../../shared/src/index';

export class GameRoom extends Room {
  maxClients = 4;
  world: WorldState = createWorld();
  inputs = new Map<string, PlayerInput>();
  queue: QueuedIntent[] = [];
  pendingEvents: SimEvent[] = [];
  sendCounter = 0;

  onCreate() {
    this.setPrivate(true);

    this.onMessage('intent', (client: Client, intent: Intent) => {
      if (!intent || typeof intent.type !== 'string') return;
      if (intent.type === 'input') {
        this.inputs.set(client.sessionId, {
          mx: clampNum(intent.mx),
          mz: clampNum(intent.mz),
          hold: !!intent.hold,
        });
      } else {
        if (this.queue.length < 256) {
          this.queue.push({ sid: client.sessionId, intent });
        }
      }
    });

    this.setSimulationInterval(() => this.step(), 1000 * DT);
  }

  step() {
    const ev = tickWorld(this.world, this.inputs, this.queue);
    if (ev.length) this.pendingEvents.push(...ev);
    this.sendCounter++;
    if (this.sendCounter % 2 === 0) {
      this.broadcast('snap', { w: this.world, ev: this.pendingEvents });
      this.pendingEvents = [];
    }
  }

  onJoin(client: Client, options: { name?: string }) {
    const name = (options?.name || 'Miner').slice(0, 16);
    addPlayer(this.world, client.sessionId, name);
    client.send('welcome', { id: client.sessionId, roomId: this.roomId });
  }

  onLeave(client: Client) {
    removePlayer(this.world, client.sessionId);
    this.inputs.delete(client.sessionId);
  }
}

function clampNum(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return Math.min(1, Math.max(-1, v));
}
