import * as THREE from 'three';
import type { EnemyKind } from '@shared';
import { PLAYER_COLORS } from './meshPalette';
import { box, cone, cyl, std } from './meshPrims';
import { radialGlow } from './meshOverlays';

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
