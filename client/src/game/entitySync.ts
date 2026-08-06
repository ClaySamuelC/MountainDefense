import * as THREE from 'three';
import {
  BEAT_WINDOW,
  CART_SPACING,
  FURNACE_CAP,
  REACH_CART,
  VEIN_LABELS,
  contextReady,
  getContext,
  isBeatWork,
  railPosAt,
  railTangentAt,
  terrainHeight,
  workDuration,
  type ResourceId,
  type WorldState,
} from '@shared';
import {
  RES_COLORS,
  makeBuilding,
  makeCartTrain,
  makeChargePips,
  makeEnemy,
  makeHealthBar,
  makeLabel,
  makeOreNode,
  makePlayer,
  makeProjectile,
  makeWorkBar,
} from './meshes';
import type { Particles } from './particles';
import { sfx } from './sfx';
import { lerpAngle } from './gameMath';
import type { TrackedEntity } from './gameTypes';

export interface EntitySyncCtx {
  scene: THREE.Scene;
  myId: string;
  particles: Particles;
  players: Map<string, TrackedEntity>;
  enemies: Map<string, TrackedEntity>;
  projectiles: Map<string, TrackedEntity>;
  buildings: Map<string, TrackedEntity>;
  nodes: Map<string, TrackedEntity>;
  carts: Map<string, ReturnType<typeof makeCartTrain>>;
  piles: Map<ResourceId, THREE.Group>;
}

export function syncPlayers(ctx: EntitySyncCtx, w: WorldState, prev: WorldState, alpha: number) {
  const seen = new Set<string>();
  for (const p of w.players) {
    seen.add(p.id);
    let ent = ctx.players.get(p.id);
    if (!ent) {
      const group = makePlayer(p.color);
      const workBar = makeWorkBar();
      workBar.group.position.y = 2.7;
      group.add(workBar.group);
      ent = {
        group,
        extra: { workPhase: 0, lastSwung: p.swung, lastShots: p.shots, workBar },
      };
      ctx.players.set(p.id, ent);
      ctx.scene.add(ent.group);
    }
    const pp = prev.players.find((q) => q.id === p.id) ?? p;
    const x = pp.x + (p.x - pp.x) * alpha;
    const z = pp.z + (p.z - pp.z) * alpha;
    const y = terrainHeight(x, z);
    ent.group.position.set(x, y, z);
    ent.group.rotation.y = lerpAngle(pp.heading, p.heading, alpha);

    const moving = Math.hypot(p.x - pp.x, p.z - pp.z) > 0.01;
    const t = performance.now() / 1000;
    ent.group.position.y = y + (moving && !p.riding ? Math.abs(Math.sin(t * 9)) * 0.09 : 0);
    if (p.riding) ent.group.position.y = y + 0.55;

    const pick = ent.group.getObjectByName('pick');
    if (pick) {
      if (p.working) {
        pick.rotation.x = Math.sin(t * 10) * 0.9 - 0.4;
        if (Math.sin(t * 10) > 0.95 && Math.random() < 0.3) {
          ctx.particles.burst(x, y + 0.8, z, '#d9c9a0', 2, 2, 0.3);
        }
      } else if (p.swung !== ent.extra.lastSwung) {
        ent.extra.lastSwung = p.swung;
        ent.extra.workPhase = 0.3;
      }
      if (ent.extra.workPhase > 0) {
        ent.extra.workPhase -= 1 / 60;
        pick.rotation.x = -ent.extra.workPhase * 6;
      } else if (!p.working) {
        pick.rotation.x = 0;
      }
    }
    // Backpack piles up lump by lump as you carry more
    const pack = ent.group.getObjectByName('pack');
    if (pack) {
      pack.visible = p.carryTotal > 0;
      const s = 0.75 + (p.carryTotal / 8) * 0.45;
      pack.scale.set(s, s, s);
      const dominant = (Object.entries(p.carry).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]?.[0] ??
        'ironOre') as ResourceId;
      const lumps = Math.ceil(p.carryTotal / 2);
      for (let i = 0; i < 4; i++) {
        const lump = pack.getObjectByName(`packItem${i}`) as THREE.Mesh | undefined;
        if (!lump) continue;
        lump.visible = i < lumps;
        (lump.material as THREE.MeshStandardMaterial).color.set(RES_COLORS[dominant]);
      }
    }

    // Timing read-out. The local player reads it off the big HUD bar, so the
    // floating one is reserved for watching teammates keep rhythm.
    const bar = ent.extra.workBar as ReturnType<typeof makeWorkBar>;
    if (p.id === ctx.myId) {
      bar.set(null);
    } else {
      let frac: number | null = null;
      let beatOpts: { beatWindow?: number; beatHit?: boolean; penalty?: boolean } | undefined;
      if (p.working) {
        const workCtx = getContext(w, p);
        const dur = workCtx && contextReady(workCtx) ? workDuration(workCtx) : null;
        if (dur && workCtx) {
          frac = Math.min(1, p.workT / dur);
          if (isBeatWork(workCtx)) {
            beatOpts = {
              beatWindow: BEAT_WINDOW,
              beatHit: p.beatHit,
              penalty: p.beatPenalty > 1.05,
            };
          }
        }
      }
      bar.set(frac, beatOpts);
    }
    bar.update(1 / 60);

    // Stone gun muzzle flash
    if (p.shots !== ent.extra.lastShots) {
      ent.extra.lastShots = p.shots;
      sfx.shoot();
      ctx.particles.burst(x, y + 1.1, z, '#d8d4c8', 4, 4, 0.25);
    }
  }
  for (const [id, ent] of ctx.players) {
    if (!seen.has(id)) {
      ctx.scene.remove(ent.group);
      ctx.players.delete(id);
    }
  }
}

