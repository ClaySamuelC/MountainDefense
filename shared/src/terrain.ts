// Heightfield shared by sim and renderer so cart track, buildings and visuals agree.

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Ramp centerline from the plateau edge down to the base yard (matches stretched rail).
const RAMP_A = { x: -38, z: -35 };
const RAMP_B = { x: -4, z: 1 };
const RAMP_LEN2 =
  (RAMP_B.x - RAMP_A.x) * (RAMP_B.x - RAMP_A.x) + (RAMP_B.z - RAMP_A.z) * (RAMP_B.z - RAMP_A.z);

export const PLATEAU_H = 8;

// Chokepoint: two rocky flanks pinch the enemy approach into a canyon and the
// wall (z = WALL_Z) spans the gap, so there is no path around it.
// The flanks are asymmetric on purpose: the camera looks from +x/+z, so the
// eastern flank is a lower bluff pushed further north to never block the view,
// while the western flank is a tall cliff.
export const RIDGE_H = 8;
export const BLUFF_H = 4.5;

function ridgeHeight(x: number, z: number): number {
  // Ridges rise just past the wall so the courtyard behind it stays flat
  // and deep enough for a proper tower line.
  const west =
    RIDGE_H *
    smoothstep(20.0, 23.2, z) *
    (1 - smoothstep(33, 39, z)) *
    (1 - smoothstep(1.0, 4.2, x));
  const east =
    BLUFF_H *
    smoothstep(22.5, 25.5, z) *
    (1 - smoothstep(33, 39, z)) *
    smoothstep(19.8, 22.5, x);
  return Math.max(west, east);
}

/** True on the chokepoint flanks — players must not path around the wall here. */
export function isRidgeBlocked(x: number, z: number): boolean {
  return ridgeHeight(x, z) > 0.7;
}

export function terrainHeight(x: number, z: number): number {
  // Mountain plateau (NW) — centred on the stretched mine
  const md = Math.hypot(x + 50, z + 50);
  let h = PLATEAU_H * (1 - smoothstep(14, 32, md));

  // Decorative peak further NW (not gameplay-relevant)
  const pd = Math.hypot(x + 68, z + 68);
  h = Math.max(h, 13 * (1 - smoothstep(0, 20, pd)));

  // Chokepoint ridges flanking the gate corridor
  h = Math.max(h, ridgeHeight(x, z));

  // Carve/blend the cart ramp
  const dx = x - RAMP_A.x;
  const dz = z - RAMP_A.z;
  let t = (dx * (RAMP_B.x - RAMP_A.x) + dz * (RAMP_B.z - RAMP_A.z)) / RAMP_LEN2;
  t = Math.min(1, Math.max(0, t));
  const px = RAMP_A.x + t * (RAMP_B.x - RAMP_A.x);
  const pz = RAMP_A.z + t * (RAMP_B.z - RAMP_A.z);
  const d = Math.hypot(x - px, z - pz);
  const rampH = PLATEAU_H * (1 - t);
  const w = 1 - smoothstep(4.5, 8, d);
  if (w > 0) h = lerp(h, rampH, w);

  return h;
}

export function terrainSlope(x: number, z: number): number {
  const e = 0.6;
  const hx = terrainHeight(x + e, z) - terrainHeight(x - e, z);
  const hz = terrainHeight(x, z + e) - terrainHeight(x, z - e);
  return Math.hypot(hx, hz) / (2 * e);
}
