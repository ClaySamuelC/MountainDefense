import * as THREE from 'three';
import type { BuildingType, Tier } from '@shared';
import { box, cone, cyl, std } from './meshPrims';

const STONE = '#a09a8e';
const WOOD = '#8a6238';

type MeshFactory = (intact: THREE.Group, tier: Tier | null) => void;

const MESH_BUILDERS: Record<BuildingType, MeshFactory> = {
  keep: (intact) => {
    const stone = std(STONE);
    const stoneDark = std('#7e786c');
    const roofMat = std('#b3543f');
    intact.add(box(4.4, 1.2, 4.4, stoneDark, 0, 0.6, 0));
    intact.add(box(3.2, 4.2, 3.2, stone, 0, 3.0, 0));
    const keepRoof = cone(2.6, 2.2, roofMat, 0, 6.2, 0, 4);
    keepRoof.rotation.y = Math.PI / 4;
    intact.add(keepRoof);
    const pole = box(0.08, 2.2, 0.08, stoneDark, 0, 8.2, 0);
    const flag = box(1.0, 0.55, 0.05, std('#d8b743'), 0.55, 8.7, 0);
    intact.add(pole, flag);
    const win = new THREE.MeshStandardMaterial({
      color: '#ffca7a',
      emissive: '#ff9d3b',
      emissiveIntensity: 0,
    });
    const w1 = box(0.4, 0.6, 0.1, win, 0.8, 3.4, 1.62);
    const w2 = box(0.4, 0.6, 0.1, win, -0.8, 3.4, 1.62);
    w1.name = 'window';
    w2.name = 'window';
    intact.add(w1, w2);
  },
  wall: (intact) => {
    const stone = std(STONE);
    const stoneDark = std('#7e786c');
    // Slightly short of a full 4m bay so wall ends don't z-fight gate towers.
    intact.add(box(3.2, 2.4, 1.15, stone, 0, 1.2, 0));
    for (let i = -1; i <= 1; i++) intact.add(box(0.7, 0.5, 1.15, stoneDark, i * 1.1, 2.65, 0));
  },
  gate: (intact) => {
    const stone = std(STONE);
    const stoneDark = std('#7e786c');
    const wood = std(WOOD);
    // Towers sit clear of neighboring wall segments; lintel slightly proud in Z
    // so it never shares a face with the wall tops.
    const gateStone = stone.clone();
    gateStone.polygonOffset = true;
    gateStone.polygonOffsetFactor = -1;
    gateStone.polygonOffsetUnits = -1;
    const gateDark = stoneDark.clone();
    gateDark.polygonOffset = true;
    gateDark.polygonOffsetFactor = -1;
    gateDark.polygonOffsetUnits = -1;
    intact.add(box(1.15, 3.4, 1.35, gateDark, -1.85, 1.7, 0));
    intact.add(box(1.15, 3.4, 1.35, gateDark, 1.85, 1.7, 0));
    intact.add(box(4.4, 0.95, 1.5, gateStone, 0, 3.75, 0.05));
    intact.add(box(2.4, 2.6, 0.25, wood, 0, 1.3, 0));
    // Watch braziers on the gate towers — lit at dusk with the wall torches
    const braMat = new THREE.MeshStandardMaterial({
      color: '#ffd18f',
      emissive: '#ff8a2b',
      emissiveIntensity: 0,
    });
    for (const sx of [-1.85, 1.85]) {
      intact.add(cyl(0.34, 0.2, 0.32, std('#4a423a', { metalness: 0.45 }), sx, 3.56, 0, 8));
      const bra = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.6, 6), braMat);
      bra.position.set(sx, 3.95, 0);
      bra.name = 'gateFire';
      intact.add(bra);
    }
  },
  anvil: (intact) => {
    const wood = std(WOOD);
    intact.add(cyl(0.55, 0.65, 0.6, wood, 0, 0.3, 0, 8));
    intact.add(box(0.9, 0.3, 0.4, std('#3f4147', { metalness: 0.6, roughness: 0.35 }), 0, 0.78, 0));
  },
  forge: (intact) => {
    const stone = std(STONE);
    const stoneDark = std('#7e786c');
    const roofMat = std('#b3543f');
    intact.add(box(2.6, 2.0, 2.4, stoneDark, 0, 1.0, 0));
    intact.add(cyl(0.35, 0.45, 1.6, stone, 0.8, 2.7, -0.6, 8));
    const fire = new THREE.MeshStandardMaterial({
      color: '#ff7b2d',
      emissive: '#ff5a1f',
      emissiveIntensity: 1.2,
    });
    const mouth = box(1.0, 0.8, 0.15, fire, 0, 0.7, 1.22);
    mouth.name = 'fire';
    intact.add(mouth);
    const forgeRoof = cone(1.9, 1.0, roofMat, 0, 2.5, 0, 4);
    forgeRoof.rotation.y = Math.PI / 4;
    intact.add(forgeRoof);
  },
  blastFurnace: (intact) => {
    const stoneDark = std('#7e786c');
    const wood = std(WOOD);
    const brick = std('#7a4636', { flatShading: true });
    const brickDark = std('#5b342a', { flatShading: true });
    const iron = std('#3c3733', { metalness: 0.55, roughness: 0.5 });

    intact.add(box(3.7, 0.5, 3.7, stoneDark, 0, 0.25, 0));
    intact.add(cyl(1.15, 1.55, 3.2, brick, 0, 2.1, 0, 12)); // tapered stack
    intact.add(cyl(1.5, 1.5, 0.26, iron, 0, 1.2, 0, 12)); // shrink bands
    intact.add(cyl(1.28, 1.28, 0.26, iron, 0, 3.0, 0, 12));
    intact.add(cyl(0.5, 0.64, 2.3, brickDark, 0, 4.85, 0, 10)); // chimney
    intact.add(cyl(0.68, 0.58, 0.3, iron, 0, 6.05, 0, 10));

    // Tap hole: glows with the melt inside
    const tapMat = new THREE.MeshStandardMaterial({
      color: '#ff9a3d',
      emissive: '#ff5218',
      emissiveIntensity: 0.4,
    });
    const tap = box(0.85, 0.62, 0.22, tapMat, 0, 0.9, 1.48);
    tap.name = 'furnaceFire';
    intact.add(tap);
    const trough = box(1.1, 0.16, 0.8, iron, 0, 0.6, 1.95);
    intact.add(trough);

    // Charging deck and ladder on the back shoulder
    intact.add(box(1.9, 0.16, 1.2, wood, -1.5, 3.3, -1.0));
    for (let i = 0; i < 5; i++) {
      intact.add(box(0.62, 0.09, 0.09, std('#6b4a2c'), -2.2, 0.5 + i * 0.62, -0.5));
    }
    intact.add(box(0.09, 2.9, 0.09, std('#6b4a2c'), -2.48, 1.75, -0.5));
    intact.add(box(0.09, 2.9, 0.09, std('#6b4a2c'), -1.92, 1.75, -0.5));
  },
  dock: (intact) => {
    const wood = std(WOOD);
    intact.add(box(4.2, 0.35, 3.2, wood, 0, 0.35, 0));
    for (const sx of [-1.8, 1.8]) {
      for (const sz of [-1.3, 1.3]) intact.add(box(0.25, 0.9, 0.25, std('#6b4a2c'), sx, 0.45, sz));
    }
    intact.add(box(0.2, 2.6, 0.2, std('#6b4a2c'), 1.6, 1.6, 0));
    intact.add(box(1.6, 0.18, 0.18, std('#6b4a2c'), 0.9, 2.8, 0));
  },
  towerArrow: (intact, tier) => {
    const stone = std(STONE);
    const stoneDark = std('#7e786c');
    const roofMat = std('#b3543f');
    if (tier === 'crude') {
      const logs = std('#8a6238', { roughness: 1 });
      intact.add(cyl(0.85, 1.0, 2.8, logs, 0, 1.4, 0, 8));
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        intact.add(box(0.16, 3.4, 0.16, std('#6b4a2c'), Math.cos(a) * 0.95, 1.7, Math.sin(a) * 0.95));
      }
      intact.add(cone(1.25, 0.9, std('#5f4a33'), 0, 3.6, 0, 6));
    } else {
      intact.add(cyl(0.95, 1.15, 3.2, stone, 0, 1.6, 0, 10));
      intact.add(cyl(1.15, 1.15, 0.4, stoneDark, 0, 3.3, 0, 10));
      intact.add(cone(1.1, 1.1, roofMat, 0, 4.1, 0, 6));
      intact.add(box(0.7, 0.5, 0.05, std('#4f8fdd'), 0, 2.4, 1.12));
    }
  },
  towerBallista: (intact) => {
    const stone = std(STONE);
    const wood = std(WOOD);
    intact.add(cyl(1.25, 1.5, 2.6, stone, 0, 1.3, 0, 10));
    intact.add(box(2.2, 0.25, 0.5, wood, 0, 2.9, 0));
    intact.add(box(0.4, 0.25, 1.9, wood, 0, 2.9, 0));
    intact.add(box(0.1, 0.5, 1.4, std('#4b4640', { metalness: 0.6 }), 0, 3.15, 0));
  },
};

export function makeBuilding(type: BuildingType, tier: Tier | null): THREE.Group {
  const g = new THREE.Group();
  const intact = new THREE.Group();
  intact.name = 'intact';
  const rubble = new THREE.Group();
  rubble.name = 'rubble';
  rubble.visible = false;

  const builder = MESH_BUILDERS[type];
  if (builder) builder(intact, tier);

  // Rubble
  const rubbleMat = std('#6f6a60', { flatShading: true });
  for (let i = 0; i < 4; i++) {
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4 + Math.random() * 0.35, 0), rubbleMat);
    r.position.set((Math.random() - 0.5) * 2.2, 0.3, (Math.random() - 0.5) * 1.6);
    r.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    r.castShadow = true;
    rubble.add(r);
  }

  g.add(intact, rubble);
  return g;
}