export function syncEnemies(ctx: EntitySyncCtx, w: WorldState, prev: WorldState, alpha: number) {
  const seen = new Set<string>();
  for (const e of w.enemies) {
    seen.add(e.id);
    let ent = ctx.enemies.get(e.id);
    if (!ent) {
      const group = makeEnemy(e.kind);
      const hb = makeHealthBar(e.kind === 'brute' ? 1.8 : 1.1);
      hb.group.position.y = e.kind === 'brute' ? 2.7 : 1.4;
      group.add(hb.group);
      ent = { group, hb };
      ctx.enemies.set(e.id, ent);
      ctx.scene.add(group);
    }
    const pe = prev.enemies.find((q) => q.id === e.id) ?? e;
    const x = pe.x + (e.x - pe.x) * alpha;
    const z = pe.z + (e.z - pe.z) * alpha;
    const t = performance.now() / 1000;
    ent.group.position.set(x, terrainHeight(x, z) + Math.abs(Math.sin(t * 6 + e.x)) * 0.08, z);
    const dx = e.x - pe.x;
    const dz = e.z - pe.z;
    if (Math.hypot(dx, dz) > 0.001) ent.group.rotation.y = Math.atan2(dx, dz);
    ent.hb!.set(e.hp / e.maxHp);
  }
  for (const [id, ent] of ctx.enemies) {
    if (!seen.has(id)) {
      ctx.scene.remove(ent.group);
      ctx.enemies.delete(id);
    }
  }
}

export function syncProjectiles(ctx: EntitySyncCtx, w: WorldState, prev: WorldState, alpha: number) {
  const seen = new Set<string>();
  for (const pr of w.projectiles) {
    seen.add(pr.id);
    let ent = ctx.projectiles.get(pr.id);
    if (!ent) {
      const g = new THREE.Group();
      g.add(makeProjectile(pr.kind));
      ent = { group: g };
      ctx.projectiles.set(pr.id, ent);
      ctx.scene.add(g);
    }
    const pp = prev.projectiles.find((q) => q.id === pr.id) ?? pr;
    const x = pp.x + (pr.x - pp.x) * alpha;
    const y = pp.y + (pr.y - pp.y) * alpha;
    const z = pp.z + (pr.z - pp.z) * alpha;
    const old = ent.group.position.clone();
    ent.group.position.set(x, y, z);
    if (old.distanceToSquared(ent.group.position) > 0.0001) {
      ent.group.lookAt(old.x + (x - old.x) * 2, old.y + (y - old.y) * 2, old.z + (z - old.z) * 2);
    }
  }
  for (const [id, ent] of ctx.projectiles) {
    if (!seen.has(id)) {
      ctx.scene.remove(ent.group);
      ctx.projectiles.delete(id);
    }
  }
}

