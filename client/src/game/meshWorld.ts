import * as THREE from 'three';
import { REACH_CART, type NodeKind, type ResourceId } from '@shared';
import { CRYSTAL_COLORS, NODE_COLORS, RES_COLORS } from './meshPalette';
import { box, cone, cyl, std } from './meshPrims';
import { radialGlow } from './meshOverlays';

export function makeOreNode(kind: NodeKind): THREE.Group {
  const g = new THREE.Group();
  const mat = std(NODE_COLORS[kind], { flatShading: true });
  const glint = std(kind === 'coal' ? '#17171c' : kind === 'iron' ? '#c98d64' : '#e89a55', {
    flatShading: true,
  });
  for (let i = 0; i < 4; i++) {
    const r = 0.5 + Math.random() * 0.45;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), i >= 2 ? glint : mat);
    rock.position.set((Math.random() - 0.5) * 1.6, r * 0.5, (Math.random() - 0.5) * 1.6);
    rock.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    rock.castShadow = true;
    g.add(rock);
  }
  // Crystals betray what the vein holds; they glow faintly so the mine
  // rewards scanning the dark for the next strike.
  const crystalMat = new THREE.MeshStandardMaterial({
    color: CRYSTAL_COLORS[kind],
    emissive: CRYSTAL_COLORS[kind],
    emissiveIntensity: kind === 'coal' ? 0.25 : 0.55,
    flatShading: true,
  });
  for (let i = 0; i < 5; i++) {
    const h = 0.35 + Math.random() * 0.5;
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.1 + Math.random() * 0.08, h, 5), crystalMat);
    const a = Math.random() * Math.PI * 2;
    const r = 0.35 + Math.random() * 0.85;
    c.position.set(Math.cos(a) * r, h * 0.35, Math.sin(a) * r);
    c.rotation.set((Math.random() - 0.5) * 0.9, Math.random() * 3, (Math.random() - 0.5) * 0.9);
    c.castShadow = true;
    g.add(c);
  }
  return g;
}

/** Floating name tag rendered from a small canvas. */
export function makeLabel(text: string, color = '#ffe2b0'): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.font = '600 26px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 8;
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 32);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }),
  );
  sprite.scale.set(4.2, 1.05, 1);
  sprite.renderOrder = 9;
  return sprite;
}

// ------------------------------------------------------------ mine dressing

export function makeMineEntrance(): THREE.Group {
  const g = new THREE.Group();
  const timber = std('#6b4a2c', { roughness: 1 });
  const dark = new THREE.MeshBasicMaterial({ color: '#08070a' });
  // Tunnel mouth
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(1.7, 16, 0, Math.PI), dark);
  mouth.position.set(0, 0.05, 0);
  g.add(mouth);
  // Timber portal frame
  g.add(box(0.35, 3.4, 0.35, timber, -1.9, 1.7, 0.1));
  g.add(box(0.35, 3.4, 0.35, timber, 1.9, 1.7, 0.1));
  g.add(box(4.6, 0.4, 0.5, timber, 0, 3.4, 0.1));
  g.add(box(5.2, 0.3, 0.9, std('#5f4a33'), 0, 3.75, 0));
  // Rock hood above the mouth
  const hood = new THREE.Mesh(new THREE.DodecahedronGeometry(2.4, 0), std('#7e786c', { flatShading: true }));
  hood.position.set(0, 3.4, -1.2);
  hood.scale.set(1.5, 0.9, 1);
  hood.castShadow = true;
  g.add(hood);
  return g;
}

export function makeLanternPost(): { group: THREE.Group; light: THREE.PointLight; flame: THREE.Mesh } {
  const g = new THREE.Group();
  g.add(box(0.14, 2.6, 0.14, std('#6b4a2c'), 0, 1.3, 0));
  g.add(box(0.9, 0.1, 0.1, std('#6b4a2c'), 0.35, 2.5, 0));
  const flameMat = new THREE.MeshStandardMaterial({
    color: '#ffca7a',
    emissive: '#ff9d3b',
    emissiveIntensity: 1.4,
  });
  const flame = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), flameMat);
  flame.position.set(0.7, 2.28, 0);
  g.add(flame);
  const cage = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.24, 0.4, 6, 1, true),
    new THREE.MeshStandardMaterial({ color: '#3a352e', side: THREE.DoubleSide }),
  );
  cage.position.copy(flame.position);
  g.add(cage);
  const light = new THREE.PointLight('#ffb35c', 0, 11, 2);
  light.position.set(0.7, 2.4, 0);
  g.add(light);
  return { group: g, light, flame };
}

