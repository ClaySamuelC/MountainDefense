import type { ResourceId } from './resources';
import type { BuildingDef, BuildingTag, CombatCap, Cost, Tier, UpgradeLevel } from './schema';
import { recipeById, recipeIdForOut, type Recipe, type RecipeId } from './recipes';

const BUILDINGS_RAW = {
  keep: {
    name: 'Keep',
    blurb: 'The heart of the hold. If it falls, the mountain is lost.',
    tags: ['landmark', 'defense'],
    mesh: 'keep',
    hp: 600,
    footprint: 3.5,
  },
  wall: {
    name: 'Wall',
    blurb: 'Courtyard fortification.',
    tags: ['fortification', 'defense'],
    mesh: 'wall',
    hp: 300,
    footprint: 2.0,
  },
  gate: {
    name: 'Gate',
    blurb: 'Chokepoint the horde must breach.',
    tags: ['fortification', 'defense'],
    mesh: 'gate',
    hp: 420,
    footprint: 2.4,
  },
  anvil: {
    name: 'Anvil',
    blurb: 'Break raw ore into crushed metal.',
    tags: ['industry', 'station'],
    mesh: 'anvil',
    hp: 150,
    footprint: 2.0,
    industry: {
      mode: 'attended',
      recipes: ['crushIron', 'crushCopper'],
      defaultRecipe: 'crushIron',
    },
    interact: { work: 'station' },
  },
  forge: {
    name: 'Forge',
    blurb: 'Smelt crushed ore with coal into ingots.',
    tags: ['industry', 'station'],
    mesh: 'forge',
    hp: 200,
    footprint: 2.4,
    industry: {
      mode: 'attended',
      recipes: ['smeltIron', 'smeltCopper'],
      defaultRecipe: 'smeltIron',
    },
    interact: { work: 'station' },
  },
  blastFurnace: {
    name: 'Blast Furnace',
    blurb: 'Load iron and coal, then leave it. Slow steel until you upgrade the draught.',
    tags: ['industry'],
    mesh: 'blastFurnace',
    hp: 320,
    footprint: 3.2,
    place: {
      footprint: 3.2,
      zone: 'courtyard',
      maxAlive: 1,
      group: 'industry',
      variants: {
        crude: {
          name: 'Blast Furnace',
          blurb: 'Load iron and coal, then leave it. Slow steel until you upgrade the draught.',
          cost: { stone: 16, ironIngot: 5 },
          hp: 320,
        },
      },
    },
    industry: {
      mode: 'charge',
      recipes: ['smeltSteel'],
      defaultRecipe: 'smeltSteel',
      charge: { ironIngot: 1, coal: 2 },
      chargeCap: 6,
    },
    interact: { work: 'charge', label: 'Charge the blast furnace' },
    upgrades: [
      { name: 'Cold Draught', time: 48 },
      { name: 'Forced Air', time: 25, upgrade: { ironIngot: 6, stone: 14 } },
      { name: 'Hot Blast', time: 11, upgrade: { steelIngot: 3, copperIngot: 6 } },
    ],
  },
  dock: {
    name: 'Dock',
    blurb: 'Rail terminus where carts unload into the stockpile.',
    tags: ['logistics'],
    mesh: 'dock',
    hp: 250,
    footprint: 2.8,
    logistics: {
      roles: ['railDock', 'sink'],
      accepts: '*',
      autoUnloadRate: 2.5,
    },
  },
  towerArrow: {
    name: 'Arrow Tower',
    blurb: 'Courtyard archer nest.',
    tags: ['defense'],
    mesh: 'towerArrow',
    hp: 120,
    footprint: 2.4,
    place: {
      footprint: 2.4,
      zone: 'courtyard',
      group: 'defense',
      variants: {
        crude: {
          name: 'Crude Tower',
          blurb: 'Lashed logs and loose rock. Costs stone. Soft in a fight.',
          cost: { stone: 14 },
          hp: 120,
        },
        refined: {
          name: 'Arrow Tower',
          blurb: 'Smelted iron frame. Faster and harder-hitting than crude.',
          cost: { ironIngot: 4 },
          hp: 200,
        },
      },
    },
    combat: {
      crude: { dmg: 5, rate: 0.8, range: 13, projectile: 'stone' },
      refined: { dmg: 9, rate: 1.25, range: 15, projectile: 'bolt' },
    },
    upgrades: {
      crude: [
        { name: 'Lashed', dmgMul: 1, rateMul: 1, rangeMul: 1, hpBonus: 0 },
        {
          name: 'Braced',
          dmgMul: 1.35,
          rateMul: 1.1,
          rangeMul: 1.1,
          hpBonus: 40,
          cost: { stone: 12 },
        },
        {
          name: 'Packed',
          dmgMul: 1.7,
          rateMul: 1.25,
          rangeMul: 1.2,
          hpBonus: 90,
          cost: { stone: 20 },
        },
      ],
      refined: [
        { name: 'Tempered', dmgMul: 1, rateMul: 1, rangeMul: 1, hpBonus: 0 },
        {
          name: 'Sighted',
          dmgMul: 1.25,
          rateMul: 1.15,
          rangeMul: 1.2,
          hpBonus: 50,
          cost: { ironIngot: 3, stone: 8 },
        },
        {
          name: 'Volley',
          dmgMul: 1.5,
          rateMul: 1.4,
          rangeMul: 1.3,
          hpBonus: 110,
          cost: { ironIngot: 5, copperIngot: 2 },
        },
      ],
    },
  },
  towerBallista: {
    name: 'Ballista',
    blurb: 'Steel-armed siege killer. Built for brutes.',
    tags: ['defense'],
    mesh: 'towerBallista',
    hp: 260,
    footprint: 2.4,
    place: {
      footprint: 2.4,
      zone: 'courtyard',
      group: 'defense',
      variants: {
        refined: {
          name: 'Ballista',
          blurb: 'Steel-armed siege killer. Built for brutes.',
          cost: { steelIngot: 3, ironIngot: 2 },
          hp: 260,
        },
      },
    },
    combat: {
      refined: { dmg: 34, rate: 0.45, range: 21, projectile: 'bolt' },
    },
    upgrades: {
      refined: [
        { name: 'Siege', dmgMul: 1, rateMul: 1, rangeMul: 1, hpBonus: 0 },
        {
          name: 'Wound',
          dmgMul: 1.3,
          rateMul: 1.1,
          rangeMul: 1.1,
          hpBonus: 60,
          cost: { steelIngot: 2, ironIngot: 2 },
        },
        {
          name: 'Breach',
          dmgMul: 1.6,
          rateMul: 1.25,
          rangeMul: 1.2,
          hpBonus: 140,
          cost: { steelIngot: 4, copperIngot: 3 },
        },
      ],
    },
  },
} as const satisfies Record<string, BuildingDef>;

