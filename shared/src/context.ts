import type { BuildingState, PlayerState, ResourceId, StationType, WorldState } from './types';
import {
  BREAK_TIME,
  CARRY_CAP,
  CART_SPACING,
  FORGE_TEND_TIME,
  FURNACE_CAP,
  FURNACE_CHARGE,
  GATE_REBUILD_COST,
  MINE_TIME,
  POS,
  REACH_ANVIL,
  REACH_CART,
  REACH_FORGE,
  REACH_FURNACE,
  REACH_MINE,
  REACH_REPAIR,
  RESOURCE_NAMES,
  VEIN_LABELS,
  WALL_REBUILD_COST,
  YARD_RADIUS,
  findRecipe,
  getBuilding,
  isChargeBuilding,
  isFortification,
  recipeUnlocked,
  stationRecipeId,
} from './constants';
import { RAIL_LENGTH, railPosAt } from './rail';
export type WorkContext =
  | { kind: 'mine'; nodeId: string; label: string }
  | { kind: 'loadCart'; cartId: string; label: string }
  | { kind: 'unloadCart'; cartId: string; label: string }
  | { kind: 'anvil'; station: StationType; recipe: ResourceId; ready: boolean; label: string }
  | { kind: 'forge'; station: StationType; recipe: ResourceId; ready: boolean; label: string }
  | { kind: 'furnace'; buildingId: string; ready: boolean; label: string }
  | { kind: 'repair'; buildingId: string; label: string }
  | { kind: 'rebuild'; buildingId: string; ready: boolean; label: string }
  | { kind: 'deposit'; label: string };

