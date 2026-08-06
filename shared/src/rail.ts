import { terrainHeight } from './terrain';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Dock end stays put; everything else stretches 40% farther into the mountain. */
const DOCK_XZ: [number, number] = [-2, 2];
const MINE_STRETCH = 1.4;

const CONTROL_XZ_BASE: [number, number][] = [
  [-40, -36],
  [-37, -33],
  [-34, -30],
  [-30, -27],
  [-26, -24],
  [-22, -20],
  [-18, -15],
  [-14, -10],
  [-10, -5],
  [-7, -1],
  [-4, 1],
  [-2, 2],
];

const CONTROL_XZ: [number, number][] = CONTROL_XZ_BASE.map(([x, z], i) => {
  if (i === CONTROL_XZ_BASE.length - 1) return [x, z];
  return [
    DOCK_XZ[0] + (x - DOCK_XZ[0]) * MINE_STRETCH,
    DOCK_XZ[1] + (z - DOCK_XZ[1]) * MINE_STRETCH,
  ];
});

const SAMPLES = 900;

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

const points: Vec3[] = CONTROL_XZ.map(([x, z]) => ({
  x,
  y: terrainHeight(x, z) + 0.18,
  z,
}));

const samples: Vec3[] = [];
const cumLen: number[] = [];

(function build() {
  const n = points.length;
  const get = (i: number) => points[Math.min(n - 1, Math.max(0, i))];
  let prev: Vec3 | null = null;
  let total = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const u = (i / (SAMPLES - 1)) * (n - 1);
    const seg = Math.min(n - 2, Math.floor(u));
    const t = u - seg;
    const p0 = get(seg - 1);
    const p1 = get(seg);
    const p2 = get(seg + 1);
    const p3 = get(seg + 2);
    const p: Vec3 = {
      x: catmullRom(p0.x, p1.x, p2.x, p3.x, t),
      y: catmullRom(p0.y, p1.y, p2.y, p3.y, t),
      z: catmullRom(p0.z, p1.z, p2.z, p3.z, t),
    };
    if (prev) total += Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z);
    samples.push(p);
    cumLen.push(total);
    prev = p;
  }
})();

export const RAIL_LENGTH = cumLen[cumLen.length - 1];

export function railPosAt(s: number): Vec3 {
  const target = Math.min(RAIL_LENGTH, Math.max(0, s));
  let lo = 0;
  let hi = cumLen.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cumLen[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  const i = Math.max(1, lo);
  const l0 = cumLen[i - 1];
  const l1 = cumLen[i];
  const t = l1 > l0 ? (target - l0) / (l1 - l0) : 0;
  const a = samples[i - 1];
  const b = samples[i];
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

export function railTangentAt(s: number): Vec3 {
  const a = railPosAt(s - 0.4);
  const b = railPosAt(s + 0.4);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  return { x: dx / len, y: dy / len, z: dz / len };
}

/** dy per meter of track (negative = downhill toward the dock). */
export function railGradeAt(s: number): number {
  const a = railPosAt(s - 0.6);
  const b = railPosAt(s + 0.6);
  const run = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  return (b.y - a.y) / run;
}

/** Approximate horizontal distance from a point to the rail curve. */
export function distToRail(x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < samples.length; i += 6) {
    const p = samples[i];
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < best) best = d;
  }
  return best;
}

/** Raw polyline for the renderer. */
export function railSamples(): Vec3[] {
  return samples;
}
