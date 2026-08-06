import * as THREE from 'three';
import { railPosAt, terrainHeight, type WorldState } from '@shared';
import type { InputManager } from '../input';
import type { makeLanternPost, makeTorch } from './meshes';
import type { TrackedEntity } from './gameTypes';
import { SHADOW_HALF, SHADOW_MAP, SUN_DIR, TMP_CENTER, TMP_RIGHT, TMP_UP } from './gameTypes';

export interface AtmosphereCtx {
  scene: THREE.Scene;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  camera: THREE.PerspectiveCamera;
  camTarget: THREE.Vector3;
  camDist: number;
  myId: string;
  input: InputManager;
  buildings: Map<string, TrackedEntity>;
  enemies: Map<string, TrackedEntity>;
  spawnMarkers: THREE.Mesh[];
  lanterns: ReturnType<typeof makeLanternPost>[];
  torches: ReturnType<typeof makeTorch>[];
}

export function updateLighting(ctx: AtmosphereCtx, w: WorldState, _dt: number) {
  // Map phase to a 24h-style clock: day = 7.5h..19.5h, night = 19.5h..7.5h
  const hour =
    w.phase === 'day' ? 7.5 + w.phaseT * 12 : (19.5 + w.phaseT * 12) % 24;
  let night: number;
  if (hour >= 7.2 && hour <= 18) night = 0;
  else if (hour > 18 && hour < 21) night = (hour - 18) / 3;
  else if (hour >= 21 || hour < 4.5) night = 1;
  else night = Math.max(0, 1 - (hour - 4.5) / 2.7);

  const lerpC = (a: string, b: string, t: number) =>
    new THREE.Color(a).lerp(new THREE.Color(b), t);

  const skyC = lerpC('#cfe3f5', '#141a2c', night);
  ctx.scene.background = skyC;
  (ctx.scene.fog as THREE.Fog).color = skyC;
  (ctx.scene.fog as THREE.Fog).near = 140 - night * 50;
  (ctx.scene.fog as THREE.Fog).far = 340 - night * 80;

  ctx.sun.color = lerpC('#ffe8c0', '#8fa3ff', night);
  // dusk warmth
  if (night > 0.05 && night < 0.75) ctx.sun.color.lerp(new THREE.Color('#ff9d5c'), 0.5 - Math.abs(night - 0.4));
  // The sun is pinned in the sky and simply fades out after dusk. An arcing
  // light either made shadows crawl or, once quantized, snap between steps;
  // a fixed direction lets the shadow map be texel-snapped and stay steady.
  ctx.sun.intensity = 1.7 * (1 - night) + 0.2 * night;
  // Ease the shadows out over dusk instead of switching them off in one frame.
  ctx.sun.shadow.intensity = Math.max(0, 1 - night * 1.5);
  ctx.sun.castShadow = ctx.sun.shadow.intensity > 0.01;

  // Shadow frustum follows the camera, snapped to whole texels along the two
  // axes across the light direction so shadow edges don't shimmer while panning.
  const texel = (SHADOW_HALF * 2) / SHADOW_MAP;
  const right = TMP_RIGHT.crossVectors(THREE.Object3D.DEFAULT_UP, SUN_DIR).normalize();
  const up = TMP_UP.crossVectors(SUN_DIR, right).normalize();
  const c = TMP_CENTER.set(ctx.camTarget.x, 0, ctx.camTarget.z);
  const dr = Math.round(c.dot(right) / texel) * texel;
  const du = Math.round(c.dot(up) / texel) * texel;
  const dl = c.dot(SUN_DIR);
  c.copy(right).multiplyScalar(dr).addScaledVector(up, du).addScaledVector(SUN_DIR, dl);
  ctx.sun.target.position.copy(c);
  ctx.sun.position.copy(c).addScaledVector(SUN_DIR, 150);
  ctx.sun.target.updateMatrixWorld();

  ctx.hemi.color = lerpC('#bfd9ff', '#37427a', night);
  ctx.hemi.groundColor = lerpC('#8a7f5f', '#232840', night);
  ctx.hemi.intensity = 0.9 - night * 0.22;

  const t = performance.now() / 1000;

  // Night-reactive emissives
  for (const [, ent] of ctx.buildings) {
    const win = ent.group.getObjectByName('window') as THREE.Mesh | undefined;
    if (win) (win.material as THREE.MeshStandardMaterial).emissiveIntensity = night * 1.6;
    ent.group.traverse((obj) => {
      if (obj.name !== 'gateFire') return;
      const m = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial;
      const flicker = 0.85 + Math.sin(t * 8 + obj.position.x) * 0.12;
      m.emissiveIntensity = night * 2.4 * flicker;
      obj.visible = night > 0.04;
      obj.scale.y = 0.85 + flicker * 0.3;
    });
  }
  for (const [, ent] of ctx.enemies) {
    const pulse = Math.sin(t * 3 + ent.group.position.x);
    const eye = ent.group.getObjectByName('eye') as THREE.Mesh | undefined;
    if (eye) {
      const m = eye.material as THREE.MeshStandardMaterial;
      m.emissiveIntensity = 1.4 + night * 5.5 + pulse * 0.4;
    }
    const threat = ent.group.getObjectByName('threat') as THREE.Mesh | undefined;
    if (threat) {
      const m = threat.material as THREE.MeshBasicMaterial;
      m.opacity = night * (0.34 + pulse * 0.05);
      threat.visible = m.opacity > 0.01;
    }
  }
  for (const m of ctx.spawnMarkers) {
    m.visible = w.phase === 'night' && !w.gameOver;
    (m.material as THREE.MeshBasicMaterial).opacity =
      0.1 + Math.abs(Math.sin(performance.now() / 400)) * 0.12;
  }

  // Mine lanterns glow warmer as the light fades, with a subtle flicker
  for (let i = 0; i < ctx.lanterns.length; i++) {
    const lantern = ctx.lanterns[i];
    const flicker = 0.85 + Math.sin(t * 9 + i * 2.4) * 0.08 + Math.sin(t * 23 + i) * 0.07;
    lantern.light.intensity = (2.5 + night * 9) * flicker;
    (lantern.flame.material as THREE.MeshStandardMaterial).emissiveIntensity =
      (0.9 + night * 1.3) * flicker;
  }

  // Gate torches: dead weight by day, the difference between seeing the
  // horde and guessing at it by night.
  for (let i = 0; i < ctx.torches.length; i++) {
    const torch = ctx.torches[i];
    const flicker = 0.86 + Math.sin(t * 7.5 + i * 1.9) * 0.09 + Math.sin(t * 19 + i * 3) * 0.06;
    torch.light.intensity = (1.2 + night * 26) * flicker;
    const flameMat = torch.flame.material as THREE.MeshStandardMaterial;
    flameMat.emissiveIntensity = (1.3 + night * 2.2) * flicker;
    torch.flame.scale.set(0.9 + flicker * 0.18, 0.85 + flicker * 0.32, 0.9 + flicker * 0.18);
    (torch.glow.material as THREE.SpriteMaterial).opacity = (0.05 + night * 0.42) * flicker;
  }
}

export function updateCamera(ctx: AtmosphereCtx, w: WorldState, dt: number) {
  const me = w.players.find((p) => p.id === ctx.myId);
  if (me) {
    let tx = me.x;
    let tz = me.z;
    if (me.riding) {
      const cart = w.carts.find((c) => c.id === me.riding);
      if (cart) {
        const p = railPosAt(cart.s);
        tx = p.x;
        tz = p.z;
      }
    }
    const ty = terrainHeight(tx, tz);
    const k = 1 - Math.exp(-4.5 * dt);
    ctx.camTarget.lerp(new THREE.Vector3(tx, ty, tz), k);
  }
  ctx.camDist = Math.max(28, Math.min(85, ctx.camDist + ctx.input.consumeZoom()));

  const dir = new THREE.Vector3(1, 1.18, 1).normalize();
  const desired = ctx.camTarget.clone().addScaledVector(dir, ctx.camDist);
  ctx.camera.position.lerp(desired, 1 - Math.exp(-6 * dt));
  ctx.camera.lookAt(ctx.camTarget.x, ctx.camTarget.y + 1.5, ctx.camTarget.z);
}
