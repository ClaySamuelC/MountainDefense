import type { BuildableType, Cost, NodeKind, ResourceId, StationType, TechId, Tier } from './types';

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

export const CART_CAP_BASE = 12;
export const CART_CAP_UP = 26;
export const CART_PUSH = 8.5;
export const CART_LOCO_PUSH = 11;
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

export interface TowerSpec {
  dmg: number;
  rate: number; // shots per second
  range: number;
  hp: number;
  cost: Cost;
}

export const TOWER_SPECS: Record<string, TowerSpec> = {
  'towerArrow:crude': {
    dmg: 5,
    rate: 0.8,
    range: 13,
    hp: 120,
    cost: { stone: 14 },
  },
  'towerArrow:refined': {
    dmg: 9,
    rate: 1.25,
    range: 15,
    hp: 200,
    cost: { ironIngot: 4 },
  },
  'towerBallista:refined': {
    dmg: 34,
    rate: 0.45,
    range: 21,
    hp: 260,
    cost: { steelIngot: 3, ironIngot: 2 },
  },
};

export function towerSpec(type: string, tier: Tier): TowerSpec | null {
  return TOWER_SPECS[`${type}:${tier}`] ?? null;
}

/** Per-tower field upgrades bought on the building (two steps past base). */
export interface TowerLevel {
  name: string;
  dmgMul: number;
  rateMul: number;
  rangeMul: number;
  /** Extra max HP granted when this level is reached. */
  hpBonus: number;
  /** Cost to buy this level from the previous one. Absent on level 1. */
  cost?: Partial<Record<ResourceId, number>>;
}

export const TOWER_LEVELS: Record<string, TowerLevel[]> = {
  'towerArrow:crude': [
    { name: 'Lashed', dmgMul: 1, rateMul: 1, rangeMul: 1, hpBonus: 0 },
    { name: 'Braced', dmgMul: 1.35, rateMul: 1.1, rangeMul: 1.1, hpBonus: 40, cost: { stone: 12 } },
    { name: 'Packed', dmgMul: 1.7, rateMul: 1.25, rangeMul: 1.2, hpBonus: 90, cost: { stone: 20 } },
  ],
  'towerArrow:refined': [
    { name: 'Tempered', dmgMul: 1, rateMul: 1, rangeMul: 1, hpBonus: 0 },
    { name: 'Sighted', dmgMul: 1.25, rateMul: 1.15, rangeMul: 1.2, hpBonus: 50, cost: { ironIngot: 3, stone: 8 } },
    { name: 'Volley', dmgMul: 1.5, rateMul: 1.4, rangeMul: 1.3, hpBonus: 110, cost: { ironIngot: 5, copperIngot: 2 } },
  ],
  'towerBallista:refined': [
    { name: 'Siege', dmgMul: 1, rateMul: 1, rangeMul: 1, hpBonus: 0 },
    { name: 'Wound', dmgMul: 1.3, rateMul: 1.1, rangeMul: 1.1, hpBonus: 60, cost: { steelIngot: 2, ironIngot: 2 } },
    { name: 'Breach', dmgMul: 1.6, rateMul: 1.25, rangeMul: 1.2, hpBonus: 140, cost: { steelIngot: 4, copperIngot: 3 } },
  ],
};

export function towerKey(type: string, tier: Tier | null): string {
  return `${type}:${tier ?? 'crude'}`;
}

export function towerLevels(type: string, tier: Tier | null): TowerLevel[] {
  return TOWER_LEVELS[towerKey(type, tier)] ?? TOWER_LEVELS['towerArrow:crude'];
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
  return towerLevels(type, tier)[level]?.cost ?? null;
}

/** Live combat stats for a tower at its current upgrade level. */
export function towerCombat(
  type: string,
  tier: Tier | null,
  level: number,
): { dmg: number; rate: number; range: number } | null {
  const base = towerSpec(type, tier ?? 'crude');
  if (!base) return null;
  const lvl = towerLevel(type, tier, level);
  return {
    dmg: base.dmg * lvl.dmgMul,
    rate: base.rate * lvl.rateMul,
    range: base.range * lvl.rangeMul,
  };
}

// ---------------------------------------------------------------- refining

/**
 * One hand-worked refining recipe. Stations run exactly the recipe the player
 * picked — they never fall back to a different output.
 */
export interface Recipe {
  out: ResourceId;
  inputs: Partial<Record<ResourceId, number>>;
  /** Short verb phrase for the hold-E prompt. */
  verb: string;
}