export function syncBuildings(ctx: EntitySyncCtx, w: WorldState) {
  for (const b of w.buildings) {
    let ent = ctx.buildings.get(b.id);
    if (!ent) {
      const group = makeBuilding(b.type, b.tier);
      group.position.set(b.x, terrainHeight(b.x, b.z), b.z);
      const furnace = b.type === 'blastFurnace';
      const hb = makeHealthBar(2.2);
      hb.group.position.y = furnace ? 7.9 : 4.2;
      group.add(hb.group);
      const extra: Record<string, unknown> = {};
      if (furnace) {
        const pips = makeChargePips(FURNACE_CAP);
        pips.group.position.y = 7.2;
        group.add(pips.group);
        extra.pips = pips;
      }
      ent = { group, hb, extra };
      ctx.buildings.set(b.id, ent);
      ctx.scene.add(group);
    }
    const intact = ent.group.getObjectByName('intact');
    const rubble = ent.group.getObjectByName('rubble');
    if (intact) intact.visible = b.hp > 0;
    if (rubble) rubble.visible = b.hp <= 0;
    // Fallen walls show rebuild progress on the bar instead of hiding it.
    if (b.hp <= 0 && (b.type === 'wall' || b.type === 'gate')) {
      ent.hb!.set(Math.max(0.001, b.buildProgress));
      ent.hb!.group.visible = b.buildProgress > 0.001;
    } else {
      ent.hb!.set(b.hp > 0 ? b.hp / b.maxHp : 1);
    }

    if (b.type === 'forge') {
      const fire = ent.group.getObjectByName('fire') as THREE.Mesh | undefined;
      if (fire) {
        const m = fire.material as THREE.MeshStandardMaterial;
        const active = b.smelting !== null;
        m.emissiveIntensity = active ? 1.6 + Math.sin(performance.now() / 90) * 0.5 : 0.35;
      }
    }
    if (b.type === 'blastFurnace') {
      const running = b.smelting !== null && b.hp > 0;
      const tap = ent.group.getObjectByName('furnaceFire') as THREE.Mesh | undefined;
      if (tap) {
        const m = tap.material as THREE.MeshStandardMaterial;
        m.emissiveIntensity = running ? 1.5 + Math.sin(performance.now() / 130) * 0.45 : 0.25;
      }
      ent.extra?.pips?.set(b.charges);
      if (ent.extra) ent.extra.smokeT = (ent.extra.smokeT ?? 0) + 1;
      // Smoke from the chimney tells you it is working without a UI panel
      if (running && ent.extra && ent.extra.smokeT % 7 === 0) {
        ctx.particles.burst(b.x + (Math.random() - 0.5) * 0.3, terrainHeight(b.x, b.z) + 6.4, b.z, '#8d8a86', 2, 1.1, 1.5);
      }
    }
    if (b.type === 'techhub') {
      const crystal = ent.group.getObjectByName('crystal');
      if (crystal) {
        crystal.rotation.y += 0.02;
        crystal.position.y = 4.3 + Math.sin(performance.now() / 600) * 0.15;
      }
    }
  }
}

