import type { Cost, ResourceId, WorldState } from './types';
import { CART_CAP_BASE, CART_CAP_UP } from './constants';

export function cartCap(w: WorldState): number {
  return w.techs.cartCapacity.unlocked ? CART_CAP_UP : CART_CAP_BASE;
}

export function addRes(
  bag: Partial<Record<ResourceId, number>>,
  res: ResourceId,
  amount: number,
): void {
  bag[res] = (bag[res] ?? 0) + amount;
  if (bag[res]! <= 1e-9) delete bag[res];
}

/** Order in which 'crude' costs are paid. Stone first, raw ore as fallback. */
const CRUDE_ORDER: ResourceId[] = ['stone', 'ironOre', 'copperOre'];

/** Units available for 'crude' costs (stone always, raw ore only if spendOre). */
export function crudeStock(w: WorldState): number {
  if (w.spendOre) {
    return w.stockpile.stone + w.stockpile.ironOre + w.stockpile.copperOre;
  }
  return w.stockpile.stone;
}

/** Consume `amount` crude units, stone first. Caller must check crudeStock. */
export function payCrude(w: WorldState, amount: number): void {
  for (const res of CRUDE_ORDER) {
    if (amount <= 0) break;
    if (res !== 'stone' && !w.spendOre) continue;
    const take = Math.min(w.stockpile[res], amount);
    w.stockpile[res] -= take;
    amount -= take;
  }
}

export function canAfford(w: WorldState, cost: Cost): boolean {
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

export function pay(w: WorldState, cost: Cost): void {
  for (const [res, amt] of Object.entries(cost)) {
    if (!amt) continue;
    if (res === 'crude') payCrude(w, amt);
    else w.stockpile[res as ResourceId] -= amt;
  }
}
