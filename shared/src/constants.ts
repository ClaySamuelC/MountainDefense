import type { NodeKind, ResourceId } from './types';

export const TICK_RATE = 20;
export const DT = 1 / TICK_RATE;

export const MAP_HALF = 90; // world spans [-90, 90] on x and z

export const DAY_LEN = 150; // seconds
export const NIGHT_LEN = 75;

export const PLAYER_SPEED = 7;
export const CARRY_CAP = 8;

// Work timings (seconds per unit)
export const MINE_TIME = 1.0;
export const BREAK_TIME = 1.2; // anvil: raw -> crushed
export const SMELT_TIME = 4.0; // forge: per ingot, attended
export const FORGE_TEND_TIME = 1.1; // one bellows pump / beat cycle while tending

// Timing mini-game: hit in the late window (or slightly early — rhythm-game
// forgiveness), or the next swing is slowed by BEAT_MISS_PENALTY.
export const BEAT_WINDOW = 0.28; // last 28% of the swing is the lit sweet spot
/** Extra acceptance before the lit window — slightly early taps still bank. */
export const BEAT_EARLY_FORGIVE = 0.12;
export const BEAT_MISS_PENALTY = 1.55;
export const BEAT_EARLY_SETBACK = 0.12; // progress lost for hitting way too early

/** Push force — raised with the longer mine so the climb stays about as short. */
export const CART_PUSH = 12;
export const CART_LOCO_PUSH = 15.5;
export const CART_SPACING = 2.7; // ore cart trails passenger cart
/** Passenger cart never rolls past this — leaves room for the ore cart at the buffer. */
export const CART_S_MIN = CART_SPACING;

export const REPAIR_RATE = 45; // hp per second
export const REPAIR_ORE_PER_HP = 1 / 35; // stone per hp repaired

export const MELEE_DMG = 7;
export const MELEE_RANGE = 2.8;
export const MELEE_CD = 0.55;

// Stone gun: heavy punch, long chamber — aim with the cursor at a foe.
export const GUN_DMG = 20;
export const GUN_RANGE = 14;
export const GUN_CD = 1.5;

/** Seconds to raise a fallen wall or gate back to standing. */
export const WALL_REBUILD_TIME = 60;
export const WALL_REBUILD_COST: Partial<Record<ResourceId, number>> = { stone: 10 };
export const GATE_REBUILD_COST: Partial<Record<ResourceId, number>> = { stone: 16 };

// Interaction reach (hold-E context / prompts)
export const REACH_MINE = 3.4;
export const REACH_CART = 4.2;
export const REACH_ANVIL = 3.6;
export const REACH_FORGE = 4.0;
export const REACH_FURNACE = 4.4;
export const REACH_REPAIR = 3.6;
export const REACH_MOUNT = 4.2;

// Content catalogs — re-exported so existing `@shared` / constants imports keep working.
export {
  RESOURCES,
  RESOURCE_IDS,
  RESOURCE_NAMES,
  RESOURCE_SHORT,
  RESOURCE_HINTS,
  RESOURCE_STAGE,
  STAGE_LABELS,
  RECIPES,
  RECIPE_IDS,
  BUILDINGS,
  BUILDING_IDS,
  BUILDABLE_TYPES,
  STATION_TYPES,
  STATION_RECIPES,
  STATION_DEFAULT,
  TECHS,
  TECH_IDS,
  TECH_BRANCH_LABELS,
  FURNACE_CHARGE,
  FURNACE_CAP,
  FURNACE_COST,
  FURNACE_HP,
  FURNACE_FOOTPRINT,
  KEEP_HP,
  WALL_HP,
  GATE_HP,
  DOCK_HP,
  ANVIL_HP,
  FORGE_HP,
  buildSpec,
  buildOptions,
  getBuilding,
  hasCombat,
  isChargeBuilding,
  isFortification,
  isStation,
  isBuildable,
  dockAutoUnloadRate,
  towerSpec,
  towerKey,
  towerLevels,
  towerLevel,
  towerUpgradeCost,
  towerCombat,
  furnaceLevel,
  furnaceLevels,
  furnaceUpgradeCost,
  stationRecipes,
  stationRecipeId,
  findRecipe,
  recipeById,
  recipeIdForOut,
  emptyStockpile,
  emptyTechMap,
  validateCatalog,
  assertCatalogValid,
  buildingUnlocked,
  unlockTechForBuilding,
  recipeUnlocked,
  hasFlag,
  stat,
  applyTechUnlock,
  techRequiresMet,
  advancementFromTechs,
  collectModifiers,
} from './catalog';

export type {
  ResourceDef,
  RecipeDef,
  BuildingDef,
  TechDef,
  Effect,
  StatId,
  FlagId,
  BuildSpec,
  TowerSpec,
  TowerLevel,
  UpgradeLevel,
  BuildOption,
  Recipe,
} from './catalog';

export const VEIN_LABELS: Record<NodeKind, string> = {
  iron: 'Iron-rich vein',
  copper: 'Copper-rich vein',
  coal: 'Coal vein',
};

// What actually comes out of a vein per swing. Iron and copper veins cross-yield
// each other 25% of the time; coal still sheds stone rubble.
export const VEIN_YIELDS: Record<
  NodeKind,
  { primary: ResourceId; primaryChance: number; stoneChance: number; strays: ResourceId[] }
> = {
  iron: { primary: 'ironOre', primaryChance: 0.75, stoneChance: 0, strays: ['copperOre'] },
  copper: { primary: 'copperOre', primaryChance: 0.75, stoneChance: 0, strays: ['ironOre'] },
  coal: { primary: 'coal', primaryChance: 0.8, stoneChance: 0.2, strays: [] },
};

// Byproduct chances of refinement steps
export const ANVIL_STONE_CHANCE = 0.5; // per ore broken
export const SMELT_STONE_CHANCE = 0.35; // per ingot smelted

// Key world anchor points — refining chain reads left→right: dock → yard → anvil → forge
export const POS = {
  keep: { x: 18, z: 4 },
  dock: { x: -2, z: 2 },
  yard: { x: 3, z: 5 },
  anvil: { x: 8, z: 4.5 },
  forge: { x: 13, z: 8 },
  mine: { x: -50, z: -50 },
};

// The wall spans the canyon chokepoint between the flanking ridges.
// Enemies are drawn to the two gates; they never attack wall segments.
// Pushed far enough north that a deep strip behind the wall is free for towers.
export const WALL_Z = 22;
export const WALL_XS = [4, 12, 20];
export const GATE_XS = [8, 16];

export const ENEMY_SPAWNS = [
  { x: 6, z: 46 },
  { x: 12, z: 49 },
  { x: 18, z: 46 },
];

export const YARD_RADIUS = 5.5;

// Advancement-driven enemy scaling: each point of "advancement" (techs
// researched, towers standing) nudges waves up. Kept gentle on purpose.
export const ADV_TECH_WEIGHT = 1.5;
export const ADV_TOWER_WEIGHT = 0.6;
export const ADV_RUNNERS_PER_POINT = 0.5;
export const ADV_HP_PER_POINT = 0.045;
