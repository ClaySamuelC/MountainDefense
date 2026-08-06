import * as THREE from 'three';
import {
  BEAT_WINDOW,
  REACH_CART,
  type BuildingType,
  type EnemyKind,
  type NodeKind,
  type ResourceId,
  type Tier,
} from '@shared';

const std = (color: string, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, ...opts });

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function cyl(rt: number, rb: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 10) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function cone(r: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 8) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// ------------------------------------------------------------ palette
export const PLAYER_COLORS = ['#4f8fdd', '#dd6a4f', '#5cb85c', '#d8b743'];

export const RES_COLORS: Record<ResourceId, string> = {
  coal: '#33333a',
  stone: '#a8a49a',
  ironOre: '#9a5f3f',
  copperOre: '#c8763a',
  crushedIron: '#b07a54',
  crushedCopper: '#d9884d',
  ironIngot: '#b9bec7',
  copperIngot: '#d98a4a',
  steelIngot: '#7f93a8',
};

const CRYSTAL_COLORS: Record<NodeKind, string> = {
  iron: '#e0956a',
  copper: '#ffab5e',
  coal: '#54545e',
};

const NODE_COLORS: Record<NodeKind, string> = {
  iron: '#8f5636',
  copper: '#c8763a',
  coal: '#2e2e34',
};

// ------------------------------------------------------------ units

export function makePlayer(colorIdx: number): THREE.Group {
  const g = new THREE.Group();
  const color = PLAYER_COLORS[colorIdx % PLAYER_COLORS.length];
  const bodyMat = std(color);
  const body = cyl(0.34, 0.42, 0.85, bodyMat, 0, 0.55, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), std('#f0cfa7'));
  head.position.y = 1.3;
  head.castShadow = true;
  const hat = cone(0.34, 0.42, std(color), 0, 1.68, 0);

  const pick = new THREE.Group();
  const handle = box(0.07, 0.8, 0.07, std('#7a5231'), 0, 0.4, 0);
  const headP = box(0.5, 0.1, 0.1, std('#8b8f98', { metalness: 0.5, roughness: 0.4 }), 0, 0.78, 0);
  pick.add(handle, headP);
  pick.position.set(0.42, 0.55, 0.12);
  pick.rotation.z = -0.4;
  pick.name = 'pick';

  // Backpack that visibly piles up with ore as you carry more
  const pack = new THREE.Group();
  pack.name = 'pack';
  const sack = box(0.36, 0.42, 0.24, std('#6d5335'), 0, 0, 0);
  sack.name = 'sack';
  pack.add(sack);
  for (let i = 0; i < 4; i++) {
    const lump = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.11 + (i % 2) * 0.02, 0),
      std('#9a5f3f', { flatShading: true }),
    );
    lump.position.set(((i % 2) - 0.5) * 0.16, 0.26 + Math.floor(i / 2) * 0.16, ((i % 3) - 1) * 0.04);
    lump.rotation.set(i * 1.3, i * 2.1, 0);
    lump.castShadow = true;
    lump.name = `packItem${i}`;
    pack.add(lump);
  }
  pack.position.set(0, 0.8, -0.36);
  pack.visible = false;

  g.add(body, head, hat, pick, pack);
  return g;
}

