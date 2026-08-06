import type {
  BuildingState,
  CartState,
  PlayerInput,
  ResourceId,
  SimEvent,
  WorldState,
} from './types';
import {
  CART_LOCO_PUSH,
  CART_PUSH,
  CART_S_MIN,
  DT,
  REACH_FORGE,
  SMELT_STONE_CHANCE,
  SMELT_TIME,
  TECHS,
  findRecipe,
  furnaceLevel,
} from './constants';
import { RAIL_LENGTH, railGradeAt, railPosAt, railTangentAt } from './rail';
import { cartDocked, hasInputs } from './context';
import { addRes, pay } from './sim-helpers';

const IDLE: PlayerInput = { mx: 0, mz: 0, hold: false };

export function tickCarts(w: WorldState, inputs: Map<string, PlayerInput>, ev?: SimEvent[]) {
  const loco = w.techs.locomotive.unlocked;
  for (const c of w.carts) {
    let push = 0;
    const rider = c.riderId ? w.players.find((p) => p.id === c.riderId) : null;

    if (rider) {
      const input = inputs.get(rider.id) ?? IDLE;
      const tan = railTangentAt(c.s);
      const dot = input.mx * tan.x + input.mz * tan.z;
      push = dot * (loco ? CART_LOCO_PUSH : CART_PUSH);
    } else if (loco) {
      const target = c.loadTotal > 0 ? RAIL_LENGTH : CART_S_MIN;
      const delta = target - c.s;
      if (Math.abs(delta) > 2) push = Math.sign(delta) * CART_LOCO_PUSH * 0.8;
      else c.v *= 0.8;
    }

    const grade = railGradeAt(c.s);
    const massF = 1 + (c.loadTotal / 12) * 1.2 + (rider ? 0.4 : 0);
    const gravityA = -9.8 * 0.45 * grade;
    let a = gravityA + push / massF;

    c.v += a * DT;
    c.v -= c.v * 0.14 * DT; // drag
    // rolling friction / stiction
    if (Math.abs(c.v) > 0.03) {
      c.v -= Math.sign(c.v) * Math.min(Math.abs(c.v), 0.35 * DT);
    } else if (push === 0 && Math.abs(gravityA) < 0.45) {
      c.v = 0;
    }
    c.v = Math.min(16, Math.max(-16, c.v));
    c.s += c.v * DT;

    // Soft buffers: leave room for the trailing ore cart at the mine end,
    // and bounce lightly instead of stacking into the stop.
    if (c.s <= CART_S_MIN) {
      if (c.v < -0.4 && ev) {
        const pos = railPosAt(CART_S_MIN);
        ev.push({ type: 'cartBump', x: pos.x, z: pos.z });
      }
      c.s = CART_S_MIN;
      // Soft bumper: kill most of the impact, no hard stack into the stop.
      c.v = c.v < 0 ? Math.min(1.2, -c.v * 0.18) : Math.max(0, c.v);
      if (Math.abs(c.v) < 0.35) c.v = 0;
    }
    if (c.s >= RAIL_LENGTH) {
      if (c.v > 0.4 && ev) {
        const pos = railPosAt(RAIL_LENGTH);
        ev.push({ type: 'cartBump', x: pos.x, z: pos.z });
      }
      c.s = RAIL_LENGTH;
      c.v = c.v > 0 ? Math.max(-1.2, -c.v * 0.18) : Math.min(0, c.v);
      if (Math.abs(c.v) < 0.35) c.v = 0;
    }

    if (rider) {
      const pos = railPosAt(c.s);
      rider.x = pos.x;
      rider.z = pos.z;
      const tan = railTangentAt(c.s);
      rider.heading = Math.atan2(tan.x, tan.z);
    }

    // Locomotive dock auto-unload
    if (loco && !rider && cartDocked(c.s) && c.loadTotal > 0) {
      c.v = 0;
      if (w.tick % 8 === 0) unloadOne(w, c); // ~2.5/s
    }
  }
}

export function unloadOne(w: WorldState, cart: CartState) {
  const res = Object.keys(cart.load)[0] as ResourceId | undefined;
  if (!res) return;
  addRes(cart.load, res, -1);
  cart.loadTotal--;
  w.stockpile[res]++;
}

