import type {
  BuildingState,
  EnemyState,
  PlayerState,
  SimEvent,
  WorldState,
} from './types';
import { DT, GUN_CD, GUN_DMG, GUN_RANGE, WALL_Z, towerCombat } from './constants';
import { crudeStock, payCrude } from './sim-helpers';

/** Stone gun: heavy aimed shot. Prefer the named target when it's in range. */
export function handleShoot(w: WorldState, p: PlayerState, targetId?: string) {
  if (p.gunCd > 0 || p.riding) return;
  if (crudeStock(w) < 1) return;

  let best: EnemyState | null = null;
  if (targetId) {
    const aimed = w.enemies.find((e) => e.id === targetId);
    if (aimed && Math.hypot(p.x - aimed.x, p.z - aimed.z) <= GUN_RANGE) best = aimed;
  }
  if (!best) {
    let bd = GUN_RANGE;
    for (const e of w.enemies) {
      const d = Math.hypot(p.x - e.x, p.z - e.z);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
  }
  if (!best) return; // nothing in range: hold fire, save ammo

  p.gunCd = GUN_CD;
  p.shots++;
  payCrude(w, 1);
  w.projectiles.push({
    id: `pr${w.nextId++}`,
    x: p.x,
    y: 1.2,
    z: p.z,
    targetId: best.id,
    dmg: GUN_DMG,
    kind: 'stone',
  });
}

/**
 * Monsters are drawn to the gates. Only once a gate is broken do they pour
 * through the opening and hunt buildings inside. Walls are never attacked.
 */
export function pickTarget(w: WorldState, e: EnemyState): string | null {
  const keep = w.buildings.find((b) => b.type === 'keep' && b.hp > 0);
  const gates = w.buildings.filter((b) => b.type === 'gate');
  const aliveGates = gates.filter((b) => b.hp > 0);
  const breached = gates.some((b) => b.hp <= 0);

  if (!breached && aliveGates.length > 0) {
    let best: BuildingState | null = null;
    let bd = Infinity;
    for (const g of aliveGates) {
      const d = Math.hypot(e.x - g.x, e.z - g.z);
      if (d < bd) {
        bd = d;
        best = g;
      }
    }
    return best?.id ?? null;
  }

  // Breached: everything inside is fair game.
  const inside = w.buildings.filter(
    (b) => b.hp > 0 && b.type !== 'wall' && b.type !== 'gate',
  );
  if (inside.length === 0) return keep?.id ?? null;
  if (e.kind === 'brute' && keep) return keep.id;
  if (keep && Math.random() < 0.35) return keep.id;
  let best: BuildingState | null = null;
  let bd = Infinity;
  for (const b of inside) {
    const d = Math.hypot(e.x - b.x, e.z - b.z);
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  return best?.id ?? null;
}

export function tickEnemies(w: WorldState, ev: SimEvent[]) {
  for (const e of w.enemies) {
    let target = e.targetId ? w.buildings.find((b) => b.id === e.targetId && b.hp > 0) : undefined;
    if (!target) {
      e.targetId = pickTarget(w, e);
      target = e.targetId ? w.buildings.find((b) => b.id === e.targetId) : undefined;
      if (!target) continue;
    }

    let dx = target.x - e.x;
    let dz = target.z - e.z;

    // Funnel through a broken gate: when the target is inside the wall and the
    // enemy is still outside, walk to the nearest gate opening first.
    if (
      target.type !== 'gate' &&
      e.z > WALL_Z + 1.2 &&
      target.z < WALL_Z - 0.5
    ) {
      const openings = w.buildings.filter((b) => b.type === 'gate' && b.hp <= 0);
      const doors = openings.length > 0 ? openings : w.buildings.filter((b) => b.type === 'gate');
      let door: BuildingState | null = null;
      let bd = Infinity;
      for (const g of doors) {
        const d = Math.hypot(e.x - g.x, e.z - g.z);
        if (d < bd) {
          bd = d;
          door = g;
        }
      }
      if (door) {
        dx = door.x - e.x;
        dz = door.z - 1.5 - e.z;
      }
    }

    const d = Math.hypot(dx, dz);
    const attackRange = e.kind === 'brute' ? 3.0 : 2.5;

    if (d > attackRange || Math.hypot(target.x - e.x, target.z - e.z) > attackRange) {
      // walk, with light separation from the nearest packmate
      let sx = 0;
      let sz = 0;
      for (const o of w.enemies) {
        if (o === e) continue;
        const od = Math.hypot(o.x - e.x, o.z - e.z);
        if (od < 1.4 && od > 0.001) {
          sx += (e.x - o.x) / od;
          sz += (e.z - o.z) / od;
        }
      }
      const inv = 1 / (d || 1);
      e.x += (dx * inv * e.speed + sx * 1.2) * DT;
      e.z += (dz * inv * e.speed + sz * 1.2) * DT;
      e.atkT = 0;
    } else {
      e.atkT += DT;
      if (e.atkT >= e.atkPeriod) {
        e.atkT = 0;
        target.hp -= e.dmg;
        ev.push({ type: 'hit', x: target.x, z: target.z });
        if (target.hp <= 0) {
          target.hp = 0;
          ev.push({ type: 'destroyed', x: target.x, z: target.z });
          if (target.type === 'keep') {
            w.gameOver = true;
            ev.push({ type: 'gameOver' });
            return;
          }
          e.targetId = null;
        }
      }
    }
  }
}

export function killEnemy(w: WorldState, e: EnemyState, ev: SimEvent[]) {
  ev.push({ type: 'enemyDied', x: e.x, z: e.z, kind: e.kind });
  // Night creatures crumble into coal shards.
  if (e.kind === 'brute') w.stockpile.coal += 2;
  else if (Math.random() < 0.25) w.stockpile.coal += 1;
  w.enemies = w.enemies.filter((en) => en !== e);
}

export function tickTowers(w: WorldState) {
  for (const b of w.buildings) {
    if (b.hp <= 0) continue;
    const spec = towerCombat(b.type, b.tier, b.level);
    if (!spec) continue;
    b.cd -= DT;
    if (b.cd > 0) continue;

    let best: EnemyState | null = null;
    let bd = spec.range;
    for (const e of w.enemies) {
      const d = Math.hypot(b.x - e.x, b.z - e.z);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    if (!best) continue;

    b.cd = 1 / spec.rate;
    w.projectiles.push({
      id: `pr${w.nextId++}`,
      x: b.x,
      y: 3.2,
      z: b.z,
      targetId: best.id,
      dmg: spec.dmg,
      kind: spec.projectile,
    });
  }
}

export function tickProjectiles(w: WorldState, ev: SimEvent[]) {
  const speed = 26;
  const alive: typeof w.projectiles = [];
  for (const pr of w.projectiles) {
    const target = w.enemies.find((e) => e.id === pr.targetId);
    if (!target) continue; // fizzle
    const dx = target.x - pr.x;
    const dy = 1.0 - pr.y;
    const dz = target.z - pr.z;
    const d = Math.hypot(dx, dy, dz);
    if (d < 1.0) {
      target.hp -= pr.dmg;
      ev.push({ type: 'hit', x: target.x, z: target.z });
      if (target.hp <= 0) killEnemy(w, target, ev);
      continue;
    }
    const step = Math.min(d, speed * DT);
    pr.x += (dx / d) * step;
    pr.y += (dy / d) * step;
    pr.z += (dz / d) * step;
    alive.push(pr);
  }
  w.projectiles = alive;
}
