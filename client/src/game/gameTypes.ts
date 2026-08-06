import * as THREE from 'three';
import { GATE_XS, WALL_Z, type ResourceId, type WorldState } from '@shared';
import type { makeHealthBar } from './meshes';

export interface SnapEntry {
  t: number;
  w: WorldState;
}

export const INTERP_DELAY = 130; // ms

/**
 * The sun never moves: a fixed direction is what lets the shadow map be snapped
 * to its own texel grid, which is the only reliable cure for crawling edges.
 * Points from the ground toward the sun — high and off to the side, so the faces
 * turned toward the camera stay lit while shadows still fall across the screen.
 */
export const SUN_DIR = new THREE.Vector3(-0.45, 0.72, 0.53).normalize();
export const SHADOW_HALF = 55;
export const SHADOW_MAP = 4096;
export const TMP_RIGHT = new THREE.Vector3();
export const TMP_UP = new THREE.Vector3();
export const TMP_CENTER = new THREE.Vector3();

// Stockpile bins — kept outside the cart's walk-over dump radius at the dock.
export const PILE_POS: Record<ResourceId, [number, number]> = {
  coal: [4.2, 6.8],
  stone: [2.8, 8.2],
  ironOre: [5.8, 5.4],
  copperOre: [7.4, 6.6],
  crushedIron: [4.0, 9.6],
  crushedCopper: [6.2, 9.8],
  ironIngot: [8.6, 8.0],
  copperIngot: [9.4, 5.8],
  steelIngot: [9.8, 9.2],
};

// Hand-placed mine dressing (lantern posts) on the stretched plateau
export const LANTERN_POS: [number, number][] = [
  [-52, -44],
  [-46, -48],
  [-55, -50],
  [-48, -55],
  [-58, -46],
];

// Torches flank each gate on the outside so the approach is lit at night.
export const TORCH_POS: [number, number][] = GATE_XS.flatMap(
  (gx) => [[gx - 2.9, WALL_Z + 2.3], [gx + 2.9, WALL_Z + 2.3]] as [number, number][],
);

export interface TrackedEntity {
  group: THREE.Group;
  hb?: ReturnType<typeof makeHealthBar>;
  extra?: any;
}
