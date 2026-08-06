import type { WorldState } from '../types';
import { getBuilding } from './buildings';
import type { BuildingTag, FlagId, StatId, TechDef } from './schema';
import { TECHS, techDef, type TechId } from './techs';

const STAT_DEFAULTS: Record<StatId, number> = {
  mineWorkSpeed: 1,
  anvilWorkSpeed: 1,
  cartCap: 12,
  repairCost: 1,
  forgeSpeed: 1,
};

export interface ModifierCache {
  mul: Partial<Record<StatId, number>>;
  add: Partial<Record<StatId, number>>;
  flags: Set<FlagId>;
  unlockedBuildings: Set<string>;
  unlockedRecipes: Set<string>;
  /** Buildings that only appear once a tech unlocks them. */
  lockedByDefault: Set<string>;
}

/** Buildings referenced by any unlockBuilding effect start locked. */
export function buildingsLockedByDefault(): Set<string> {
  const locked = new Set<string>();
  for (const def of Object.values(TECHS)) {
    for (const e of def.effects) {
      if (e.op === 'unlockBuilding') locked.add(e.building);
    }
  }
  return locked;
}

const LOCKED_BUILDINGS = buildingsLockedByDefault();

/** Recipes referenced by any unlockRecipe effect start locked. */
function recipesGatedByDefault(): Set<string> {
  const gated = new Set<string>();
  for (const def of Object.values(TECHS)) {
    for (const e of def.effects) {
      if (e.op === 'unlockRecipe') gated.add(e.recipe);
    }
  }
  return gated;
}

const GATED_RECIPES = recipesGatedByDefault();

let modCache: { world: WorldState; tick: number; sig: string; mods: ModifierCache } | null =
  null;

function unlockSig(w: WorldState): string {
  let s = '';
  for (const id of Object.keys(TECHS) as TechId[]) {
    s += w.techs[id]?.unlocked ? '1' : '0';
  }
  return s;
}

export function collectModifiers(w: WorldState): ModifierCache {
  const sig = unlockSig(w);
  if (modCache && modCache.world === w && modCache.tick === w.tick && modCache.sig === sig) {
    return modCache.mods;
  }

  const mul: Partial<Record<StatId, number>> = {};
  const add: Partial<Record<StatId, number>> = {};
  const flags = new Set<FlagId>();
  const unlockedBuildings = new Set<string>();
  const unlockedRecipes = new Set<string>();

  for (const id of Object.keys(TECHS) as TechId[]) {
    if (!w.techs[id]?.unlocked) continue;
    for (const e of TECHS[id].effects) {
      switch (e.op) {
        case 'mulStat':
          mul[e.stat] = (mul[e.stat] ?? 1) * e.value;
          break;
        case 'addStat':
          add[e.stat] = (add[e.stat] ?? 0) + e.value;
          break;
        case 'unlockBuilding':
          unlockedBuildings.add(e.building);
          break;
        case 'unlockRecipe':
          unlockedRecipes.add(e.recipe);
          break;
        case 'flag':
          flags.add(e.flag);
          break;
        case 'modBuildingStat':
          // One-shot on unlock via applyTechUnlock — not a live modifier.
          break;
      }
    }
  }

  const mods: ModifierCache = {
    mul,
    add,
    flags,
    unlockedBuildings,
    unlockedRecipes,
    lockedByDefault: LOCKED_BUILDINGS,
  };
  modCache = { world: w, tick: w.tick, sig, mods };
  return mods;
}

export function stat(w: WorldState, id: StatId): number {
  const m = collectModifiers(w);
  const base = STAT_DEFAULTS[id];
  return (base + (m.add[id] ?? 0)) * (m.mul[id] ?? 1);
}

export function hasFlag(w: WorldState, flag: FlagId): boolean {
  return collectModifiers(w).flags.has(flag);
}

export function recipeUnlocked(w: WorldState, recipeId: string): boolean {
  if (!GATED_RECIPES.has(recipeId)) return true;
  return collectModifiers(w).unlockedRecipes.has(recipeId);
}

export function buildingUnlocked(w: WorldState, buildingId: string): boolean {
  const m = collectModifiers(w);
  if (!m.lockedByDefault.has(buildingId)) return true;
  return m.unlockedBuildings.has(buildingId);
}

/** First tech that unlocks this building, if any. */
export function unlockTechForBuilding(buildingId: string): TechId | null {
  for (const id of Object.keys(TECHS) as TechId[]) {
    for (const e of TECHS[id].effects) {
      if (e.op === 'unlockBuilding' && e.building === buildingId) return id;
    }
  }
  return null;
}

function buildingMatches(
  type: string,
  target: string | { tag: BuildingTag },
): boolean {
  if (typeof target === 'string') return type === target;
  return !!getBuilding(type)?.tags.includes(target.tag);
}

/** Apply a maxHp modBuildingStat to living buildings. */
export function applyBuildingMaxHpMod(
  w: WorldState,
  target: string | { tag: BuildingTag },
  mul: number,
  add: number,
): void {
  for (const b of w.buildings) {
    if (!buildingMatches(b.type, target)) continue;
    const newMax = Math.round(b.maxHp * mul + add);
    const bonus = newMax - b.maxHp;
    b.maxHp = newMax;
    if (bonus > 0) b.hp = Math.min(b.maxHp, b.hp + bonus);
    else b.hp = Math.min(b.maxHp, b.hp);
  }
}

/** One-shot side effects when a tech finishes (HP bumps, etc.). */
export function applyTechUnlock(w: WorldState, tech: TechId): void {
  modCache = null;
  for (const e of techDef(tech).effects) {
    if (e.op === 'modBuildingStat' && e.stat === 'maxHp') {
      applyBuildingMaxHpMod(w, e.building, e.mul ?? 1, e.add ?? 0);
    }
  }
}

export function techRequiresMet(w: WorldState, tech: TechId): boolean {
  const req = techDef(tech).requires;
  if (!req?.length) return true;
  return req.every((r) => w.techs[r as TechId]?.unlocked);
}

export function advancementFromTechs(w: WorldState, defaultWeight: number): number {
  let sum = 0;
  for (const id of Object.keys(TECHS) as TechId[]) {
    if (!w.techs[id]?.unlocked) continue;
    sum += techDef(id).advWeight ?? defaultWeight;
  }
  return sum;
}

export type { TechDef };