/**
 * Gate torch: a tall brazier that throws real light over the approach so the
 * horde is visible before it reaches the doors.
 */
export function makeTorch(): {
  group: THREE.Group;
  light: THREE.PointLight;
  flame: THREE.Mesh;
  glow: THREE.Sprite;
} {
  const g = new THREE.Group();
  g.add(cyl(0.26, 0.4, 0.5, std('#8b857a', { flatShading: true }), 0, 0.25, 0, 8));
  g.add(cyl(0.1, 0.13, 2.6, std('#39352f', { metalness: 0.5, roughness: 0.55 }), 0, 1.8, 0, 8));
  g.add(cyl(0.44, 0.22, 0.42, std('#4a423a', { metalness: 0.45, roughness: 0.6 }), 0, 3.2, 0, 10));

  const coals = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 8, 6),
    new THREE.MeshStandardMaterial({ color: '#8c2f14', emissive: '#ff4a12', emissiveIntensity: 1.1 }),
  );
  coals.position.y = 3.36;
  coals.scale.y = 0.5;
  g.add(coals);

  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.29, 0.8, 7),
    new THREE.MeshStandardMaterial({
      color: '#ffd18f',
      emissive: '#ff8a2b',
      emissiveIntensity: 1.8,
      transparent: true,
      opacity: 0.94,
    }),
  );
  flame.position.y = 3.78;
  g.add(flame);

  // Additive halo: sells the light source from across the canyon
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: radialGlow(),
      color: '#ffb35c',
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  glow.scale.set(5.5, 5.5, 1);
  glow.position.y = 3.7;
  g.add(glow);

  const light = new THREE.PointLight('#ffb265', 0, 30, 2);
  light.position.set(0, 3.7, 0);
  g.add(light);

  return { group: g, light, flame, glow };
}

export function makeCrystalCluster(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: '#9fd8e8',
    emissive: '#57b7d4',
    emissiveIntensity: 0.5,
    flatShading: true,
  });
  const n = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const h = 0.4 + Math.random() * 0.8;
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.12 + Math.random() * 0.1, h, 5), mat);
    c.position.set((Math.random() - 0.5) * 0.9, h * 0.4, (Math.random() - 0.5) * 0.9);
    c.rotation.set((Math.random() - 0.5) * 0.8, Math.random() * 3, (Math.random() - 0.5) * 0.8);
    c.castShadow = true;
    g.add(c);
  }
  return g;
}