export const STATION_RECIPES: Record<StationType, Recipe[]> = {
  anvil: [
    { out: 'crushedIron', inputs: { ironOre: 1 }, verb: 'Break iron ore' },
    { out: 'crushedCopper', inputs: { copperOre: 1 }, verb: 'Break copper ore' },
  ],
  forge: [
    { out: 'ironIngot', inputs: { crushedIron: 1, coal: 1 }, verb: 'Smelt iron' },
    { out: 'copperIngot', inputs: { crushedCopper: 1, coal: 1 }, verb: 'Smelt copper' },
  ],
};

export const STATION_DEFAULT: Record<StationType, ResourceId> = {
  anvil: 'crushedIron',
  forge: 'ironIngot',
};

export function stationRecipes(station: StationType): Recipe[] {
  return STATION_RECIPES[station];
}

export function findRecipe(station: StationType, out: ResourceId | null): Recipe {
  const list = STATION_RECIPES[station];
  return list.find((r) => r.out === out) ?? list[0];
}

// ---------------------------------------------------------------- blast furnace

/** One charge of the blast furnace: what you shovel in for a single ingot. */
export const FURNACE_CHARGE: Partial<Record<ResourceId, number>> = { ironIngot: 1, coal: 2 };
/** Charges the furnace can hold at once. */
export const FURNACE_CAP = 6;
export const FURNACE_COST: Cost = { stone: 16, ironIngot: 5 };
export const FURNACE_HP = 320;
/** Footprint radius used when placing the furnace. */
export const FURNACE_FOOTPRINT = 3.2;

export interface FurnaceLevel {
  name: string;
  /** Seconds to turn one charge into a steel ingot. */
  time: number;
  /** Cost to reach this level from the previous one. Absent on level 1. */
  upgrade?: Partial<Record<ResourceId, number>>;
}

/**
 * The furnace runs unattended but starts painfully slow — a trickle of steel
 * you plan around, until you invest in the draught.
 */
export const FURNACE_LEVELS: FurnaceLevel[] = [
  { name: 'Cold Draught', time: 48 },
  { name: 'Forced Air', time: 25, upgrade: { ironIngot: 6, stone: 14 } },
  { name: 'Hot Blast', time: 11, upgrade: { steelIngot: 3, copperIngot: 6 } },
];

export function furnaceLevel(level: number): FurnaceLevel {
  return FURNACE_LEVELS[Math.max(0, Math.min(FURNACE_LEVELS.length - 1, level - 1))];
}

export function furnaceUpgradeCost(level: number): Partial<Record<ResourceId, number>> | null {
  return FURNACE_LEVELS[level]?.upgrade ?? null;
}

export interface BuildSpec {
  name: string;
  blurb: string;
  cost: Cost;
  hp: number;
  footprint: number;
  needsTech?: TechId;
}

export const BUILD_SPECS: Record<string, BuildSpec> = {
  'towerArrow:crude': {
    name: 'Crude Tower',
    blurb: 'Lashed logs and loose rock. Costs stone. Soft in a fight.',
    cost: TOWER_SPECS['towerArrow:crude'].cost,
    hp: TOWER_SPECS['towerArrow:crude'].hp,
    footprint: 2.4,
  },
  'towerArrow:refined': {
    name: 'Arrow Tower',
    blurb: 'Smelted iron frame. Faster and harder-hitting than crude.',
    cost: TOWER_SPECS['towerArrow:refined'].cost,
    hp: TOWER_SPECS['towerArrow:refined'].hp,
    footprint: 2.4,
  },
  'towerBallista:refined': {
    name: 'Ballista',
    blurb: 'Steel-armed siege killer. Built for brutes.',
    cost: TOWER_SPECS['towerBallista:refined'].cost,
    hp: TOWER_SPECS['towerBallista:refined'].hp,
    footprint: 2.4,
    needsTech: 'steel',
  },
  'blastFurnace:crude': {
    name: 'Blast Furnace',
    blurb: 'Load iron and coal, then leave it. Slow steel until you upgrade the draught.',
    cost: FURNACE_COST,
    hp: FURNACE_HP,
    footprint: FURNACE_FOOTPRINT,
    needsTech: 'steel',
  },
};

export function buildSpec(kind: BuildableType, tier: Tier): BuildSpec | null {
  return BUILD_SPECS[`${kind}:${tier}`] ?? null;
}

export interface TechDef {
  name: string;
  desc: string;
  branch: 'mining' | 'refining' | 'defense';
  cost: Partial<Record<ResourceId, number>>;
  time: number;
}

