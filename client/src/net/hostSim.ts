import {
  tickWorld,
  type Intent,
  type PlayerInput,
  type QueuedIntent,
  type SimEvent,
  type WorldState,
} from '@shared';
import type { SnapshotHandler } from './transport';

const QUEUE_CAP = 256;

function clampAxis(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return Math.min(1, Math.max(-1, v));
}

/**
 * Authoritative sim step shared by solo (`LocalTransport`) and co-op host (`HostTransport`).
 * Owns inputs, the intent queue, and snapshot fan-out to local handlers.
 */
export class HostSim {
  readonly world: WorldState;
  private inputs = new Map<string, PlayerInput>();
  private queue: QueuedIntent[] = [];
  private handlers: SnapshotHandler[] = [];

  constructor(world: WorldState) {
    this.world = world;
  }

  onSnapshot(cb: SnapshotHandler): void {
    this.handlers.push(cb);
  }

  clearHandlers(): void {
    this.handlers = [];
  }

  /** Apply a player intent (local host or remote guest). */
  applyIntent(sid: string, intent: Intent, opts?: { clamp?: boolean }): void {
    const clamp = opts?.clamp ?? false;
    if (intent.type === 'input') {
      this.inputs.set(sid, {
        mx: clamp ? clampAxis(intent.mx) : intent.mx,
        mz: clamp ? clampAxis(intent.mz) : intent.mz,
        hold: !!intent.hold,
      });
      return;
    }
    if (this.queue.length < QUEUE_CAP) {
      this.queue.push({ sid, intent });
    }
  }

  clearInput(sid: string): void {
    this.inputs.delete(sid);
  }

  /** One sim tick. Returns events + a cloned snapshot for render / network. */
  step(): { snap: WorldState; ev: SimEvent[] } {
    const ev = tickWorld(this.world, this.inputs, this.queue);
    const snap = structuredClone(this.world);
    for (const h of this.handlers) h(snap, ev);
    return { snap, ev };
  }
}

export { clampAxis };