export type BuildingId = keyof typeof BUILDINGS_RAW;
/** @deprecated Use BuildingId — kept as alias for existing call sites. */
export type BuildingType = BuildingId;

export const BUILDINGS: Record<BuildingId, BuildingDef> = BUILDINGS_RAW;
export const BUILDING_IDS = Object.keys(BUILDINGS) as BuildingId[];

export function getBuilding(id: string): BuildingDef | null {
  return BUILDINGS[id as BuildingId] ?? null;
}

export function buildingDef(id: string): BuildingDef | null {
  return getBuilding(id);
}

/** Buildings with `place` — derived from the const catalog. */
export type BuildableType = {
  [K in BuildingId]: (typeof BUILDINGS_RAW)[K] extends { place: unknown } ? K : never;
}[BuildingId];

/** Attended `station` tag + industry.mode attended — derived from the const catalog. */
export type StationType = {
  [K in BuildingId]: (typeof BUILDINGS_RAW)[K]['tags'][number] extends BuildingTag
    ? 'station' extends (typeof BUILDINGS_RAW)[K]['tags'][number]
      ? (typeof BUILDINGS_RAW)[K] extends { industry: { mode: 'attended' } }
        ? K
        : never
      : never
    : never;
}[BuildingId];

/** Buildings with a place capability — derived from catalog. */
export const BUILDABLE_TYPES = BUILDING_IDS.filter((id): id is BuildableType => !!BUILDINGS[id].place);