export function makeEnemy(kind: EnemyKind): THREE.Group {
  const g = new THREE.Group();
  // Own materials per enemy: both are driven up at night so the horde is
  // readable well before it walks into the gate torchlight.
  const eyeMat = new THREE.MeshStandardMaterial({
    color: '#ff3b30',
    emissive: '#ff2a1c',
    emissiveIntensity: 2,
  });
  // Enemies turn to face the gates, which means their eyes point away from the
  // camera on the approach. A pool of light at their feet reads from any angle.
  const threat = new THREE.Mesh(
    new THREE.PlaneGeometry(kind === 'runner' ? 2.2 : 3, kind === 'runner' ? 2.2 : 3),
    new THREE.MeshBasicMaterial({
      map: radialGlow(),
      color: '#ff2d1a',
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  threat.rotation.x = -Math.PI / 2;
  threat.position.y = 0.06;
  threat.name = 'threat';
  g.add(threat);
  if (kind === 'runner') {
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), std('#3a3243'));
    body.scale.y = 0.8;
    body.position.y = 0.5;
    body.castShadow = true;
    const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.085, 6, 6), eyeMat);
    e1.position.set(0.18, 0.62, 0.42);
    e1.name = 'eye';
    const e2 = e1.clone();
    e2.position.x = -0.18;
    e2.name = 'eye';
    g.add(body, e1, e2);
  } else {
    const torso = box(1.3, 1.5, 0.95, std('#463455'), 0, 1.0, 0);
    const head = box(0.6, 0.5, 0.6, std('#3b2c48'), 0, 1.95, 0.1);
    const armL = box(0.35, 1.2, 0.35, std('#3b2c48'), -0.85, 0.9, 0);
    const armR = armL.clone();
    armR.position.x = 0.85;
    const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 6), eyeMat);
    e1.position.set(0.15, 2.0, 0.42);
    e1.name = 'eye';
    const e2 = e1.clone();
    e2.position.x = -0.15;
    e2.name = 'eye';
    g.add(torso, head, armL, armR, e1, e2);
  }
  return g;
}

export function makeProjectile(kind: 'bolt' | 'stone' = 'bolt'): THREE.Mesh {
  if (kind === 'stone') {
    return new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.16, 0),
      new THREE.MeshStandardMaterial({ color: '#b5b1a6', roughness: 0.8, flatShading: true }),
    );
  }
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.09, 0.6),
    new THREE.MeshStandardMaterial({
      color: '#ffd76a',
      emissive: '#ffb63b',
      emissiveIntensity: 1.6,
    }),
  );
  return m;
}

// ------------------------------------------------------------ world objects

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

/** Soft radial falloff, so additive halos read as light and not as squares. */
let glowTexture: THREE.CanvasTexture | null = null;

function radialGlow(): THREE.CanvasTexture {
  if (glowTexture) return glowTexture;
  const S = 128;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.5)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.16)');
  g.addColorStop(0.75, 'rgba(255,255,255,0.04)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  glowTexture = tex;
  return tex;
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

/**
 * Row of pips showing how many charges sit in the blast furnace. It has to be a
 * single sprite: separate sprites offset in world space would step diagonally
 * across the screen under the isometric camera.
 */
export function makeChargePips(count: number): { group: THREE.Group; set: (n: number) => void } {
  const W = 256;
  const H = 56;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;

  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }),
  );
  sprite.scale.set(1.7, 1.7 * (H / W), 1);
  sprite.renderOrder = 12;
  const group = new THREE.Group();
  group.add(sprite);

  let drawn = -1;
  const draw = (n: number) => {
    ctx.clearRect(0, 0, W, H);
    const pad = 6;
    const gap = 5;
    const pw = (W - pad * 2 - gap * (count - 1)) / count;
    for (let i = 0; i < count; i++) {
      const x = pad + i * (pw + gap);
      const lit = i < n;
      roundRect(ctx, x, pad + 8, pw, H - (pad + 8) * 2, 5);
      ctx.fillStyle = lit ? '#ffb043' : 'rgba(20,22,30,0.75)';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = lit ? 'rgba(255,225,170,0.85)' : 'rgba(255,255,255,0.16)';
      ctx.stroke();
    }
    tex.needsUpdate = true;
  };

  return {
    group,
    set(n: number) {
      const clamped = Math.max(0, Math.min(count, Math.round(n)));
      if (clamped !== drawn) {
        drawn = clamped;
        draw(clamped);
      }
    },
  };
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

// ------------------------------------------------------------ buildings

const STONE = '#a09a8e';
const WOOD = '#8a6238';

