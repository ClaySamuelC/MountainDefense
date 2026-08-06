# Content catalog

TypeScript registries for resources, recipes, buildings, and techs. Adding normal content should not require new sim `switch` / `if (w.techs…)` branches.

`assertCatalogValid()` runs from `createWorld()` and smoke tests. Every schema field that authors can set must drive sim behavior (or be removed).

## Authoring checklist

1. **Resource** → `resources.ts` — client `Record<ResourceId, …>` maps (icons, colors, piles) fail typecheck until filled
2. **Recipe** → `recipes.ts`, reference from a building `industry.recipes` (gated recipes need `unlockRecipe` on a tech)
3. **Building** → `buildings.ts` with only the capability bags it needs + a mesh factory entry keyed by building id
4. **Research** → `techs.ts` with `requires` + `effects` only
5. If no `Effect` op fits → add one op + interpreter case in `effects.ts` **once**, or a `flag` + one focused sim branch

Placeable buildings and attended stations are **derived** from capabilities (`place`, `tags: station` + `industry.mode === 'attended'`). Do not hand-maintain type lists.

## Effect ops (all live)

| Op | Behavior |
|----|----------|
| `mulStat` / `addStat` | Live via `stat(w, id)` |
| `unlockBuilding` | Gates build menu / `buildingUnlocked` |
| `unlockRecipe` | Gates station/furnace recipe use via `recipeUnlocked` |
| `modBuildingStat` (`maxHp`) | One-shot HP bump on tech unlock |
| `flag` | `locomotive`, `forgeSlowBurn` |

## Capability bags (sim reads these)

- `place` — build menu + placement
- `combat` — towers (including `projectile`)
- `industry.mode` — `attended` / `charge` (+ `charge` / `chargeCap`)
- `logistics.autoUnloadRate` — locomotive dock unload
- `tags: fortification` — repair/rebuild targeting + HP mods

## Anti-pattern

Do not add `if (w.techs.xyz.unlocked)` outside `effects.ts` / flag handlers. Use `stat()`, `hasFlag()`, `buildingUnlocked()`, or `recipeUnlocked()`.

## Saves

Bump `SAVE_VERSION` in `client/src/net/save.ts` when `WorldState` shape or removed catalog IDs break old blobs. Additive resource/tech IDs are filled by sanitize; entity field defaults are applied there too.
