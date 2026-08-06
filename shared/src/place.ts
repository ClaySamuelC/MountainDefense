import type { BuildableType, WorldState } from './types';
import { POS, WALL_Z, YARD_RADIUS, getBuilding, hasCombat } from './constants';
import { terrainSlope } from './terrain';
import { distToRail } from './rail';

/**
 * Why a structure cannot be placed at (x, z), or null if it can.
 * Used by the host sim and the client ghost / feedback toasts.
 */
export function placeError(
  w: WorldState,
  x: number,
  z: number,
  footprint = 2.4,
  kind?: BuildableType,
): string | null {
  if (w.gameOver) return 'The keep has fallen';
  if (x < -16 || x > 34 || z < -6 || z > WALL_Z - 0.8) {
    return 'Build inside the walls';
  }
  if (terrainSlope(x, z) > 0.3) return 'Ground too steep';
  if (distToRail(x, z) < footprint) return 'Too close to the rail';
  if (Math.hypot(x - POS.yard.x, z - POS.yard.z) < YARD_RADIUS + footprint - 1.4) {
    return 'The yard needs room for ore piles';
  }
  if (kind) {
    const def = getBuilding(kind);
    const maxAlive = def?.place?.maxAlive;
    if (
      maxAlive != null &&
      w.buildings.filter((b) => b.type === kind && b.hp > 0).length >= maxAlive
    ) {
      const name = def?.name ?? 'building';
      return `One ${name.toLowerCase()} is enough — upgrade the one you have`;
    }
  }
  for (const b of w.buildings) {
    // Ruined towers don't block new builds on the same footprint.
    if (b.hp <= 0 && hasCombat(b.type)) continue;
    if (Math.hypot(x - b.x, z - b.z) < footprint) return 'Too close to another structure';
  }
  return null;
}

/** Can a structure be placed at (x, z)? */
export function canPlace(
  w: WorldState,
  x: number,
  z: number,
  footprint = 2.4,
  kind?: BuildableType,
): boolean {
  return placeError(w, x, z, footprint, kind) === null;
}
