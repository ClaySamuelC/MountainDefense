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
import { writeSave } from './save';

const AUTOSAVE_EVERY_MS = 20_000;

/** Solo mode: run the authoritative sim locally at the same tick rate. */
export class LocalTransport implements Transport {
  readonly myId: string;
  readonly roomCode = null;
  private world: WorldState;
  private inputs = new Map<string, PlayerInput>();
  private queue: QueuedIntent[] = [];
  private handlers: SnapshotHandler[] = [];
  private timer: number;
  private lastAutosave = performance.now();
  /** Fresh expedition (not continued from a save) — drives the intro tip. */
  readonly isFresh: boolean;

  constructor(saved?: WorldState) {
    if (saved) {
      this.world = saved;
      this.myId = saved.players[0]?.id ?? 'p1';
      this.isFresh = false;
      // Drop any mid-ride that would desync without live input.
      for (const p of this.world.players) {
        p.working = false;
        p.workT = 0;
        p.beatHit = false;
      }
    } else {
      this.world = createWorld();
      this.myId = 'p1';
      this.isFresh = true;
      addPlayer(this.world, this.myId, 'Miner');
    }

    this.timer = window.setInterval(() => this.step(), 1000 * DT);

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
        const p = this.world.players.find((pl) => pl.id === this.myId) ?? this.world.players[0];
        p.x = x;
        p.z = z;
      },
      save: () => this.save(),
    };
  }

  /** Authoritative world reference for save/load. */
  getWorld(): WorldState {
    return this.world;
  }

  save(): ReturnType<typeof writeSave> {
    const blob = writeSave(this.world);
    this.lastAutosave = performance.now();
    return blob;
  }

  private step() {
    if ((window as any).__mdPaused) return;
    const ev = tickWorld(this.world, this.inputs, this.queue);
    const snap = structuredClone(this.world);
    for (const h of this.handlers) h(snap, ev);

    if (!this.world.gameOver && performance.now() - this.lastAutosave > AUTOSAVE_EVERY_MS) {
      try {
        this.save();
      } catch (err) {
        console.warn('[autosave]', err);
      }
    }
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
    // Best-effort save on leave so Continue stays current.
    if (!this.world.gameOver) {
      try {
        this.save();
      } catch {
        /* ignore */
      }
    }
    window.clearInterval(this.timer);
    this.handlers = [];
    delete (window as any).__dbg;
  }
}
