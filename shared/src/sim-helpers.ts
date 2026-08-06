import type { Cost, ResourceId, WorldState } from './types';
import { stat } from './constants';

export function cartCap(w: WorldState): number {
  return stat(w, 'cartCap');
}

export function addRes(
  bag: Partial<Record<ResourceId, number>>,
  res: ResourceId,
  amount: number,
): void {
  bag[res] = (bag[res] ?? 0) + amount;
  if (bag[res]! <= 1e-9) delete bag[res];
}

/** 'crude' costs are paid in stone only — raw ore is for refining. */
export function crudeStock(w: WorldState): number {
  return w.stockpile.stone;
}

/** Consume `amount` stone. Caller must check crudeStock. */
export function payCrude(w: WorldState, amount: number): void {
  w.stockpile.stone = Math.max(0, w.stockpile.stone - amount);
}

export function canAfford(w: WorldState, cost: Cost | Partial<Record<string, number>>): boolean {
  for (const [res, amt] of Object.entries(cost)) {
    if (!amt) continue;
    if (res === 'crude') {
      if (crudeStock(w) < amt) return false;
    } else if (w.stockpile[res as ResourceId] < amt) {
      return false;
    }
  }
  return true;
}

export function pay(w: WorldState, cost: Cost | Partial<Record<string, number>>): void {
  for (const [res, amt] of Object.entries(cost)) {
    if (!amt) continue;
    if (res === 'crude') payCrude(w, amt);
    else w.stockpile[res as ResourceId] -= amt;
  }
}