export function makeBuilding(type: BuildingType, tier: Tier | null): THREE.Group {
  const g = new THREE.Group();
  const intact = new THREE.Group();
  intact.name = 'intact';
  const rubble = new THREE.Group();
  rubble.name = 'rubble';
  rubble.visible = false;

  const stone = std(STONE);
  const stoneDark = std('#7e786c');
  const wood = std(WOOD);
  const roofMat = std('#b3543f');

  switch (type) {
    case 'keep': {
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
      break;
    }
    case 'wall': {
      // Slightly short of a full 4m bay so wall ends don't z-fight gate towers.
      intact.add(box(3.2, 2.4, 1.15, stone, 0, 1.2, 0));
      for (let i = -1; i <= 1; i++) intact.add(box(0.7, 0.5, 1.15, stoneDark, i * 1.1, 2.65, 0));
      break;
    }
    case 'gate': {
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
      break;
    }
    case 'anvil': {
      intact.add(cyl(0.55, 0.65, 0.6, wood, 0, 0.3, 0, 8));
      intact.add(box(0.9, 0.3, 0.4, std('#3f4147', { metalness: 0.6, roughness: 0.35 }), 0, 0.78, 0));
      break;
    }
    case 'forge': {
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
      break;
    }
    case 'blastFurnace': {
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
      break;
    }
    case 'techhub': {
      intact.add(box(2.8, 2.2, 2.8, stone, 0, 1.1, 0));
      const hubRoof = cone(2.2, 1.4, std('#5a7ea6'), 0, 2.9, 0, 4);
      hubRoof.rotation.y = Math.PI / 4;
      intact.add(hubRoof);
      const crystalMat = new THREE.MeshStandardMaterial({
        color: '#7fd8ff',
        emissive: '#3bb8ff',
        emissiveIntensity: 1.4,
      });
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), crystalMat);
      crystal.position.y = 4.3;
      crystal.name = 'crystal';
      intact.add(crystal);
      break;
    }
    case 'dock': {
      intact.add(box(4.2, 0.35, 3.2, wood, 0, 0.35, 0));
      for (const sx of [-1.8, 1.8]) {
        for (const sz of [-1.3, 1.3]) intact.add(box(0.25, 0.9, 0.25, std('#6b4a2c'), sx, 0.45, sz));
      }
      intact.add(box(0.2, 2.6, 0.2, std('#6b4a2c'), 1.6, 1.6, 0));
      intact.add(box(1.6, 0.18, 0.18, std('#6b4a2c'), 0.9, 2.8, 0));
      break;
    }
    case 'towerArrow': {
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
      break;
    }
    case 'towerBallista': {
      intact.add(cyl(1.25, 1.5, 2.6, stone, 0, 1.3, 0, 10));
      intact.add(box(2.2, 0.25, 0.5, wood, 0, 2.9, 0));
      intact.add(box(0.4, 0.25, 1.9, wood, 0, 2.9, 0));
      intact.add(box(0.1, 0.5, 1.4, std('#4b4640', { metalness: 0.6 }), 0, 3.15, 0));
      break;
    }
  }

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

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

/**
 * The static face of the timing bar: a dark rail with the beat window painted
 * on as a labelled green band. Drawn once, then reused by every work bar.
 */
let beatTrackTexture: THREE.CanvasTexture | null = null;

function beatTrack(): THREE.CanvasTexture {
  if (beatTrackTexture) return beatTrackTexture;
  const W = 512;
  const H = 128;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const pad = 8;
  const bodyH = 74;
  const bodyY = (H - bodyH) / 2;

  // Casing
  ctx.fillStyle = 'rgba(8,9,14,0.93)';
  roundRect(ctx, pad, bodyY, W - pad * 2, bodyH, 26);
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(255,255,255,0.26)';
  ctx.stroke();

  // Groove the needle runs along
  const gx = pad + 10;
  const gy = bodyY + 10;
  const gw = W - (pad + 10) * 2;
  const gh = bodyH - 20;
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  roundRect(ctx, gx, gy, gw, gh, 18);
  ctx.fill();

  // Beat window: the band you are aiming for, at the end of the sweep
  const zoneW = gw * BEAT_WINDOW;
  const zoneX = gx + gw - zoneW;
  ctx.save();
  roundRect(ctx, gx, gy, gw, gh, 18);
  ctx.clip();
  const grad = ctx.createLinearGradient(zoneX, 0, gx + gw, 0);
  grad.addColorStop(0, 'rgba(74,226,144,0.30)');
  grad.addColorStop(1, 'rgba(74,226,144,0.70)');
  ctx.fillStyle = grad;
  ctx.fillRect(zoneX, gy, zoneW, gh);
  // Hard leading edge so the moment to click is unmistakable
  ctx.fillStyle = '#b6ffd4';
  ctx.fillRect(zoneX - 2, gy, 5, gh);
  ctx.restore();

  ctx.font = '800 30px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(6,26,15,0.85)';
  ctx.fillText('HIT', zoneX + zoneW / 2, H / 2 + 1);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  beatTrackTexture = tex;
  return tex;
}

