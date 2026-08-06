import type { TechDef } from './schema';

const TECHS_RAW = {
  sharpPick: {
    name: 'Sharpened Picks',
    desc: 'Mine and break ore 60% faster',
    branch: 'mining',
    cost: { ironIngot: 2 },
    time: 20,
    effects: [
      { op: 'mulStat', stat: 'mineWorkSpeed', value: 1.6 },
      { op: 'mulStat', stat: 'anvilWorkSpeed', value: 1.6 },
    ],
  },
  cartCapacity: {
    name: 'Deep Hoppers',
    desc: 'Minecart holds 14 more ore',
    branch: 'mining',
    cost: { ironIngot: 2, copperIngot: 2 },
    time: 20,
    effects: [{ op: 'addStat', stat: 'cartCap', value: 14 }],
  },
  locomotive: {
    name: 'Locomotive',
    desc: 'Cart drives itself; dock auto-unloads',
    branch: 'mining',
    cost: { steelIngot: 4, copperIngot: 3 },
    time: 30,
    effects: [{ op: 'flag', flag: 'locomotive' }],
  },
  bellows: {
    name: 'Forge Bellows',
    desc: 'Smelt 60% faster; keeps a slow burn unattended',
    branch: 'refining',
    cost: { ironIngot: 4 },
    time: 20,
    effects: [
      { op: 'mulStat', stat: 'forgeSpeed', value: 1.6 },
      { op: 'flag', flag: 'forgeSlowBurn' },
    ],
  },
  steel: {
    name: 'Steelworking',
    desc: 'Blast furnace plans: iron + coal into steel, unattended. Unlocks the Ballista',
    branch: 'refining',
    cost: { ironIngot: 3, copperIngot: 3 },
    time: 25,
    effects: [
      { op: 'unlockBuilding', building: 'blastFurnace' },
      { op: 'unlockBuilding', building: 'towerBallista' },
      { op: 'unlockRecipe', recipe: 'smeltSteel' },
    ],
  },
  reinforcedWalls: {
    name: 'Reinforced Walls',
    desc: 'Walls and gate +60% HP; repairs cost half',
    branch: 'defense',
    cost: { steelIngot: 3 },
    time: 25,
    effects: [
      { op: 'mulStat', stat: 'repairCost', value: 0.5 },
      {
        op: 'modBuildingStat',
        building: { tag: 'fortification' },
        stat: 'maxHp',
        mul: 1.6,
      },
    ],
  },
} satisfies Record<string, TechDef>;

export type TechId = keyof typeof TECHS_RAW;
export const TECHS: Record<TechId, TechDef> = TECHS_RAW;
export const TECH_IDS = Object.keys(TECHS) as TechId[];

/** Typed view — optional fields like `requires` are always readable. */
export function techDef(id: TechId): TechDef {
  return TECHS[id];
}

export const TECH_BRANCH_LABELS: Record<string, string> = {
  mining: 'Mining & Haul',
  refining: 'Refining',
  defense: 'Defense',
};
