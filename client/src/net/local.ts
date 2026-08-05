import {
  addPlayer,
  createWorld,
  tickWorld,
  DT,
  type Intent,
  type PlayerInput,
  type QueuedIntent,
  type ResourceId,
  type WorldState,
} from '@shared';
import type { SnapshotHandler, Transport } from './transport';

/** Solo mode: run the authoritative sim locally at the same tick rate. */
export class LocalTransport implements Transport {
  readonly myId = 'p1';
  readonly roomCode = null;
  private world: WorldState;
  private inputs = new Map<string, PlayerInput>();
  private queue: QueuedIntent[] = [];
  private handlers: SnapshotHandler[] = [];
  private timer: number;

  constructor() {
    this.world = createWorld();
    addPlayer(this.world, this.myId, 'Miner');
    this.timer = window.setInterval(() => this.step(), 1000 * DT);

    // Dev helpers, handy for testing/balancing.
    (window as any).__dbg = {
      world: () => this.world,
      night: () => {
        this.world.phase = 'day';
        this.world.phaseT = 0.999;
      },
      give: (res: ResourceId, n = 10) => {
        this.world.stockpile[res] += n;
      },
      teleport: (x: number, z: number) => {
        const p = this.world.players[0];
        p.x = x;
        p.z = z;
      },
    };
  }

  private step() {
    // Solo pause freezes the sim; the renderer still paints the last snap.
    if ((window as any).__mdPaused) return;
    const ev = tickWorld(this.world, this.inputs, this.queue);
    const snap = structuredClone(this.world);
    for (const h of this.handlers) h(snap, ev);
  }

  send(intent: Intent): void {
    if (intent.type === 'input') {
      this.inputs.set(this.myId, { mx: intent.mx, mz: intent.mz, hold: intent.hold });
    } else {
      this.queue.push({ sid: this.myId, intent });
    }
  }

  onSnapshot(cb: SnapshotHandler): void {
    this.handlers.push(cb);
  }

  dispose(): void {
    window.clearInterval(this.timer);
    this.handlers = [];
    delete (window as any).__dbg;
  }
}
