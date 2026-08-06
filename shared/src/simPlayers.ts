import type {
  EnemyState,
  PlayerInput,
  PlayerState,
  ResourceId,
  SimEvent,
  WorldState,
} from './types';
import {
  ANVIL_STONE_CHANCE,
  BEAT_MISS_PENALTY,
  BREAK_TIME,
  CARRY_CAP,
  CART_SPACING,
  DT,
  FORGE_TEND_TIME,
  FURNACE_CAP,
  FURNACE_CHARGE,
  GATE_REBUILD_COST,
  MAP_HALF,
  MELEE_CD,
  MELEE_DMG,
  MELEE_RANGE,
  MINE_TIME,
  PLAYER_SPEED,
  REACH_CART,
  REPAIR_ORE_PER_HP,
  REPAIR_RATE,
  VEIN_YIELDS,
  WALL_REBUILD_COST,
  WALL_REBUILD_TIME,
  findRecipe,
  recipeUnlocked,
  stationRecipeId,
  stat,
} from './constants';
import { railPosAt } from './rail';
import { getContext, hasInputs } from './context';
import type { WorkContext } from './context';
import { addRes, canAfford, cartCap, crudeStock, pay, payCrude } from './sim-helpers';
import { spawnVein } from './world';
import { isRidgeBlocked } from './terrain';
import { killEnemy } from './simCombat';
import { pumpForge, unloadOne } from './simIndustry';

const IDLE: PlayerInput = { mx: 0, mz: 0, hold: false };

/** Roll what one swing at a vein actually yields. */
export function rollVeinYield(kind: string): ResourceId {
  const y = VEIN_YIELDS[kind as keyof typeof VEIN_YIELDS];
  const r = Math.random();
  if (r < y.primaryChance) return y.primary;
  if (r < y.primaryChance + y.stoneChance || y.strays.length === 0) return 'stone';
  return y.strays[Math.floor(Math.random() * y.strays.length)];
}

/**
 * Finish a timed swing. Awards the action result, then applies / clears the
 * miss penalty for the *next* swing based on whether the beat was hit.
 */
function finishSwing(
  w: WorldState,
  p: PlayerState,
  ctx: Extract<WorkContext, { kind: 'mine' | 'anvil' | 'forge' }>,
  ev: SimEvent[],
  apply: () => boolean,
) {
  const ok = apply();
  if (!ok) {
    p.workT = 0;
    return;
  }
  const kind = ctx.kind;
  if (p.beatHit) {
    p.beatPenalty = 1;
  } else {
    p.beatPenalty = BEAT_MISS_PENALTY;
    p.beatMiss++;
    ev.push({ type: 'beatMiss', pid: p.id, x: p.x, z: p.z, kind });
  }
  p.beatHit = false;
  p.workT = 0;
  ev.push({ type: 'workDone', pid: p.id, x: p.x, z: p.z });
}

