import * as THREE from 'three';
import { RAIL_LENGTH, railPosAt, railTangentAt } from '@shared';

export function buildTrack(): THREE.Group {
  const group = new THREE.Group();

  // Two rails as tubes along offset curves
  const mkRail = (side: number) => {
    const pts: THREE.Vector3[] = [];
    const steps = 160;
    for (let i = 0; i <= steps; i++) {
      const s = (i / steps) * RAIL_LENGTH;
      const p = railPosAt(s);
      const t = railTangentAt(s);
      // horizontal perpendicular
      const px = -t.z;
      const pz = t.x;
      const len = Math.hypot(px, pz) || 1;
      pts.push(new THREE.Vector3(p.x + (px / len) * 0.38 * side, p.y + 0.12, p.z + (pz / len) * 0.38 * side));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, 200, 0.07, 6, false);
    const mat = new THREE.MeshStandardMaterial({ color: '#5a5148', roughness: 0.6, metalness: 0.5 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    return mesh;
  };
  group.add(mkRail(1), mkRail(-1));

  // Ties
  const tieCount = Math.floor(RAIL_LENGTH / 0.95);
  const tieGeo = new THREE.BoxGeometry(1.15, 0.09, 0.32);
  const tieMat = new THREE.MeshStandardMaterial({ color: '#7a5c3d', roughness: 0.9 });
  const ties = new THREE.InstancedMesh(tieGeo, tieMat, tieCount);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < tieCount; i++) {
    const s = (i + 0.5) * 0.95;
    const p = railPosAt(s);
    const t = railTangentAt(s);
    const yaw = Math.atan2(t.x, t.z);
    q.setFromAxisAngle(up, yaw);
    m.compose(new THREE.Vector3(p.x, p.y + 0.05, p.z), q, new THREE.Vector3(1, 1, 1));
    ties.setMatrixAt(i, m);
  }
  ties.receiveShadow = true;
  group.add(ties);

  // Buffer stops at both ends
  const stopMat = new THREE.MeshStandardMaterial({ color: '#6b4a2c', roughness: 0.9 });
  for (const s of [0, RAIL_LENGTH]) {
    const p = railPosAt(s);
    const t = railTangentAt(s);
    const stop = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 0.4), stopMat);
    stop.position.set(p.x, p.y + 0.5, p.z);
    stop.rotation.y = Math.atan2(t.x, t.z);
    stop.castShadow = true;
    group.add(stop);
  }

  return group;
}
