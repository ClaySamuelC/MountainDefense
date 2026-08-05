import type { Intent, SimEvent, WorldState } from '@shared';

export type SnapshotHandler = (w: WorldState, ev: SimEvent[]) => void;

export interface Transport {
  readonly myId: string;
  readonly roomCode: string | null;
  send(intent: Intent): void;
  onSnapshot(cb: SnapshotHandler): void;
  dispose(): void;
}
