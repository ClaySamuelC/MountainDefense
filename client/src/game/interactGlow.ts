import * as THREE from 'three';
import {
  CARRY_CAP,
  cartCap,
  getContext,
  type WorkContext,
  type WorldState,
} from '@shared';
import { store } from '../ui/store';
import { makeCartTrain, makeOutline } from './meshes';
import type { TrackedEntity } from './gameTypes';

export interface InteractGlowCtx {
  scene: THREE.Scene;
  myId: string;
  nodes: Map<string, TrackedEntity>;
  carts: Map<string, ReturnType<typeof makeCartTrain>>;
  buildings: Map<string, TrackedEntity>;
  outline: THREE.Group | null;
  outlineKey: string;
  outlineTarget: THREE.Group | null;
  yardRing: THREE.Mesh;
  guideOutlines: Map<string, { outline: THREE.Group; target: THREE.Group }>;
  introCart: boolean;
  firstNightGuide: boolean;
  firstNightUntil: number;
  startedAt: number;
}

/** Resolve the scene object the local player's context points at. */
export function contextTarget(
  ctx: InteractGlowCtx,
  w: WorldState,
  work: WorkContext,
): { key: string; group: THREE.Group | null } {
  switch (work.kind) {
    case 'mine':
      return { key: `n:${work.nodeId}`, group: ctx.nodes.get(work.nodeId)?.group ?? null };
    case 'loadCart':
    case 'unloadCart': {
      const train = ctx.carts.get(work.cartId);
      return { key: `c:${work.cartId}`, group: train ? train.back : null };
    }
    case 'anvil': {
      const anvil = w.buildings.find((b) => b.type === 'anvil');
      return { key: 'anvil', group: anvil ? ctx.buildings.get(anvil.id)?.group ?? null : null };
    }
    case 'forge': {
      const forge = w.buildings.find((b) => b.type === 'forge');
      return { key: 'forge', group: forge ? ctx.buildings.get(forge.id)?.group ?? null : null };
    }
    case 'furnace':
      return { key: `f:${work.buildingId}`, group: ctx.buildings.get(work.buildingId)?.group ?? null };
    case 'repair':
    case 'rebuild':
      return { key: `b:${work.buildingId}`, group: ctx.buildings.get(work.buildingId)?.group ?? null };
    case 'deposit':
      return { key: 'yard', group: null }; // handled by the yard ring
  }
}

export function clearOutline(ctx: InteractGlowCtx) {
  if (ctx.outline) {
    ctx.scene.remove(ctx.outline);
    ctx.outline = null;
  }
  ctx.outlineKey = '';
  ctx.outlineTarget = null;
  ctx.yardRing.visible = false;
}

export function clearGuideOutlines(ctx: InteractGlowCtx) {
  for (const h of ctx.guideOutlines.values()) ctx.scene.remove(h.outline);
  ctx.guideOutlines.clear();
}

export function updateInteractGlow(ctx: InteractGlowCtx, w: WorldState) {
  const me = w.players.find((p) => p.id === ctx.myId);
  const work = me ? getContext(w, me) : null;
  if (!work) {
    clearOutline(ctx);
    return;
  }
  const { key, group } = contextTarget(ctx, w, work);
  if (key !== ctx.outlineKey) {
    clearOutline(ctx);
    ctx.outlineKey = key;
    if (key === 'yard') {
      ctx.yardRing.visible = true;
    } else if (group) {
      ctx.outline = makeOutline(group);
      ctx.outlineTarget = group;
      ctx.scene.add(ctx.outline);
    }
  }
  // Pulse + follow the target
  const pulse = 0.55 + Math.sin(performance.now() / 240) * 0.3;
  if (ctx.outline && ctx.outlineTarget) {
    ctx.outline.position.copy(ctx.outlineTarget.position);
    ctx.outline.rotation.copy(ctx.outlineTarget.rotation);
    ctx.outline.scale.copy(ctx.outlineTarget.scale);
    for (const child of ctx.outline.children) {
      const m = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
      m.opacity = pulse;
      break; // shared material: setting one is enough
    }
  }
  if (ctx.yardRing.visible) {
    (ctx.yardRing.material as THREE.MeshBasicMaterial).opacity = pulse * 0.8;
    ctx.yardRing.rotation.z = performance.now() / 3000;
  }
}

/**
 * Soft onboarding: cart at start / when the pack is full; on the first night,
 * pulse Build plus the gates and the first tower so the defense loop is obvious.
 */
export function updateGuideHints(ctx: InteractGlowCtx, w: WorldState) {
  const me = w.players.find((p) => p.id === ctx.myId);
  const cart = w.carts[0];
  if (me?.riding || (cart && cart.loadTotal > 0)) ctx.introCart = false;
  if (performance.now() - ctx.startedAt > 50_000) ctx.introCart = false;
  if (ctx.firstNightGuide && performance.now() > ctx.firstNightUntil) ctx.firstNightGuide = false;

  const packFull =
    !!me && me.carryTotal >= CARRY_CAP && !!cart && cart.loadTotal < cartCap(w);
  const wantCart = (ctx.introCart || packFull) && !!cart;
  const wantBuild = ctx.firstNightGuide;
  const wantGates = ctx.firstNightGuide;
  const firstTower = w.buildings.find(
    (b) => (b.type === 'towerArrow' || b.type === 'towerBallista') && b.hp > 0,
  );

  const prev = store.get().guide;
  if (prev.build !== wantBuild || prev.cart !== wantCart) {
    store.set({ guide: { build: wantBuild, cart: wantCart } });
  }

  const desired = new Map<string, { group: THREE.Group; color: string }>();
  // Skip the cart guide when the interact outline already owns it.
  if (wantCart && !ctx.outlineKey.startsWith('c:')) {
    const train = ctx.carts.get(cart!.id);
    if (train) desired.set('guide:cart', { group: train.back, color: '#ffd76a' });
  }
  if (wantGates) {
    for (const b of w.buildings) {
      if (b.type !== 'gate' || b.hp <= 0) continue;
      const g = ctx.buildings.get(b.id)?.group;
      if (g) desired.set(`guide:gate:${b.id}`, { group: g, color: '#ff7a5c' });
    }
  }
  if (ctx.firstNightGuide && firstTower) {
    const g = ctx.buildings.get(firstTower.id)?.group;
    if (g && ctx.outlineKey !== `b:${firstTower.id}`) {
      desired.set('guide:tower', { group: g, color: '#7ec8ff' });
    }
  }

  for (const key of [...ctx.guideOutlines.keys()]) {
    if (!desired.has(key)) {
      ctx.scene.remove(ctx.guideOutlines.get(key)!.outline);
      ctx.guideOutlines.delete(key);
    }
  }
  for (const [key, spec] of desired) {
    let ent = ctx.guideOutlines.get(key);
    if (!ent || ent.target !== spec.group) {
      if (ent) ctx.scene.remove(ent.outline);
      const outline = makeOutline(spec.group, spec.color);
      ctx.scene.add(outline);
      ent = { outline, target: spec.group };
      ctx.guideOutlines.set(key, ent);
    }
  }

  const pulse = 0.5 + Math.sin(performance.now() / 220) * 0.35;
  for (const h of ctx.guideOutlines.values()) {
    h.outline.position.copy(h.target.position);
    h.outline.rotation.copy(h.target.rotation);
    h.outline.scale.copy(h.target.scale);
    for (const child of h.outline.children) {
      ((child as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = pulse;
      break;
    }
  }
}