/** Attended industry stations the player picks recipes on. */
export const STATION_TYPES = BUILDING_IDS.filter((id): id is StationType => {
  const def = BUILDINGS[id];
  return def.tags.includes('station') && def.industry?.mode === 'attended';
});

export function isBuildable(id: string): id is BuildableType {
  return !!getBuilding(id)?.place;
}

export function isStation(id: string): id is StationType {
  const def = getBuilding(id);
  return !!def?.tags.includes('station') && def.industry?.mode === 'attended';
}

export function hasCombat(id: string): boolean {
  return !!getBuilding(id)?.combat;
}

export function isChargeBuilding(id: string): boolean {
  return getBuilding(id)?.industry?.mode === 'charge';
}

export function isFortification(id: string): boolean {
  return !!getBuilding(id)?.tags.includes('fortification');
}

/** First charge-mode building in the catalog (blast furnace today). */
export function primaryChargeBuilding(): BuildingId {
  const id = BUILDING_IDS.find((b) => isChargeBuilding(b));
  if (!id) throw new Error('Catalog has no charge-mode building');
  return id;
}

export interface BuildSpec {
  name: string;
  blurb: string;
  cost: Cost;
  hp: number;
  footprint: number;
}

export interface TowerSpec {
  dmg: number;
  rate: number;
  range: number;
  hp: number;
  cost: Cost;
  projectile: 'bolt' | 'stone';
}

export type TowerLevel = UpgradeLevel;

export function buildSpec(kind: BuildableType, tier: Tier): BuildSpec | null {
  const def = getBuilding(kind);
  const variant = def?.place?.variants[tier];
  if (!variant || !def.place) return null;
  return {
    name: variant.name,
    blurb: variant.blurb,
    cost: variant.cost,
    hp: variant.hp,
    footprint: def.place.footprint,
  };
}

export function towerSpec(type: string, tier: Tier): TowerSpec | null {
  const def = buildingDef(type);
  if (!def?.combat || !def.place) return null;
  const combat = def.combat[tier];
  const variant = def.place.variants[tier];
  if (!combat || !variant) return null;
  return {
    dmg: combat.dmg,
    rate: combat.rate,
    range: combat.range,
    hp: variant.hp,
    cost: variant.cost,
    projectile: combat.projectile,
  };
}

export function towerKey(type: string, tier: Tier | null): string {
  return `${type}:${tier ?? 'crude'}`;
}

function towerUpgradeList(type: string, tier: Tier | null): UpgradeLevel[] {
  const def = buildingDef(type);
  if (!def?.upgrades) return [];
  if (Array.isArray(def.upgrades)) return def.upgrades;
  const t = tier ?? 'crude';
  return def.upgrades[t] ?? def.upgrades.crude ?? [];
}

export function towerLevels(type: string, tier: Tier | null): TowerLevel[] {
  const list = towerUpgradeList(type, tier);
  return list.length ? list : towerUpgradeList('towerArrow', 'crude');
}

export function towerLevel(type: string, tier: Tier | null, level: number): TowerLevel {
  const list = towerLevels(type, tier);
  return list[Math.max(0, Math.min(list.length - 1, level - 1))];
}

export function towerUpgradeCost(
  type: string,
  tier: Tier | null,
  level: number,
): Partial<Record<ResourceId, number>> | null {
  return (towerLevels(type, tier)[level]?.cost as Partial<Record<ResourceId, number>> | undefined) ?? null;
}

export function towerCombat(
  type: string,
  tier: Tier | null,
  level: number,
): { dmg: number; rate: number; range: number; projectile: 'bolt' | 'stone' } | null {
  const base = towerSpec(type, tier ?? 'crude');
  if (!base) return null;
  const lvl = towerLevel(type, tier, level);
  return {
    dmg: base.dmg * (lvl.dmgMul ?? 1),
    rate: base.rate * (lvl.rateMul ?? 1),
    range: base.range * (lvl.rangeMul ?? 1),
    projectile: base.projectile,
  };
}