/**
 * Finish a melt: take the inputs and hand over the ingot. Inputs are charged
 * here rather than when the melt starts, so a smelt can never swallow ore
 * without giving the matching ingot back.
 */
function completeSmelt(w: WorldState, forge: BuildingState, ev: SimEvent[]): boolean {
  const recipe = findRecipe('forge', forge.smelting);
  if (!hasInputs(w, recipe.inputs)) {
    // Someone spent the inputs mid-melt: hold the heat and wait for restock.
    forge.smeltT = 0.999;
    return false;
  }
  pay(w, recipe.inputs);
  w.stockpile[recipe.out]++;
  if (Math.random() < SMELT_STONE_CHANCE) w.stockpile.stone++;
  forge.smelting = null;
  forge.smeltT = 0;
  ev.push({ type: 'smelted', x: forge.x, z: forge.z, res: recipe.out });
  return true;
}

/**
 * Advance the forge by `rate` (1 = one full tend pulse) on the selected
 * recipe. Returns false if there was nothing to do.
 */
export function pumpForge(w: WorldState, out: ResourceId, rate: number, ev: SimEvent[]): boolean {
  const forge = w.buildings.find((b) => b.type === 'forge');
  if (!forge || forge.hp <= 0) return false;
  const recipe = findRecipe('forge', out);
  if (!hasInputs(w, recipe.inputs)) return false;

  if (forge.smelting !== recipe.out) {
    forge.smelting = recipe.out;
    forge.smeltT = 0;
  }

  // One tend pulse advances roughly a third of an ingot.
  forge.smeltT += rate * 0.34;
  if (forge.smeltT >= 1) completeSmelt(w, forge, ev);
  return true;
}

export function tickForge(w: WorldState, ev: SimEvent[]) {
  const forge = w.buildings.find((b) => b.type === 'forge');
  if (!forge || forge.hp <= 0 || forge.smelting === null) return;

  // Players actively pumping (hold E) advance via the forge work context.
  // Bellows tech keeps a slow residual burn while someone is still nearby.
  if (!w.techs.bellows.unlocked) return;
  const nearby = w.players.some(
    (p) => !p.riding && Math.hypot(p.x - forge.x, p.z - forge.z) < REACH_FORGE,
  );
  if (!nearby) return;
  forge.smeltT += (0.25 * DT) / SMELT_TIME;
  if (forge.smeltT >= 1) completeSmelt(w, forge, ev);
}

/**
 * The blast furnace runs on its own: it burns the charges of iron and coal a
 * player shovelled in, one slow ingot at a time. Upgrading the draught is the
 * only way to make it quick.
 */
export function tickFurnaces(w: WorldState, ev: SimEvent[]) {
  for (const b of w.buildings) {
    if (b.type !== 'blastFurnace' || b.hp <= 0) continue;

    if (b.smelting === null) {
      if (b.charges < 1) continue;
      b.charges--;
      b.smelting = 'steelIngot';
      b.smeltT = 0;
    }

    const seconds = furnaceLevel(b.level).time;
    b.smeltT += DT / seconds;
    if (b.smeltT >= 1) {
      w.stockpile.steelIngot++;
      b.smelting = null;
      b.smeltT = 0;
      ev.push({ type: 'smelted', x: b.x, z: b.z, res: 'steelIngot' });
    }
  }
}

export function tickResearch(w: WorldState, ev: SimEvent[]) {
  if (!w.research) return;
  const tech = w.research;
  const t = w.techs[tech];
  t.progress += DT / TECHS[tech].time;
  if (t.progress < 1) return;
  t.progress = 1;
  t.unlocked = true;
  w.research = null;
  ev.push({ type: 'research', tech });

  if (tech === 'reinforcedWalls') {
    for (const b of w.buildings) {
      if (b.type === 'wall' || b.type === 'gate') {
        const bonus = Math.round(b.maxHp * 0.6);
        b.maxHp += bonus;
        b.hp = Math.min(b.maxHp, b.hp + bonus);
      }
    }
  }
}
