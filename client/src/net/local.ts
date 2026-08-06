import { addPlayer, createWorld, DT, type Intent, type ResourceId, type WorldState } from '@shared';
import type { SnapshotHandler, Transport } from './transport';
import { HostSim } from './hostSim';
import { writeSave } from './save';

const AUTOSAVE_EVERY_MS = 20_000;

/** Solo mode: run the authoritative sim locally at the same tick rate. */
export class LocalTransport implements Transport {
  readonly myId: string;
  readonly roomCode = null;
  private sim: HostSim;
  private timer: number;
  private lastAutosave = performance.now();
  /** Fresh expedition (not continued from a save) — drives the intro tip. */
  readonly isFresh: boolean;

  constructor(saved?: WorldState) {
    let world: WorldState;
    if (saved) {
      world = saved;
      this.myId = saved.players[0]?.id ?? 'p1';
      this.isFresh = false;
      for (const p of world.players) {
        p.working = false;
        p.workT = 0;
        p.beatHit = false;
      }
    } else {
      world = createWorld();
      this.myId = 'p1';
      this.isFresh = true;
      addPlayer(world, this.myId, 'Miner');
    }

    // Prefer persisted debug preference for fresh runs; keeps continue-from-save as saved.
    if (this.isFresh) {
      try {
        world.debug = localStorage.getItem('md-debug') === '1';
      } catch {
        world.debug = false;
      }
    }

    this.sim = new HostSim(world);
    this.timer = window.setInterval(() => this.step(), 1000 * DT);

    (window as any).__dbg = {
      world: () => this.sim.world,
      night: () => {
        this.sim.world.phase = 'day';
        this.sim.world.phaseT = 0.999;
      },
      give: (res: ResourceId, n = 10) => {
        this.sim.world.stockpile[res] += n;
      },
      teleport: (x: number, z: number) => {
        const p = this.sim.world.players.find((pl) => pl.id === this.myId) ?? this.sim.world.players[0];
        p.x = x;
        p.z = z;
      },
      debug: (on = true) => {
        this.sim.world.debug = !!on;
        try {
          localStorage.setItem('md-debug', on ? '1' : '0');
        } catch {
          /* ignore */
        }
      },
      save: () => this.save(),
    };
  }

  getWorld(): WorldState {
    return this.sim.world;
  }

  save(): ReturnType<typeof writeSave> {
    const blob = writeSave(this.sim.world);
    this.lastAutosave = performance.now();
    return blob;
  }

  private step() {
    if ((window as any).__mdPaused) return;
    this.sim.step();

    if (!this.sim.world.gameOver && performance.now() - this.lastAutosave > AUTOSAVE_EVERY_MS) {
      try {
        this.save();
      } catch (err) {
        console.warn('[autosave]', err);
      }
    }
  }

  send(intent: Intent): void {
    this.sim.applyIntent(this.myId, intent);
  }

  onSnapshot(cb: SnapshotHandler): void {
    this.sim.onSnapshot(cb);
  }

  dispose(): void {
    if (!this.sim.world.gameOver) {
      try {
        this.save();
      } catch {
        /* ignore */
      }
    }
    window.clearInterval(this.timer);
    this.sim.clearHandlers();
    delete (window as any).__dbg;
  }
}