export function combatCap(type: string, tier: Tier): CombatCap | null {
  return buildingDef(type)?.combat?.[tier] ?? null;
}

/** Charge-building upgrade ladder (defaults to primary charge building). */
export function furnaceLevels(buildingId?: string): UpgradeLevel[] {
  const id = buildingId ?? primaryChargeBuilding();
  const u = getBuilding(id)?.upgrades;
  return Array.isArray(u) ? [...u] : [];
}

export function furnaceLevel(level: number, buildingId?: string): UpgradeLevel {
  const list = furnaceLevels(buildingId);
  return list[Math.max(0, Math.min(list.length - 1, level - 1))];
}

export function furnaceUpgradeCost(
  level: number,
  buildingId?: string,
): Partial<Record<ResourceId, number>> | null {
  return (
    (furnaceLevels(buildingId)[level]?.upgrade as Partial<Record<ResourceId, number>> | undefined) ??
    null
  );
}

function chargeIndustry() {
  return BUILDINGS[primaryChargeBuilding()].industry!;
}

export const FURNACE_CHARGE: Partial<Record<ResourceId, number>> = {
  ...(chargeIndustry().charge as Partial<Record<ResourceId, number>>),
};
export const FURNACE_CAP = chargeIndustry().chargeCap ?? 6;
export const FURNACE_COST: Cost = BUILDINGS.blastFurnace.place!.variants.crude!.cost;
export const FURNACE_HP = BUILDINGS.blastFurnace.place!.variants.crude!.hp;
export const FURNACE_FOOTPRINT = BUILDINGS.blastFurnace.place!.footprint;

export const KEEP_HP = BUILDINGS.keep.hp;
export const WALL_HP = BUILDINGS.wall.hp;
export const GATE_HP = BUILDINGS.gate.hp;
export const DOCK_HP = BUILDINGS.dock.hp;
export const ANVIL_HP = BUILDINGS.anvil.hp;
export const FORGE_HP = BUILDINGS.forge.hp;

/** Recipes available at a station, in catalog order. */
export function stationRecipes(station: StationType): Recipe[] {
  const ind = BUILDINGS[station].industry;
  if (!ind) return [];
  return ind.recipes.map((id) => recipeById(id as RecipeId));
}

export const STATION_RECIPES: Record<StationType, Recipe[]> = Object.fromEntries(
  STATION_TYPES.map((id) => [id, stationRecipes(id)]),
) as Record<StationType, Recipe[]>;

export const STATION_DEFAULT: Record<StationType, ResourceId> = Object.fromEntries(
  STATION_TYPES.map((id) => {
    const ind = BUILDINGS[id].industry!;
    const rid = (ind.defaultRecipe ?? ind.recipes[0]) as RecipeId;
    return [id, recipeById(rid).out];
  }),
) as Record<StationType, ResourceId>;

export function findRecipe(station: StationType, out: ResourceId | null): Recipe {
  const list = stationRecipes(station);
  return list.find((r) => r.out === out) ?? list[0];
}

/** Recipe id for a station's current output, if known. */
export function stationRecipeId(station: StationType, out: ResourceId | null): RecipeId | null {
  const recipe = findRecipe(station, out);
  return recipeIdForOut(recipe.out);
}

/** Build menu rows derived from place variants. */
export interface BuildOption {
  kind: BuildableType;
  tier: Tier;
  group: 'defense' | 'industry';
}

export function buildOptions(): BuildOption[] {
  const opts: BuildOption[] = [];
  for (const id of BUILDABLE_TYPES) {
    const place = getBuilding(id)?.place;
    if (!place) continue;
    const group = place.group ?? 'industry';
    for (const tier of Object.keys(place.variants) as Tier[]) {
      if (place.variants[tier]) opts.push({ kind: id, tier, group });
    }
  }
  return opts;
}

/** Dock auto-unload rate from catalog logistics (carts per second). */
export function dockAutoUnloadRate(): number {
  for (const id of BUILDING_IDS) {
    const log = BUILDINGS[id].logistics;
    if (log?.roles.includes('railDock') && log.autoUnloadRate != null) {
      return log.autoUnloadRate;
    }
  }
  return 2.5;
}