export const TECHS: Record<TechId, TechDef> = {
  sharpPick: {
    name: 'Sharpened Picks',
    desc: 'Mine and break ore 60% faster',
    branch: 'mining',
    cost: { ironIngot: 2 },
    time: 20,
  },
  cartCapacity: {
    name: 'Deep Hoppers',
    desc: 'Minecart holds 26 ore (was 12)',
    branch: 'mining',
    cost: { ironIngot: 2, copperIngot: 2 },
    time: 20,
  },
  locomotive: {
    name: 'Locomotive',
    desc: 'Cart drives itself; dock auto-unloads',
    branch: 'mining',
    cost: { steelIngot: 4, copperIngot: 3 },
    time: 30,
  },
  bellows: {
    name: 'Forge Bellows',
    desc: 'Smelt 60% faster; keeps a slow burn unattended',
    branch: 'refining',
    cost: { ironIngot: 4 },
    time: 20,
  },
  steel: {
    name: 'Steelworking',
    desc: 'Blast furnace plans: iron + coal into steel, unattended. Unlocks the Ballista',
    branch: 'refining',
    cost: { ironIngot: 3, copperIngot: 3 },
    time: 25,
  },
  reinforcedWalls: {
    name: 'Reinforced Walls',
    desc: 'Walls and gate +60% HP; repairs cost half',
    branch: 'defense',
    cost: { steelIngot: 3 },
    time: 25,
  },
};

export const RESOURCE_NAMES: Record<ResourceId, string> = {
  coal: 'Coal',
  stone: 'Stone',
  ironOre: 'Iron Ore',
  copperOre: 'Copper Ore',
  crushedIron: 'Crushed Iron',
  crushedCopper: 'Crushed Copper',
  ironIngot: 'Iron Ingot',
  copperIngot: 'Copper Ingot',
  steelIngot: 'Steel Ingot',
};

/** Short HUD tags so chips stay readable at a glance. */
export const RESOURCE_SHORT: Record<ResourceId, string> = {
  coal: 'Coal',
  stone: 'Stone',
  ironOre: 'Iron',
  copperOre: 'Copper',
  crushedIron: 'Cr.Fe',
  crushedCopper: 'Cr.Cu',
  ironIngot: 'Fe bar',
  copperIngot: 'Cu bar',
  steelIngot: 'Steel',
};

/** One-line "what is this for" shown when hovering a resource in the HUD. */
export const RESOURCE_HINTS: Record<ResourceId, string> = {
  coal: 'Fuel for the forge and the blast furnace. Mined from coal veins, or scraped off dead monsters.',
  stone: 'Rubble from mining and refining. Pays for crude towers, gate repairs and stone gun shots. Raw ore cannot substitute.',
  ironOre: 'Raw rock. Break it at the anvil to get crushed iron.',
  copperOre: 'Raw rock. Break it at the anvil to get crushed copper.',
  crushedIron: 'Ready for the forge. Smelt with coal into iron ingots.',
  crushedCopper: 'Ready for the forge. Smelt with coal into copper ingots.',
  ironIngot: 'Arrow towers, research, and charges for the blast furnace.',
  copperIngot: 'Research and furnace upgrades. Nothing else eats it.',
  steelIngot: 'Ballistas and reinforced walls. Only the blast furnace makes it.',
};

/** Where a resource sits in the refining chain — used to group the HUD row. */
export const RESOURCE_STAGE: Record<ResourceId, 'bulk' | 'raw' | 'crushed' | 'ingot'> = {
  stone: 'bulk',
  coal: 'bulk',
  ironOre: 'raw',
  copperOre: 'raw',
  crushedIron: 'crushed',
  crushedCopper: 'crushed',
  ironIngot: 'ingot',
  copperIngot: 'ingot',
  steelIngot: 'ingot',
};

export const STAGE_LABELS: Record<'bulk' | 'raw' | 'crushed' | 'ingot', string> = {
  bulk: 'Bulk',
  raw: 'Raw ore',
  crushed: 'Crushed',
  ingot: 'Ingots',
};

export const VEIN_LABELS: Record<NodeKind, string> = {
  iron: 'Iron-rich vein',
  copper: 'Copper-rich vein',
  coal: 'Coal vein',
};

// What actually comes out of a vein per swing. Iron and copper veins cross-yield
// each other 25% of the time; coal still sheds stone rubble.
export const VEIN_YIELDS: Record<NodeKind, { primary: ResourceId; primaryChance: number; stoneChance: number; strays: ResourceId[] }> = {
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
  techhub: { x: 22, z: 10 },
  mine: { x: -36, z: -36 },
};

// The wall spans the canyon chokepoint between the flanking ridges.
// Enemies are drawn to the two gates; they never attack wall segments.
// Pushed far enough north that a deep strip behind the wall is free for towers.
export const WALL_Z = 22;
export const WALL_XS = [4, 12, 20];
export const GATE_XS = [8, 16];
export const WALL_HP = 300;
export const GATE_HP = 420;
export const KEEP_HP = 600;

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
