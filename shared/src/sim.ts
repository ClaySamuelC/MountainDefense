import type { PlayerInput, QueuedIntent, SimEvent, WorldState } from './types';
import { DT } from './constants';
import { handleQueued } from './simIntents';
import { tickPhase, tickSpawns } from './simPhase';
import { tickPlayers } from './simPlayers';
import { tickCarts, tickForge, tickFurnaces, tickResearch } from './simIndustry';
import { tickEnemies, tickProjectiles, tickTowers } from './simCombat';

export { advancement } from './simPhase';

export function tickWorld(
  w: WorldState,
  inputs: Map<string, PlayerInput>,
  queued: QueuedIntent[],
): SimEvent[] {
  const ev: SimEvent[] = [];
  if (w.gameOver) {
    w.tick++;
    return ev;
  }

  handleQueued(w, queued, ev);
  tickPhase(w, ev);
  tickPlayers(w, inputs, ev);
  tickCarts(w, inputs, ev);
  tickForge(w, ev);
  tickFurnaces(w, ev);
  tickResearch(w, ev);
  tickSpawns(w);
  tickEnemies(w, ev);
  tickTowers(w);
  tickProjectiles(w, ev);

  w.tick++;
  w.time += DT;
  return ev;
}
