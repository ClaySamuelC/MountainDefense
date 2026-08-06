import type { TechState } from '../types';
import { BUILDABLE_TYPES, BUILDING_IDS, STATION_TYPES, getBuilding } from './buildings';
import { RECIPES, RECIPE_IDS, type RecipeId } from './recipes';
import { RESOURCE_IDS, type ResourceId } from './resources';
import { TECHS, TECH_IDS, type TechId } from './techs';
import type { BuildingDef, StatId, TechDef, UpgradeLevel } from './schema';

const STAT_IDS: StatId[] = [
  'mineWorkSpeed',
  'anvilWorkSpeed',
  'cartCap',
  'repairCost',
  'forgeSpeed',
];

/**
 * Content authoring checklist:
 * 1. New resource → resources.ts (+ client icon/color/pile — Record<ResourceId,…> enforces)
 * 2. New recipe → recipes.ts, reference from a building industry.recipes
 * 3. New building → buildings.ts with only the caps it needs + mesh factory entry
 * 4. New research → techs.ts with requires + effects only
 * 5. If no Effect op fits → add one op + interpreter case once, or a flag + one sim branch
 *
 * Anti-pattern: new `if (w.techs.xyz.unlocked)` outside catalog/effects.ts / flag handlers.
 */

export function emptyStockpile(): Record<ResourceId, number> {
  const s = {} as Record<ResourceId, number>;
  for (const id of RESOURCE_IDS) s[id] = 0;
  return s;
}

export function emptyTechMap(): Record<TechId, TechState> {
  const techs = {} as Record<TechId, TechState>;
  for (const id of TECH_IDS) {
    techs[id] = { unlocked: false, progress: 0 };
  }
  return techs;
}

export interface CatalogIssue {
  path: string;
  message: string;
}

function checkCost(
  issues: CatalogIssue[],
  path: string,
  cost: Partial<Record<string, number>> | undefined,
  resSet: Set<string>,
): void {
  if (!cost) return;
  for (const res of Object.keys(cost)) {
    if (res !== 'crude' && !resSet.has(res)) {
      issues.push({ path, message: `unknown resource ${res}` });
    }
  }
}

function checkUpgradeLevels(
  issues: CatalogIssue[],
  path: string,
  levels: UpgradeLevel[],
  resSet: Set<string>,
): void {
  for (let i = 0; i < levels.length; i++) {
    const lvl = levels[i];
    checkCost(issues, `${path}[${i}].cost`, lvl.cost, resSet);
    checkCost(issues, `${path}[${i}].upgrade`, lvl.upgrade, resSet);
  }
}