function dist(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

export function cartDocked(s: number): boolean {
  return s > RAIL_LENGTH - 3;
}

/** Do we hold every input for one run of this recipe? */
export function hasInputs(w: WorldState, inputs: Partial<Record<ResourceId, number>>): boolean {
  for (const [res, n] of Object.entries(inputs)) {
    if (w.stockpile[res as ResourceId] < (n ?? 0)) return false;
  }
  return true;
}

/** "crushed iron + coal" — the shopping list for a recipe, for prompts. */
export function inputSummary(inputs: Partial<Record<ResourceId, number>>): string {
  return Object.entries(inputs)
    .map(([res, n]) => ((n ?? 1) > 1 ? `${n} ${RESOURCE_NAMES[res as ResourceId]}` : RESOURCE_NAMES[res as ResourceId]))
    .join(' + ')
    .toLowerCase();
}

/** Below this share of max HP a station stops working and asks to be repaired. */
const STATION_MIN_HEALTH = 0.9;

/**
 * Scratches are ignored, but a badly damaged station yields to the repair
 * context so hold-E never gets stuck on a wreck.
 */
function stationUsable(b: BuildingState | undefined): b is BuildingState {
  return !!b && b.hp > 0 && b.hp >= b.maxHp * STATION_MIN_HEALTH;
}

function stationContext(
  w: WorldState,
  b: BuildingState,
  station: StationType,
): Extract<WorkContext, { kind: 'anvil' | 'forge' }> {
  const recipe = findRecipe(station, b.recipe);
  const rid = stationRecipeId(station, recipe.out);
  const unlocked = !rid || recipeUnlocked(w, rid);
  const ready = unlocked && hasInputs(w, recipe.inputs);
  const label = !unlocked
    ? 'Recipe locked — research required'
    : ready
      ? recipe.verb
      : `Need ${inputSummary(recipe.inputs)} to ${recipe.verb.toLowerCase()}`;
  return { kind: station, station, recipe: recipe.out, ready, label };
}

/** Resolve what holding E does for this player. Priority order matters. */
export function getContext(w: WorldState, p: PlayerState): WorkContext | null {
  if (p.riding) return null;

  // 1. Mine a nearby vein
  if (p.carryTotal < CARRY_CAP) {
    let best: { id: string; kind: string } | null = null;
    let bd = REACH_MINE;
    for (const n of w.nodes) {
      if (n.amount <= 0) continue;
      const d = dist(p.x, p.z, n.x, n.z);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    if (best) {
      return {
        kind: 'mine',
        nodeId: best.id,
        label: `Mine ${VEIN_LABELS[best.kind as keyof typeof VEIN_LABELS].toLowerCase()}`,
      };
    }
  }

  // 2. Unload a docked cart by hand (loading the pack into the cart is automatic
  //    on walk-over, so it never needs a hold-E prompt).
  for (const c of w.carts) {
    const front = railPosAt(c.s);
    const back = railPosAt(Math.max(0, c.s - CART_SPACING));
    const d = Math.min(dist(p.x, p.z, front.x, front.z), dist(p.x, p.z, back.x, back.z));
    if (d < REACH_CART && cartDocked(c.s) && c.loadTotal > 0) {
      return { kind: 'unloadCart', cartId: c.id, label: 'Unload cart' };
    }
  }

  // 3. Fortifications beat stations — patching a gate during the day must not
  //    lose to the forge just because you're standing near both.
  {
    let best: BuildingState | null = null;
    let bd = REACH_REPAIR;
    for (const b of w.buildings) {
      if (!isFortification(b.type)) continue;
      if (b.hp <= 0 || b.hp >= b.maxHp) continue;
      const d = dist(p.x, p.z, b.x, b.z);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    if (best && crudeForRepair(w)) {
      const name = getBuilding(best.type)?.name ?? best.type;
      return { kind: 'repair', buildingId: best.id, label: `Repair ${name}` };
    }
  }
  {
    let best: BuildingState | null = null;
    let bd = REACH_REPAIR;
    for (const b of w.buildings) {
      if (!isFortification(b.type)) continue;
      if (b.hp > 0) continue;
      const d = dist(p.x, p.z, b.x, b.z);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    if (best) {
      const name = getBuilding(best.type)?.name ?? best.type;
      const cost = best.type === 'gate' ? GATE_REBUILD_COST : WALL_REBUILD_COST;
      const ready = hasInputs(w, cost) || best.buildProgress > 0;
      const label = ready
        ? `Rebuild ${name}`
        : `Need ${inputSummary(cost)} to rebuild the ${name.toLowerCase()}`;
      return { kind: 'rebuild', buildingId: best.id, ready, label };
    }
  }

  // 4. Drop the pack at the yard before touching a station, so a full pack
  //    never gets stuck behind the anvil's reach.
  if (p.carryTotal > 0 && dist(p.x, p.z, POS.yard.x, POS.yard.z) < YARD_RADIUS) {
    return { kind: 'deposit', label: 'Deposit pack' };
  }

  // 5. Anvil: break raw ore into crushed, whichever the player selected
  const anvil = w.buildings.find((b) => b.type === 'anvil');
  if (stationUsable(anvil) && dist(p.x, p.z, anvil.x, anvil.z) < REACH_ANVIL) {
    return stationContext(w, anvil, 'anvil');
  }

  // 6. Forge: pump the bellows on the selected recipe
  const forge = w.buildings.find((b) => b.type === 'forge');
  if (stationUsable(forge) && dist(p.x, p.z, forge.x, forge.z) < REACH_FORGE) {
    return stationContext(w, forge, 'forge');
  }

  // 7. Charge buildings: shovel in charges, then walk away
  {
    let furnace: BuildingState | undefined;
    let bd = REACH_FURNACE;
    for (const b of w.buildings) {
      if (!isChargeBuilding(b.type) || !stationUsable(b)) continue;
      const d = dist(p.x, p.z, b.x, b.z);
      if (d < bd) {
        bd = d;
        furnace = b;
      }
    }
    if (furnace) {
      const def = getBuilding(furnace.type);
      const cap = def?.industry?.chargeCap ?? FURNACE_CAP;
      const charge = (def?.industry?.charge as typeof FURNACE_CHARGE) ?? FURNACE_CHARGE;
      const recipeId = def?.industry?.defaultRecipe ?? def?.industry?.recipes[0];
      const unlocked = !recipeId || recipeUnlocked(w, recipeId);
      const full = furnace.charges >= cap;
      const ready = unlocked && !full && hasInputs(w, charge);
      const chargeLabel = def?.interact?.label ?? `Charge the ${def?.name ?? 'furnace'}`;
      const label = !unlocked
        ? 'Recipe locked — research required'
        : full
          ? 'Furnace is fully charged'
          : ready
            ? chargeLabel
            : `Need ${inputSummary(charge)} to charge the furnace`;
      return { kind: 'furnace', buildingId: furnace.id, ready, label };
    }
  }

  // 8. Repair damaged building
  {
    let best: string | null = null;
    let bd = REACH_REPAIR;
    for (const b of w.buildings) {
      if (b.hp <= 0 || b.hp >= b.maxHp) continue;
      const d = dist(p.x, p.z, b.x, b.z);
      if (d < bd) {
        bd = d;
        best = b.id;
      }
    }
    if (best && crudeForRepair(w)) {
      return { kind: 'repair', buildingId: best, label: 'Repair' };
    }
  }

  return null;
}

function crudeForRepair(w: WorldState): boolean {
  return w.stockpile.stone > 0.1;
}

/** Seconds of held work per completed unit, or null for Instant/continuous work. */
export function workDuration(ctx: WorkContext): number | null {
  if (ctx.kind === 'mine') return MINE_TIME;
  if (ctx.kind === 'anvil') return BREAK_TIME;
  if (ctx.kind === 'forge') return FORGE_TEND_TIME;
  return null;
}

/** True for actions that use the click-the-beat mini-game. */
export function isBeatWork(
  ctx: WorkContext | null,
): ctx is Extract<WorkContext, { kind: 'mine' | 'anvil' | 'forge' }> {
  return !!ctx && (ctx.kind === 'mine' || ctx.kind === 'anvil' || ctx.kind === 'forge');
}

/** The station a player is standing at, if any — drives scroll-to-pick. */
export function stationAt(w: WorldState, p: PlayerState): Extract<WorkContext, { kind: 'anvil' | 'forge' }> | null {
  const ctx = getContext(w, p);
  return ctx && (ctx.kind === 'anvil' || ctx.kind === 'forge') ? ctx : null;
}

/** True when pressing E here can actually make progress right now. */
export function contextReady(ctx: WorkContext): boolean {
  if (ctx.kind === 'anvil' || ctx.kind === 'forge' || ctx.kind === 'furnace' || ctx.kind === 'rebuild') {
    return ctx.ready;
  }
  return true;
}

export function resourceName(id: ResourceId): string {
  return RESOURCE_NAMES[id];
}
