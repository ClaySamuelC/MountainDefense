import * as THREE from 'three';
import { POS, terrainHeight, terrainSlope, distToRail } from '@shared';

const C = {
  grass: new THREE.Color('#7cb257'),
  grassDark: new THREE.Color('#699e4b'),
  rock: new THREE.Color('#8f887a'),
  rockLight: new THREE.Color('#a9a294'),
  snow: new THREE.Color('#ddd8ce'),
  dirt: new THREE.Color('#a98a63'),
  gravel: new THREE.Color('#9b8f77'),
  sand: new THREE.Color('#cbb98f'),
};

function hash(x: number, z: number): number {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = Math.min(1, Math.max(0, t));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

function vertexColor(x: number, z: number, out: THREE.Color) {
  const h = terrainHeight(x, z);
  const slope = terrainSlope(x, z);
  const n = hash(Math.floor(x * 1.7), Math.floor(z * 1.7));

  out.copy(C.grass).lerp(C.grassDark, n * 0.7);

  // Rock on slopes and altitude
  if (h > 0.8) {
    const rockMix = Math.min(1, (h - 0.8) / 4 + Math.max(0, slope - 0.3) * 1.6);
    out.lerp(C.rock, Math.min(1, rockMix));
  }
  if (slope > 0.55) out.lerp(C.rock, 0.7);
  if (h > 7.2) out.lerp(C.rockLight, 0.55);
  if (h > 11) out.lerp(C.snow, Math.min(1, (h - 11) / 3));

  // Cart ramp corridor -> gravel
  const rampD = distToSegment(x, z, -28, -26, -4, 1);
  if (rampD < 5 && h > 0.2 && h < 8.2) out.lerp(C.gravel, 0.5 * (1 - rampD / 5));

  // Enemy approach: worn dirt trails funneling into the two gates
  const pd = Math.min(
    distToSegment(x, z, 6, 40, 8, 17),
    distToSegment(x, z, 18, 40, 16, 17),
    distToSegment(x, z, 12, 43, 12, 30),
    distToSegment(x, z, 8, 15, 11, 8),
    distToSegment(x, z, 16, 15, 13, 8),
  );
  if (pd < 4 && h < 0.5) out.lerp(C.dirt, 0.65 * (1 - pd / 4));

  // Base plaza + yard
  const plazaD = Math.hypot(x - POS.keep.x, z - POS.keep.z);
  if (plazaD < 7 && h < 0.5) out.lerp(C.sand, 0.7 * (1 - plazaD / 7));
  const yardD = Math.hypot(x - POS.yard.x, z - POS.yard.z);
  if (yardD < 4.5 && h < 0.5) out.lerp(C.dirt, 0.8 * (1 - yardD / 4.5));

  // subtle noise sparkle
  out.offsetHSL(0, 0, (n - 0.5) * 0.03);
}

export function buildTerrain(): THREE.Mesh {
  const size = 188;
  const segs = 180;
  let geo: THREE.BufferGeometry = new THREE.PlaneGeometry(size, size, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, terrainHeight(x, z));
  }
  geo = geo.toNonIndexed();
  geo.computeVertexNormals();

  // Per-face flat colors
  const p = geo.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i += 3) {
    const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
    const cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    vertexColor(cx, cz, c);
    for (let j = 0; j < 3; j++) {
      colors[(i + j) * 3] = c.r;
      colors[(i + j) * 3 + 1] = c.g;
      colors[(i + j) * 3 + 2] = c.b;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.95,
    metalness: 0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

/** Scatter positions for trees/rocks, respecting gameplay areas. */
export function scatterDecorations(): { trees: THREE.Vector3[]; rocks: THREE.Vector3[] } {
  const trees: THREE.Vector3[] = [];
  const rocks: THREE.Vector3[] = [];
  let attempts = 0;
  while (trees.length < 130 && attempts++ < 1600) {
    const x = (Math.random() * 2 - 1) * 58;
    const z = (Math.random() * 2 - 1) * 58;
    const h = terrainHeight(x, z);
    const slope = terrainSlope(x, z);
    if (h > 6.5 || slope > 0.5) continue;
    if (x > -20 && x < 38 && z > -10 && z < 20) continue; // base area
    if (z > 14 && x > 0 && x < 24) continue; // canyon corridor / enemy lane
    if (distToRail(x, z) < 4) continue;
    const rampD = distToSegment(x, z, -28, -26, -4, 1);
    if (rampD < 7) continue;
    trees.push(new THREE.Vector3(x, h, z));
  }
  attempts = 0;
  while (rocks.length < 45 && attempts++ < 900) {
    const x = -60 + Math.random() * 55;
    const z = -60 + Math.random() * 55;
    const h = terrainHeight(x, z);
    const slope = terrainSlope(x, z);
    if (h < 1 || h > 12 || slope < 0.25) continue;
    if (distToRail(x, z) < 3) continue;
    rocks.push(new THREE.Vector3(x, h, z));
  }
  return { trees, rocks };
}