/** Cross-reference check — call from tests and createWorld boot. */
export function validateCatalog(): CatalogIssue[] {
  const issues: CatalogIssue[] = [];
  const resSet = new Set<string>(RESOURCE_IDS);
  const recipeSet = new Set<string>(RECIPE_IDS);
  const buildingSet = new Set<string>(BUILDING_IDS);
  const techSet = new Set<string>(TECH_IDS);
  const buildableSet = new Set<string>(BUILDABLE_TYPES);
  const stationSet = new Set<string>(STATION_TYPES);

  for (const id of RECIPE_IDS) {
    const r = RECIPES[id];
    if (!resSet.has(r.out)) {
      issues.push({ path: `recipes.${id}.out`, message: `unknown resource ${r.out}` });
    }
    for (const res of Object.keys(r.inputs)) {
      if (!resSet.has(res)) {
        issues.push({ path: `recipes.${id}.inputs`, message: `unknown resource ${res}` });
      }
    }
  }

  for (const id of BUILDING_IDS) {
    const b = getBuilding(id) as BuildingDef;
    if (b.place && !buildableSet.has(id)) {
      issues.push({ path: `buildings.${id}`, message: 'has place but missing from BUILDABLE_TYPES' });
    }
    if (!b.place && buildableSet.has(id)) {
      issues.push({ path: `buildings.${id}`, message: 'in BUILDABLE_TYPES but has no place' });
    }
    if (b.tags.includes('station') && b.industry?.mode === 'attended' && !stationSet.has(id)) {
      issues.push({ path: `buildings.${id}`, message: 'attended station missing from STATION_TYPES' });
    }

    const ind = b.industry;
    if (ind) {
      for (const rid of ind.recipes) {
        if (!recipeSet.has(rid)) {
          issues.push({ path: `buildings.${id}.industry.recipes`, message: `unknown recipe ${rid}` });
        }
      }
      if (ind.defaultRecipe && !recipeSet.has(ind.defaultRecipe)) {
        issues.push({
          path: `buildings.${id}.industry.defaultRecipe`,
          message: `unknown recipe ${ind.defaultRecipe}`,
        });
      }
      if (ind.charge) {
        for (const res of Object.keys(ind.charge)) {
          if (!resSet.has(res)) {
            issues.push({ path: `buildings.${id}.industry.charge`, message: `unknown resource ${res}` });
          }
        }
      }
      if (ind.mode === 'charge' && (!ind.charge || ind.chargeCap == null)) {
        issues.push({
          path: `buildings.${id}.industry`,
          message: 'charge mode requires charge + chargeCap',
        });
      }
    }

    if (b.place) {
      for (const [tier, variant] of Object.entries(b.place.variants)) {
        if (!variant) continue;
        checkCost(issues, `buildings.${id}.place.variants.${tier}.cost`, variant.cost, resSet);
        if (b.combat && !b.combat[tier as 'crude' | 'refined']) {
          // place-only tiers (furnace crude) are fine without combat
        }
      }
      if (b.combat) {
        for (const tier of Object.keys(b.combat) as Array<'crude' | 'refined'>) {
          if (!b.place.variants[tier]) {
            issues.push({
              path: `buildings.${id}.combat.${tier}`,
              message: 'combat tier has no matching place variant',
            });
          }
          if (!b.combat[tier]?.projectile) {
            issues.push({
              path: `buildings.${id}.combat.${tier}.projectile`,
              message: 'projectile required',
            });
          }
        }
      }
    }

    if (b.upgrades) {
      if (Array.isArray(b.upgrades)) {
        checkUpgradeLevels(issues, `buildings.${id}.upgrades`, b.upgrades, resSet);
      } else {
        for (const [tier, levels] of Object.entries(b.upgrades)) {
          if (levels) checkUpgradeLevels(issues, `buildings.${id}.upgrades.${tier}`, levels, resSet);
        }
      }
    }

    if (b.mesh !== id) {
      issues.push({
        path: `buildings.${id}.mesh`,
        message: `mesh key "${b.mesh}" should match building id for client registry`,
      });
    }
  }

  for (const id of TECH_IDS) {
    const t: TechDef = TECHS[id];
    checkCost(issues, `techs.${id}.cost`, t.cost, resSet);
    for (const req of t.requires ?? []) {
      if (!techSet.has(req)) {
        issues.push({ path: `techs.${id}.requires`, message: `unknown tech ${req}` });
      }
    }
    // Cycle detection (simple DFS from this tech)
    const seen = new Set<string>();
    const stack = [...(t.requires ?? [])];
    while (stack.length) {
      const cur = stack.pop()!;
      if (cur === id) {
        issues.push({ path: `techs.${id}.requires`, message: 'requires cycle' });
        break;
      }
      if (seen.has(cur)) continue;
      seen.add(cur);
      const next = TECHS[cur as TechId]?.requires;
      if (next) stack.push(...next);
    }

    for (const e of t.effects) {
      if (e.op === 'unlockBuilding' && !buildingSet.has(e.building)) {
        issues.push({ path: `techs.${id}.effects`, message: `unknown building ${e.building}` });
      }
      if (e.op === 'unlockRecipe' && !recipeSet.has(e.recipe)) {
        issues.push({ path: `techs.${id}.effects`, message: `unknown recipe ${e.recipe}` });
      }
      if (e.op === 'modBuildingStat' && typeof e.building === 'string' && !buildingSet.has(e.building)) {
        issues.push({ path: `techs.${id}.effects`, message: `unknown building ${e.building}` });
      }
      if ((e.op === 'mulStat' || e.op === 'addStat') && !STAT_IDS.includes(e.stat)) {
        issues.push({ path: `techs.${id}.effects`, message: `unknown stat ${e.stat}` });
      }
    }
  }

  // Every gated recipe / locked building should be referenced from somewhere usable
  for (const id of RECIPE_IDS) {
    let referenced = false;
    for (const bid of BUILDING_IDS) {
      if (getBuilding(bid)?.industry?.recipes.includes(id)) {
        referenced = true;
        break;
      }
    }
    if (!referenced) {
      issues.push({ path: `recipes.${id}`, message: 'not referenced by any building industry' });
    }
  }

  return issues;
}

export function assertCatalogValid(): void {
  const issues = validateCatalog();
  if (issues.length) {
    throw new Error(
      `Catalog validation failed:\n${issues.map((i) => `  ${i.path}: ${i.message}`).join('\n')}`,
    );
  }
}

// IDs are exported from their own modules — avoid duplicate re-exports here.