export function syncNodes(ctx: EntitySyncCtx, w: WorldState) {
  const me = w.players.find((p) => p.id === ctx.myId);
  const seen = new Set<string>();
  for (const n of w.nodes) {
    seen.add(n.id);
    let ent = ctx.nodes.get(n.id);
    if (!ent) {
      const group = makeOreNode(n.kind);
      group.position.set(n.x, terrainHeight(n.x, n.z), n.z);
      const label = makeLabel(VEIN_LABELS[n.kind]);
      label.position.set(n.x, terrainHeight(n.x, n.z) + 2.3, n.z);
      ctx.scene.add(label);
      ent = { group, extra: { label } };
      ctx.nodes.set(n.id, ent);
      ctx.scene.add(group);
    }
    const s = 0.55 + 0.45 * Math.min(1, n.amount / n.max);
    ent.group.scale.set(s, s, s);
    ent.group.visible = n.amount > 0;
    // Vein labels fade in as you approach
    const label = ent.extra.label as THREE.Sprite;
    const d = me ? Math.hypot(me.x - n.x, me.z - n.z) : 99;
    const vis = Math.max(0, Math.min(1, (14 - d) / 5));
    label.material.opacity = vis * 0.95;
    label.visible = vis > 0.02 && n.amount > 0;
  }
  // Depleted veins vanish (and respawn elsewhere via sim events)
  for (const [id, ent] of ctx.nodes) {
    if (!seen.has(id)) {
      ctx.scene.remove(ent.group);
      ctx.scene.remove(ent.extra.label);
      ctx.nodes.delete(id);
    }
  }
}

export function syncCarts(ctx: EntitySyncCtx, w: WorldState, prev: WorldState, alpha: number) {
  for (const c of w.carts) {
    let train = ctx.carts.get(c.id);
    if (!train) {
      train = makeCartTrain();
      ctx.carts.set(c.id, train);
      ctx.scene.add(train.group);
    }
    const pc = prev.carts.find((q) => q.id === c.id) ?? c;
    const s = pc.s + (c.s - pc.s) * alpha;

    const place = (obj: THREE.Group, ss: number) => {
      const p = railPosAt(Math.max(0, ss));
      const t = railTangentAt(Math.max(0, ss));
      obj.position.set(p.x, p.y, p.z);
      obj.rotation.y = Math.atan2(t.x, t.z);
      obj.rotation.x = -Math.asin(Math.max(-0.6, Math.min(0.6, t.y)));
    };
    place(train.front, s);
    // Ore cart always trails by CART_SPACING; sim keeps s >= CART_S_MIN so they never stack.
    const backS = Math.max(0, s - CART_SPACING);
    place(train.back, backS);

    // Dump radius sits under the ore cart (walk-over load target).
    const backPos = railPosAt(backS);
    train.dumpRing.position.set(backPos.x, backPos.y + 0.06, backPos.z);
    train.dumpRing.rotation.x = -Math.PI / 2;
    train.dumpRing.rotation.z = performance.now() / 4000;
    const me = w.players.find((p) => p.id === ctx.myId);
    const nearDump =
      !!me &&
      !me.riding &&
      Math.hypot(me.x - backPos.x, me.z - backPos.z) < REACH_CART + 1.5;
    const carrying = !!me && me.carryTotal > 0;
    const mat = train.dumpRing.material as THREE.MeshBasicMaterial;
    mat.opacity = carrying ? (nearDump ? 0.55 : 0.32) : 0.16;
    mat.color.set(carrying && nearDump ? '#9fe9bd' : '#7ec8ff');

    train.load.visible = c.loadTotal > 0;
    const fill = Math.min(1, c.loadTotal / 12);
    train.load.scale.set(0.5 + fill, 0.4 + fill * 0.9, 0.5 + fill);
    const dominant = (Object.keys(c.load)[0] ?? 'ironOre') as ResourceId;
    (train.load.material as THREE.MeshStandardMaterial).color.set(RES_COLORS[dominant]);
  }
}

export function syncPiles(ctx: EntitySyncCtx, w: WorldState) {
  for (const [res, pile] of ctx.piles) {
    const amt = w.stockpile[res];
    if (amt >= 1) {
      pile.visible = true;
      const s = 0.45 + Math.min(1.15, Math.cbrt(amt) / 3.2);
      pile.scale.set(s, s, s);
    } else {
      pile.visible = false;
    }
  }
}