export function makePile(res: ResourceId): THREE.Group {
  const g = new THREE.Group();
  const color = RES_COLORS[res];

  // Distinct base pad so piles read as separate stock bins
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(1.15, 1.25, 0.12, 8),
    std('#6a6458', { flatShading: true }),
  );
  pad.position.y = 0.06;
  pad.receiveShadow = true;
  g.add(pad);

  if (res.endsWith('Ingot')) {
    const mat = std(color, { metalness: 0.55, roughness: 0.35 });
    for (let layer = 0; layer < 3; layer++) {
      for (let i = 0; i < 3 - layer; i++) {
        const bar = box(0.5, 0.16, 0.24, mat, (i - (2 - layer) / 2) * 0.55, 0.22 + layer * 0.18, 0);
        g.add(bar);
      }
    }
  } else if (res === 'coal') {
    for (let i = 0; i < 5; i++) {
      const lump = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.28 + (i % 3) * 0.08, 0),
        std(i % 2 ? '#2a2a32' : color, { flatShading: true }),
      );
      lump.position.set((i % 3 - 1) * 0.35, 0.35 + (i % 2) * 0.2, ((i * 0.7) % 3 - 1) * 0.3);
      lump.rotation.set(i, i * 1.3, 0);
      lump.castShadow = true;
      g.add(lump);
    }
  } else if (res === 'stone') {
    for (let i = 0; i < 4; i++) {
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.35 + (i % 2) * 0.1, 0),
        std(i % 2 ? '#8f8b80' : color, { flatShading: true }),
      );
      rock.position.set((i % 2 - 0.5) * 0.5, 0.35, (Math.floor(i / 2) - 0.5) * 0.5);
      rock.rotation.set(i * 0.8, i, 0);
      rock.castShadow = true;
      g.add(rock);
    }
  } else {
    // Raw / crushed ore cones with a tinted crystal spike so they stay readable
    const pile = cone(0.85, 0.9, std(color, { flatShading: true }), 0, 0.55, 0, 7);
    g.add(pile);
    if (res.startsWith('crushed')) {
      for (let i = 0; i < 3; i++) {
        const chip = box(0.2, 0.12, 0.18, std(color), (i - 1) * 0.35, 0.95, 0.1);
        g.add(chip);
      }
    }
  }

  // Floating marker plaque with a painted symbol
  const marker = makePileMarker(res);
  marker.position.set(0, 1.55, 0);
  g.add(marker);
  return g;
}

function makePileMarker(res: ResourceId): THREE.Group {
  const g = new THREE.Group();
  const post = box(0.08, 1.1, 0.08, std('#5a4630'), 0, 0.55, -0.95);
  g.add(post);
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 128);
  // plaque
  ctx.fillStyle = '#2a261e';
  ctx.strokeStyle = '#c9b896';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(22, 8);
  ctx.lineTo(106, 8);
  ctx.quadraticCurveTo(120, 8, 120, 22);
  ctx.lineTo(120, 106);
  ctx.quadraticCurveTo(120, 120, 106, 120);
  ctx.lineTo(22, 120);
  ctx.quadraticCurveTo(8, 120, 8, 106);
  ctx.lineTo(8, 22);
  ctx.quadraticCurveTo(8, 8, 22, 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // symbol
  ctx.fillStyle = RES_COLORS[res];
  ctx.strokeStyle = RES_COLORS[res];
  ctx.lineWidth = 8;
  ctx.lineJoin = 'round';
  if (res === 'coal') {
    ctx.beginPath();
    ctx.arc(50, 70, 22, 0, Math.PI * 2);
    ctx.arc(78, 58, 18, 0, Math.PI * 2);
    ctx.fill();
  } else if (res === 'stone') {
    ctx.beginPath();
    ctx.moveTo(30, 90);
    ctx.lineTo(40, 40);
    ctx.lineTo(70, 30);
    ctx.lineTo(100, 70);
    ctx.lineTo(80, 100);
    ctx.closePath();
    ctx.fill();
  } else if (res.endsWith('Ingot')) {
    ctx.beginPath();
    ctx.moveTo(28, 85);
    ctx.lineTo(40, 40);
    ctx.lineTo(100, 40);
    ctx.lineTo(110, 85);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(44, 48, 56, 10);
  } else if (res.startsWith('crushed')) {
    ctx.beginPath();
    ctx.moveTo(30, 95);
    ctx.lineTo(48, 50);
    ctx.lineTo(66, 95);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(62, 90);
    ctx.lineTo(80, 40);
    ctx.lineTo(98, 90);
    ctx.closePath();
    ctx.fill();
  } else {
    // raw ore nugget
    ctx.beginPath();
    ctx.moveTo(35, 85);
    ctx.lineTo(45, 40);
    ctx.lineTo(85, 35);
    ctx.lineTo(100, 75);
    ctx.lineTo(70, 100);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff6';
    ctx.beginPath();
    ctx.arc(60, 60, 10, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), mat);
  plate.position.set(0, 1.15, -0.95);
  g.add(plate);
  // slight back face so it reads from both sides
  const back = plate.clone();
  back.rotation.y = Math.PI;
  g.add(back);
  return g;
}