const BAR_W = 2.5;
const BAR_H = BAR_W * (128 / 512);
/** Usable travel inside the casing, matching the groove in the texture. */
const BAR_INNER = BAR_W * ((512 - 36) / 512);

function flatSprite(color: string, opacity = 1): THREE.Sprite {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({ color, depthTest: false, transparent: true, opacity }),
  );
  return s;
}

/**
 * Timing bar above a working player. A needle sweeps the rail left to right
 * and the green band at the end is the window to click in; the band lights up
 * while the needle is inside it and locks gold once the beat is banked.
 */
export function makeWorkBar(): {
  group: THREE.Group;
  set: (
    pct: number | null,
    opts?: { beatWindow?: number; beatHit?: boolean; penalty?: boolean },
  ) => void;
  pop: (good?: boolean) => void;
  update: (dt: number) => void;
} {
  const group = new THREE.Group();

  const track = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: beatTrack(), depthTest: false, transparent: true }),
  );
  track.scale.set(BAR_W, BAR_H, 1);
  track.renderOrder = 20;

  // Progress trail behind the needle
  const fill = flatSprite('#ffc357', 0.42);
  fill.center.set(0, 0.5);
  fill.position.x = -BAR_INNER / 2;
  fill.scale.set(0.001, BAR_H * 0.42, 1);
  fill.renderOrder = 21;

  // Brightens while the needle sits in the window
  const zone = flatSprite('#8dffc0', 0);
  zone.scale.set(BAR_INNER * BEAT_WINDOW, BAR_H * 0.5, 1);
  zone.position.x = (BAR_INNER * (1 - BEAT_WINDOW)) / 2;
  zone.renderOrder = 22;

  const needle = flatSprite('#ffffff', 1);
  needle.scale.set(0.075, BAR_H * 0.66, 1);
  needle.renderOrder = 24;

  const glow = flatSprite('#ffffff', 0);
  glow.scale.set(BAR_W, BAR_H, 1);
  glow.renderOrder = 25;

  group.add(track, fill, zone, needle, glow);
  group.visible = false;

  const trackMat = track.material as THREE.SpriteMaterial;
  const fillMat = fill.material as THREE.SpriteMaterial;
  const zoneMat = zone.material as THREE.SpriteMaterial;
  const needleMat = needle.material as THREE.SpriteMaterial;
  const glowMat = glow.material as THREE.SpriteMaterial;

  const penaltyTint = new THREE.Color('#ffb0a0');
  let flash = 0;
  let flashGood = true;

  return {
    group,
    set(pct, opts) {
      if (pct === null) {
        if (flash <= 0) group.visible = false;
        return;
      }
      group.visible = true;
      const p = Math.max(0, Math.min(1, pct));
      const bw = opts?.beatWindow ?? 0;
      const inWindow = bw > 0 && p >= 1 - bw;
      const banked = !!opts?.beatHit;

      trackMat.color.set('#ffffff');
      if (opts?.penalty) trackMat.color.copy(penaltyTint);

      fill.scale.x = Math.max(0.001, BAR_INNER * p);
      fillMat.color.set(banked ? '#ffe08a' : '#ffc357');

      needle.position.x = -BAR_INNER / 2 + BAR_INNER * p;
      needle.visible = bw > 0;
      needleMat.color.set(banked ? '#fff3c4' : inWindow ? '#eaffef' : '#ffffff');

      if (banked) {
        zoneMat.color.set('#ffd76a');
        zoneMat.opacity = 0.5 + Math.sin(performance.now() / 120) * 0.12;
      } else if (inWindow) {
        zoneMat.color.set('#8dffc0');
        zoneMat.opacity = 0.42 + Math.sin(performance.now() / 70) * 0.16;
      } else {
        zoneMat.opacity = 0;
      }
      zone.visible = bw > 0;
    },
    pop(good = true) {
      flash = good ? 0.3 : 0.22;
      flashGood = good;
      group.visible = true;
    },
    update(dt: number) {
      if (flash <= 0) return;
      flash = Math.max(0, flash - dt);
      const t = flash / 0.3;
      glowMat.color.set(flashGood ? '#ffffff' : '#ff7a5c');
      glowMat.opacity = t * (flashGood ? 0.75 : 0.6);
      const s = 1 + t * (flashGood ? 0.16 : 0.06);
      // A miss shudders sideways; a hit swells.
      group.scale.set(s, s, 1);
      group.position.x = flashGood ? 0 : Math.sin(flash * 90) * 0.06;
      if (flash <= 0) {
        glowMat.opacity = 0;
        group.scale.set(1, 1, 1);
        group.position.x = 0;
      }
    },
  };
}

