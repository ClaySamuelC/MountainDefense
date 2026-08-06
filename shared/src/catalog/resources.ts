import type { ResourceDef } from './schema';

export const RESOURCES = {
  coal: {
    name: 'Coal',
    short: 'Coal',
    hint: 'Fuel for the forge and the blast furnace. Mined from coal veins, or scraped off dead monsters.',
    stage: 'bulk',
  },
  stone: {
    name: 'Stone',
    short: 'Stone',
    hint: 'Rubble from mining and refining. Pays for crude towers, gate repairs and stone gun shots. Raw ore cannot substitute.',
    stage: 'bulk',
  },
  ironOre: {
    name: 'Iron Ore',
    short: 'Iron',
    hint: 'Raw rock. Break it at the anvil to get crushed iron.',
    stage: 'raw',
  },
  copperOre: {
    name: 'Copper Ore',
    short: 'Copper',
    hint: 'Raw rock. Break it at the anvil to get crushed copper.',
    stage: 'raw',
  },
  crushedIron: {
    name: 'Crushed Iron',
    short: 'Cr.Fe',
    hint: 'Ready for the forge. Smelt with coal into iron ingots.',
    stage: 'crushed',
  },
  crushedCopper: {
    name: 'Crushed Copper',
    short: 'Cr.Cu',
    hint: 'Ready for the forge. Smelt with coal into copper ingots.',
    stage: 'crushed',
  },
  ironIngot: {
    name: 'Iron Ingot',
    short: 'Fe bar',
    hint: 'Arrow towers, research, and charges for the blast furnace.',
    stage: 'ingot',
  },
  copperIngot: {
    name: 'Copper Ingot',
    short: 'Cu bar',
    hint: 'Research and furnace upgrades. Nothing else eats it.',
    stage: 'ingot',
  },
  steelIngot: {
    name: 'Steel Ingot',
    short: 'Steel',
    hint: 'Ballistas and reinforced walls. Only the blast furnace makes it.',
    stage: 'ingot',
  },
} as const satisfies Record<string, ResourceDef>;

export type ResourceId = keyof typeof RESOURCES;

export const RESOURCE_IDS = Object.keys(RESOURCES) as ResourceId[];

function project<K extends 'name' | 'short' | 'hint' | 'stage'>(
  field: K,
): Record<ResourceId, (typeof RESOURCES)[ResourceId][K]> {
  const out = {} as Record<ResourceId, (typeof RESOURCES)[ResourceId][K]>;
  for (const id of RESOURCE_IDS) out[id] = RESOURCES[id][field];
  return out;
}

export const RESOURCE_NAMES = project('name');
export const RESOURCE_SHORT = project('short');
export const RESOURCE_HINTS = project('hint');
export const RESOURCE_STAGE = project('stage');

export const STAGE_LABELS: Record<string, string> = {
  bulk: 'Bulk',
  raw: 'Raw ore',
  crushed: 'Crushed',
  ingot: 'Ingots',
};