export function makeCartTrain(): {
  group: THREE.Group;
  front: THREE.Group;
  back: THREE.Group;
  load: THREE.Mesh;
  dumpRing: THREE.Mesh;
} {
  const group = new THREE.Group();
  const wood = std('#7a5231');
  const woodDark = std('#5f3f24');
  const metal = std('#4b4640', { metalness: 0.5, roughness: 0.5 });

  const mkBase = () => {
    const cart = new THREE.Group();
    const body = box(1.1, 0.55, 1.7, wood, 0, 0.62, 0);
    const rim = box(1.22, 0.12, 1.82, woodDark, 0, 0.92, 0);
    cart.add(body, rim);
    for (const sx of [-0.52, 0.52]) {
      for (const sz of [-0.55, 0.55]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.1, 10), metal);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(sx, 0.24, sz);
        wheel.castShadow = true;
        cart.add(wheel);
      }
    }
    return cart;
  };

  const front = mkBase(); // passenger cart
  const seat = box(0.8, 0.1, 0.5, woodDark, 0, 0.95, -0.35);
  const lever = box(0.06, 0.6, 0.06, metal, 0.35, 1.2, 0.5);
  front.add(seat, lever);

  const back = mkBase(); // ore cart
  const load = new THREE.Mesh(
    new THREE.ConeGeometry(0.55, 0.6, 7),
    std('#9a5f3f', { flatShading: true }),
  );
  load.position.y = 1.15;
  load.castShadow = true;
  load.visible = false;
  back.add(load);

  // Walk-over dump radius — follows the ore cart in syncCarts.
  const dumpRing = new THREE.Mesh(
    new THREE.RingGeometry(REACH_CART - 0.3, REACH_CART, 48),
    new THREE.MeshBasicMaterial({
      color: '#7ec8ff',
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  dumpRing.rotation.x = -Math.PI / 2;
  dumpRing.name = 'dumpRing';

  group.add(front, back, dumpRing);
  return { group, front, back, load, dumpRing };
}

export function makeTree(): THREE.Group {
  const g = new THREE.Group();
  const trunk = cyl(0.14, 0.2, 0.8, std('#7a5231'), 0, 0.4, 0, 6);
  const c1 = cone(1.0, 1.6, std('#5c8f46', { flatShading: true }), 0, 1.5, 0, 7);
  const c2 = cone(0.72, 1.3, std('#699e4b', { flatShading: true }), 0, 2.4, 0, 7);
  g.add(trunk, c1, c2);
  const s = 0.7 + Math.random() * 0.7;
  g.scale.set(s, s, s);
  g.rotation.y = Math.random() * Math.PI * 2;
  return g;
}

export function makeRock(): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.5 + Math.random() * 0.8, 0),
    std('#8f887a', { flatShading: true }),
  );
  m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
  m.castShadow = true;
  return m;
}

export function makeCloud(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 1,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });
  // Stash the shared material so the renderer can fade it near the camera.
  g.userData.cloudMat = mat;
  g.userData.baseOpacity = 0.72;
  const n = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < n; i++) {
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6 + Math.random() * 1.6, 0), mat);
    puff.position.set(i * 2.2 - n, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 1.5);
    puff.scale.y = 0.45;
    puff.castShadow = true;
    g.add(puff);
  }
  return g;
}

export function makeSpawnMarker(): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(1.3, 1.3, 7, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: '#ff3b30',
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  return m;
}

export function makeGhost(): { group: THREE.Group; body: THREE.Mesh; ring: THREE.Line } {
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(1.0, 1.2, 3.2, 10),
    new THREE.MeshStandardMaterial({ color: '#6fe08b', transparent: true, opacity: 0.45 }),
  );
  body.position.y = 1.6;
  const ringPts: THREE.Vector3[] = [];
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    ringPts.push(new THREE.Vector3(Math.cos(a), 0.1, Math.sin(a)));
  }
  const ring = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(ringPts),
    new THREE.LineBasicMaterial({ color: '#6fe08b', transparent: true, opacity: 0.6 }),
  );
  const group = new THREE.Group();
  group.add(body, ring);
  group.visible = false;
  return { group, body, ring };
}
