import type { ResourceId } from './resources';
import type { RecipeDef } from './schema';

const RECIPES_RAW = {
  crushIron: {
    out: 'crushedIron',
    inputs: { ironOre: 1 },
    verb: 'Break iron ore',
  },
  crushCopper: {
    out: 'crushedCopper',
    inputs: { copperOre: 1 },
    verb: 'Break copper ore',
  },
  smeltIron: {
    out: 'ironIngot',
    inputs: { crushedIron: 1, coal: 1 },
    verb: 'Smelt iron',
  },
  smeltCopper: {
    out: 'copperIngot',
    inputs: { crushedCopper: 1, coal: 1 },
    verb: 'Smelt copper',
  },
  smeltSteel: {
    out: 'steelIngot',
    inputs: { ironIngot: 1, coal: 2 },
    verb: 'Smelt steel',
    time: 48,
  },
} satisfies Record<string, RecipeDef>;

export type RecipeId = keyof typeof RECIPES_RAW;
export const RECIPES: Record<RecipeId, RecipeDef> = RECIPES_RAW;
export const RECIPE_IDS = Object.keys(RECIPES) as RecipeId[];

/** Legacy Recipe shape used by station helpers. */
export interface Recipe {
  out: ResourceId;
  inputs: Partial<Record<ResourceId, number>>;
  verb: string;
  time?: number;
}

export function recipeById(id: RecipeId): Recipe {
  const r = RECIPES[id];
  return {
    out: r.out as ResourceId,
    inputs: r.inputs as Partial<Record<ResourceId, number>>,
    verb: r.verb,
    time: r.time,
  };
}

/** First recipe that produces this resource, if any. */
export function recipeIdForOut(out: string): RecipeId | null {
  for (const id of RECIPE_IDS) {
    if (RECIPES[id].out === out) return id;
  }
  return null;
}