/** Auto-swing the pick at the nearest enemy in range. No button needed. */
export function tryAutoMelee(w: WorldState, p: PlayerState, ev: SimEvent[]) {
  if (p.atkCd > 0 || p.riding) return;
  let best: EnemyState | null = null;
  let bd = MELEE_RANGE;
  for (const e of w.enemies) {
    const d = Math.hypot(p.x - e.x, p.z - e.z);
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  if (!best) return;
  p.atkCd = MELEE_CD;
  p.swung++;
  best.hp -= MELEE_DMG;
  ev.push({ type: 'hit', x: best.x, z: best.z });
  if (best.hp <= 0) killEnemy(w, best, ev);
}

/**
 * Walking over the cart dumps the pack into it — no hold-E needed, as long as
 * the cart still has room.
 */
function tryAutoLoadCart(w: WorldState, p: PlayerState, ev: SimEvent[]) {
  if (p.riding || p.carryTotal <= 0) return;
  for (const c of w.carts) {
    const front = railPosAt(c.s);
    const back = railPosAt(Math.max(0, c.s - CART_SPACING));
    const d = Math.min(
      Math.hypot(p.x - front.x, p.z - front.z),
      Math.hypot(p.x - back.x, p.z - back.z),
    );
    if (d >= REACH_CART) continue;
    let moved = false;
    while (c.loadTotal < cartCap(w) && p.carryTotal > 0) {
      const res = Object.keys(p.carry)[0] as ResourceId | undefined;
      if (!res) break;
      addRes(p.carry, res, -1);
      p.carryTotal--;
      addRes(c.load, res, 1);
      c.loadTotal++;
      moved = true;
    }
    if (moved) {
      ev.push({ type: 'workDone', pid: p.id, x: p.x, z: p.z });
      return;
    }
  }
}

export function tickPlayers(w: WorldState, inputs: Map<string, PlayerInput>, ev: SimEvent[]) {
  for (const p of w.players) {
    const input = inputs.get(p.id) ?? IDLE;
    p.atkCd = Math.max(0, p.atkCd - DT);
    p.gunCd = Math.max(0, p.gunCd - DT);

    if (p.riding) {
      p.working = false;
      continue; // position handled in tickCarts
    }

    // Movement
    let mx = input.mx;
    let mz = input.mz;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) {
      mx /= ml;
      mz /= ml;
    }
    if (ml > 0.05) {
      const speed = PLAYER_SPEED * (1 - 0.25 * (p.carryTotal / CARRY_CAP));
      const nx = Math.min(MAP_HALF - 2, Math.max(-MAP_HALF + 2, p.x + mx * speed * DT));
      const nz = Math.min(MAP_HALF - 2, Math.max(-MAP_HALF + 2, p.z + mz * speed * DT));
      // No climbing the gate flanks — the wall is the only way through.
      if (!isRidgeBlocked(nx, nz)) {
        p.x = nx;
        p.z = nz;
      } else if (!isRidgeBlocked(nx, p.z)) {
        p.x = nx;
      } else if (!isRidgeBlocked(p.x, nz)) {
        p.z = nz;
      }
      p.heading = Math.atan2(mx, mz);
    }

    // Walk-over dump: pack empties into the cart as soon as you brush it.
    tryAutoLoadCart(w, p, ev);
    // Auto-swing the pick whenever something hostile is in reach.
    tryAutoMelee(w, p, ev);

    // Work (hold E)
    const ctx = input.hold ? getContext(w, p) : null;
    if (!ctx) {
      p.working = false;
      p.ctxKey = '';
      p.workT = 0;
      p.beatHit = false;
      continue;
    }
    p.working = true;
    const key = JSON.stringify(ctx);
    if (key !== p.ctxKey) {
      p.ctxKey = key;
      p.workT = 0;
      p.beatHit = false;
    }

    const mineSpeed = stat(w, 'mineWorkSpeed') / Math.max(1, p.beatPenalty);
    const anvilSpeed = stat(w, 'anvilWorkSpeed') / Math.max(1, p.beatPenalty);

    switch (ctx.kind) {
      case 'mine': {
        p.workT += DT * mineSpeed;
        if (p.workT >= MINE_TIME) {
          finishSwing(w, p, ctx, ev, () => {
            const node = w.nodes.find((nd) => nd.id === ctx.nodeId);
            if (!node || node.amount <= 0 || p.carryTotal >= CARRY_CAP) return false;
            node.amount--;
            addRes(p.carry, rollVeinYield(node.kind), 1);
            p.carryTotal++;
            if (node.amount <= 0) {
              w.nodes = w.nodes.filter((nd) => nd !== node);
              const fresh = spawnVein(w);
              if (fresh) ev.push({ type: 'veinFound', ...fresh });
            }
            return true;
          });
        }
        break;
      }
      case 'loadCart': {
        const cart = w.carts.find((c) => c.id === ctx.cartId);
        let moved = false;
        while (cart && cart.loadTotal < cartCap(w) && p.carryTotal > 0) {
          const res = Object.keys(p.carry)[0] as ResourceId | undefined;
          if (!res) break;
          addRes(p.carry, res, -1);
          p.carryTotal--;
          addRes(cart.load, res, 1);
          cart.loadTotal++;
          moved = true;
        }
        if (moved) ev.push({ type: 'workDone', pid: p.id, x: p.x, z: p.z });
        break;
      }
      case 'unloadCart': {
        const cart = w.carts.find((c) => c.id === ctx.cartId);
        let moved = false;
        while (cart && cart.loadTotal > 0) {
          unloadOne(w, cart);
          moved = true;
        }
        if (moved) ev.push({ type: 'workDone', pid: p.id, x: p.x, z: p.z });
        break;
      }
      case 'anvil': {
        if (!ctx.ready) break;
        p.workT += DT * anvilSpeed;
        if (p.workT >= BREAK_TIME) {
          const anvil = w.buildings.find((b) => b.type === 'anvil');
          finishSwing(w, p, ctx, ev, () => {
            const recipe = findRecipe('anvil', ctx.recipe);
            const rid = stationRecipeId('anvil', ctx.recipe);
            if (rid && !recipeUnlocked(w, rid)) return false;
            if (!hasInputs(w, recipe.inputs)) return false;
            pay(w, recipe.inputs);
            w.stockpile[recipe.out]++;
            if (Math.random() < ANVIL_STONE_CHANCE) w.stockpile.stone++;
            if (anvil) ev.push({ type: 'smelted', x: anvil.x, z: anvil.z, res: recipe.out });
            return true;
          });
        }
        break;
      }
      case 'forge': {
        if (!ctx.ready) break;
        // Each beat cycle pumps the bellows a little further into the melt.
        p.workT += DT / Math.max(1, p.beatPenalty);
        if (p.workT >= FORGE_TEND_TIME) {
          finishSwing(w, p, ctx, ev, () => pumpForge(w, ctx.recipe, 1.15, ev));
        }
        break;
      }
      case 'furnace': {
        if (!ctx.ready) break;
        const furnace = w.buildings.find((b) => b.id === ctx.buildingId);
        let loaded = false;
        while (furnace && furnace.charges < FURNACE_CAP && hasInputs(w, FURNACE_CHARGE)) {
          pay(w, FURNACE_CHARGE);
          furnace.charges++;
          loaded = true;
        }
        if (loaded && furnace) {
          ev.push({ type: 'charged', x: furnace.x, z: furnace.z });
          ev.push({ type: 'workDone', pid: p.id, x: p.x, z: p.z });
        }
        break;
      }
      case 'repair': {
        const b = w.buildings.find((bb) => bb.id === ctx.buildingId);
        if (b && b.hp > 0 && b.hp < b.maxHp) {
          const costMul = stat(w, 'repairCost');
          const hpGain = Math.min(REPAIR_RATE * DT, b.maxHp - b.hp);
          const cost = hpGain * REPAIR_ORE_PER_HP * costMul;
          if (crudeStock(w) >= cost) {
            payCrude(w, cost);
            b.hp += hpGain;
            if (b.hp >= b.maxHp) ev.push({ type: 'workDone', pid: p.id, x: p.x, z: p.z });
          }
        }
        break;
      }
      case 'rebuild': {
        if (!ctx.ready) break;
        const b = w.buildings.find((bb) => bb.id === ctx.buildingId);
        if (!b || b.hp > 0) break;
        if (b.buildProgress <= 0) {
          const cost = b.type === 'gate' ? GATE_REBUILD_COST : WALL_REBUILD_COST;
          if (!canAfford(w, cost)) break;
          pay(w, cost);
        }
        b.buildProgress = Math.min(1, b.buildProgress + DT / WALL_REBUILD_TIME);
        if (b.buildProgress >= 1) {
          b.buildProgress = 0;
          b.hp = b.maxHp;
          ev.push({ type: 'built', x: b.x, z: b.z });
          ev.push({ type: 'workDone', pid: p.id, x: p.x, z: p.z });
        }
        break;
      }
      case 'deposit': {
        let moved = false;
        while (p.carryTotal > 0) {
          const res = Object.keys(p.carry)[0] as ResourceId | undefined;
          if (!res) break;
          addRes(p.carry, res, -1);
          p.carryTotal--;
          w.stockpile[res]++;
          moved = true;
        }
        if (moved) ev.push({ type: 'workDone', pid: p.id, x: p.x, z: p.z });
        break;
      }
    }
  }
}