/**
 * Inverted-hull glow outline for an interactable object. Clones the target's
 * meshes, flips them inside out, and tints them gold.
 */
export function makeOutline(source: THREE.Group, color = '#ffd76a'): THREE.Group {
  const outline = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    color,
    side: THREE.BackSide,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  source.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(source.matrixWorld).invert();
  source.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || !obj.visible) return;
    if (obj.parent && !obj.parent.visible) return;
    const m = new THREE.Mesh(obj.geometry, mat);
    m.matrixAutoUpdate = false;
    m.matrix.multiplyMatrices(inv, obj.matrixWorld);
    // grow slightly around the mesh's own center
    const scale = new THREE.Matrix4().makeScale(1.07, 1.07, 1.07);
    m.matrix.multiply(scale);
    outline.add(m);
  });
  outline.renderOrder = 1;
  return outline;
}

/** Crisp pill health bar drawn on a canvas texture so edges stay clean. */
export function makeHealthBar(width = 1.6): {
  group: THREE.Group;
  set: (pct: number) => void;
} {
  const W = 128;
  const H = 18;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(width, width * (H / W) * 1.15, 1);
  sprite.renderOrder = 12;
  const group = new THREE.Group();
  group.add(sprite);
  group.renderOrder = 12;

  const paint = (pct: number) => {
    const p = Math.max(0, Math.min(1, pct));
    ctx.clearRect(0, 0, W, H);
    const pad = 1.5;
    const rr = H / 2 - pad;
    // Track
    ctx.fillStyle = 'rgba(12, 14, 18, 0.78)';
    roundRect(ctx, pad, pad, W - pad * 2, H - pad * 2, rr);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, pad, pad, W - pad * 2, H - pad * 2, rr);
    ctx.stroke();
    // Fill
    const innerPad = 3.2;
    const maxW = W - innerPad * 2;
    const fillW = Math.max(0, maxW * p);
    if (fillW > 0.5) {
      const hue = 110 * p; // red → green
      const grad = ctx.createLinearGradient(innerPad, 0, innerPad + fillW, 0);
      grad.addColorStop(0, `hsl(${hue}, 72%, 42%)`);
      grad.addColorStop(1, `hsl(${hue + 12}, 78%, 54%)`);
      ctx.fillStyle = grad;
      roundRect(ctx, innerPad, innerPad, fillW, H - innerPad * 2, (H - innerPad * 2) / 2);
      ctx.fill();
    }
    tex.needsUpdate = true;
  };
  paint(1);

  return {
    group,
    set(pct: number) {
      const p = Math.max(0, Math.min(1, pct));
      paint(p);
      group.visible = p < 0.999;
    },
  };
}
