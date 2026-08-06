import type {
  BuildableType,
  BuildingState,
  CartState,
  EnemyKind,
  EnemyState,
  PlayerInput,
  PlayerState,
  QueuedIntent,
  ResourceId,
  SimEvent,
  StationType,
  TechId,
  WorldState,
} from './types';
import {
  ADV_HP_PER_POINT,
  ADV_RUNNERS_PER_POINT,
  ADV_TECH_WEIGHT,
  ADV_TOWER_WEIGHT,
  ANVIL_STONE_CHANCE,
  BEAT_EARLY_FORGIVE,
  BEAT_EARLY_SETBACK,
  BEAT_MISS_PENALTY,
  BEAT_WINDOW,
  BREAK_TIME,
  CART_LOCO_PUSH,
  CART_PUSH,
  CART_SPACING,
  CART_S_MIN,
  CARRY_CAP,
  DAY_LEN,
  DT,
  ENEMY_SPAWNS,
  FORGE_TEND_TIME,
  FURNACE_CAP,
  FURNACE_CHARGE,
  GATE_REBUILD_COST,
  GUN_CD,
  GUN_DMG,
  GUN_RANGE,
  MAP_HALF,
  MELEE_CD,
  MELEE_DMG,
  MELEE_RANGE,
  MINE_TIME,
  NIGHT_LEN,
  PLAYER_SPEED,
  REACH_CART,
  REACH_FORGE,
  REACH_MOUNT,
  REPAIR_ORE_PER_HP,
  REPAIR_RATE,
  SMELT_STONE_CHANCE,
  SMELT_TIME,
  STATION_RECIPES,
  TECHS,
  VEIN_YIELDS,
  WALL_REBUILD_COST,
  WALL_REBUILD_TIME,
  WALL_Z,
  buildSpec,
  findRecipe,
  furnaceLevel,
  furnaceUpgradeCost,
  towerCombat,
  towerLevel,
  towerUpgradeCost,
} from './constants';
import { RAIL_LENGTH, railGradeAt, railPosAt, railTangentAt } from './rail';
import {
  cartDocked,
  contextReady,
  getContext,
  hasInputs,
  isBeatWork,
  stationAt,
  workDuration,
} from './context';
import { addRes, canAfford, cartCap, crudeStock, pay, payCrude } from './sim-helpers';
import { canPlace } from './place';
import { spawnVein } from './world';
import type { WorkContext } from './context';

const IDLE: PlayerInput = { mx: 0, mz: 0, hold: false };

export function tickWorld(
  w: WorldState,
  inputs: Map<string, PlayerInput>,
  queued: QueuedIntent[],
): SimEvent[] {
  const ev: SimEvent[] = [];
  if (w.gameOver) {
    w.tick++;
    return ev;
  }

  handleQueued(w, queued, ev);
  tickPhase(w, ev);
  tickPlayers(w, inputs, ev);
  tickCarts(w, inputs, ev);
  tickForge(w, ev);
  tickFurnaces(w, ev);
  tickResearch(w, ev);
  tickSpawns(w);
  tickEnemies(w, ev);
  tickTowers(w);
  tickProjectiles(w, ev);

  w.tick++;
  w.time += DT;
  return ev;
}

// ---------------------------------------------------------------- intents

function handleQueued(w: WorldState, queued: QueuedIntent[], ev: SimEvent[]) {
  for (const { sid, intent } of queued) {
    const p = w.players.find((pl) => pl.id === sid);
    if (!p) continue;
    switch (intent.type) {
      case 'mount':
        handleMount(w, p);
        break;
      case 'attack':
        // Kept for older clients; melee is automatic whenever an enemy is near.
        tryAutoMelee(w, p, ev);
        break;
      case 'shoot':
        handleShoot(w, p, intent.targetId);
        break;
      case 'beat':
        handleBeat(w, p, ev);
        break;
      case 'build':
        handleBuild(w, intent.kind, intent.tier, intent.x, intent.z, ev);
        break;
      case 'research':
        handleResearch(w, p, intent.tech);
        break;
      case 'setRecipe':
        setStationRecipe(w, intent.station, intent.res);
        break;
      case 'cycleRecipe':
        cycleStationRecipe(w, p, intent.dir);
        break;
      case 'upgradeFurnace':
        handleUpgradeFurnace(w, p, ev);
        break;
      case 'upgradeTower':
        handleUpgradeTower(w, intent.buildingId, ev);
        break;
    }
  }
  queued.length = 0;
}

function setStationRecipe(w: WorldState, station: StationType, res: ResourceId) {
  if (!STATION_RECIPES[station]?.some((r) => r.out === res)) return;
  const b = w.buildings.find((bb) => bb.type === station);
  if (!b) return;
  b.recipe = res;
  // A recipe change abandons whatever was half-heated; nothing was consumed yet.
  b.smelting = null;
  b.smeltT = 0;
}

/** Scroll wheel at a station steps through its recipes. */
function cycleStationRecipe(w: WorldState, p: PlayerState, dir: number) {
  const ctx = stationAt(w, p);
  if (!ctx) return;
  const list = STATION_RECIPES[ctx.station];
  const at = list.findIndex((r) => r.out === ctx.recipe);
  const step = dir >= 0 ? 1 : -1;
  const next = list[(at + step + list.length) % list.length];
  setStationRecipe(w, ctx.station, next.out);
}

function handleUpgradeFurnace(w: WorldState, p: PlayerState, ev: SimEvent[]) {
  const ctx = getContext(w, p);
  const furnace =
    ctx?.kind === 'furnace' ? w.buildings.find((b) => b.id === ctx.buildingId) : undefined;
  if (!furnace) return;
  const cost = furnaceUpgradeCost(furnace.level);
  if (!cost || !canAfford(w, cost)) return;
  pay(w, cost);
  furnace.level++;
  ev.push({ type: 'upgraded', x: furnace.x, z: furnace.z, level: furnace.level });
}

function handleMount(w: WorldState, p: PlayerState) {
  if (p.riding) {
    const cart = w.carts.find((c) => c.id === p.riding);
    if (cart) {
      cart.riderId = null;
      const pos = railPosAt(cart.s);
      const tan = railTangentAt(cart.s);
      p.x = pos.x - tan.z * 1.8;
      p.z = pos.z + tan.x * 1.8;
    }
    p.riding = null;
    return;
  }
  for (const c of w.carts) {
    if (c.riderId) continue;
    const pos = railPosAt(c.s);
    if (Math.hypot(p.x - pos.x, p.z - pos.z) < REACH_MOUNT) {
      c.riderId = p.id;
      p.riding = c.id;
      return;
    }
  }
}

/** Beat timing for the mining / anvil / forge mini-game (Space or E). */
function handleBeat(w: WorldState, p: PlayerState, ev: SimEvent[]) {
  if (p.riding || !p.working) return;
  const ctx = getContext(w, p);
  if (!isBeatWork(ctx) || !contextReady(ctx)) return;
  const dur = workDuration(ctx);
  if (!dur) return;
  const frac = p.workT / dur;
  // Lit window at the end, plus a soft early strip — like a rhythm-game grace.
  const acceptStart = 1 - BEAT_WINDOW - BEAT_EARLY_FORGIVE;
  if (frac >= acceptStart && frac < 1) {
    if (!p.beatHit) {
      p.beatHit = true;
      p.beatGood++;
      ev.push({ type: 'beatHit', pid: p.id, x: p.x, z: p.z, kind: ctx.kind });
    }
  } else if (frac < acceptStart) {
    // Way too early: lose a little progress and flag a miss for this swing.
    p.workT = Math.max(0, p.workT - BEAT_EARLY_SETBACK * dur);
    p.beatHit = false;
    p.beatMiss++;
    ev.push({ type: 'beatMiss', pid: p.id, x: p.x, z: p.z, kind: ctx.kind });
  }
}

/**
 * Finish a timed swing. Awards the action result, then applies / clears the
 * miss penalty for the *next* swing based on whether the beat was hit.
 */
function finishSwing(
  w: WorldState,
  p: PlayerState,
  ctx: Extract<WorkContext, { kind: 'mine' | 'anvil' | 'forge' }>,
  ev: SimEvent[],
  apply: () => boolean,
) {
  const ok = apply();
  if (!ok) {
    p.workT = 0;
    return;
  }
  const kind = ctx.kind;
  if (p.beatHit) {
    p.beatPenalty = 1;
  } else {
    p.beatPenalty = BEAT_MISS_PENALTY;
    p.beatMiss++;
    ev.push({ type: 'beatMiss', pid: p.id, x: p.x, z: p.z, kind });
  }
  p.beatHit = false;
  p.workT = 0;
  ev.push({ type: 'workDone', pid: p.id, x: p.x, z: p.z });
}

/** Stone gun: heavy aimed shot. Prefer the named target when it's in range. */
function handleShoot(w: WorldState, p: PlayerState, targetId?: string) {
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

function handleUpgradeTower(w: WorldState, buildingId: string, ev: SimEvent[]) {
  const b = w.buildings.find((bb) => bb.id === buildingId);
  if (!b || (b.type !== 'towerArrow' && b.type !== 'towerBallista') || b.hp <= 0) return;
  const cost = towerUpgradeCost(b.type, b.tier, b.level);
  if (!cost || !canAfford(w, cost)) return;
  const prev = towerLevel(b.type, b.tier, b.level);
  pay(w, cost);
  b.level++;
  const next = towerLevel(b.type, b.tier, b.level);
  const gained = next.hpBonus - prev.hpBonus;
  b.maxHp += gained;
  b.hp = Math.min(b.maxHp, b.hp + gained);
  ev.push({ type: 'upgraded', x: b.x, z: b.z, level: b.level });
}

/** Auto-swing the pick at the nearest enemy in range. No button needed. */
function tryAutoMelee(w: WorldState, p: PlayerState, ev: SimEvent[]) {
  if (p.atkCd > 0 || p.riding) return;
  let best: EnemyState | null = null;
  let bd = MELEE_RANGE;
  for (const e of w.enemies) {
    const d = Math.hypot(p.x - e.x, p.z - e.z);
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  if (!best) return;
  p.atkCd = MELEE_CD;
  p.swung++;
  best.hp -= MELEE_DMG;
  ev.push({ type: 'hit', x: best.x, z: best.z });
  if (best.hp <= 0) killEnemy(w, best, ev);
}

/**
 * Walking over the cart dumps the pack into it — no hold-E needed, as long as
 * the cart still has room.
 */
function tryAutoLoadCart(w: WorldState, p: PlayerState, ev: SimEvent[]) {
  if (p.riding || p.carryTotal <= 0) return;
  for (const c of w.carts) {
    const front = railPosAt(c.s);
    const back = railPosAt(Math.max(0, c.s - CART_SPACING));
    const d = Math.min(
      Math.hypot(p.x - front.x, p.z - front.z),
      Math.hypot(p.x - back.x, p.z - back.z),
    );
    if (d >= REACH_CART) continue;
    let moved = false;
    while (c.loadTotal < cartCap(w) && p.carryTotal > 0) {
      const res = Object.keys(p.carry)[0] as ResourceId | undefined;
      if (!res) break;
      addRes(p.carry, res, -1);
      p.carryTotal--;
      addRes(c.load, res, 1);
      c.loadTotal++;
      moved = true;
    }
    if (moved) {
      ev.push({ type: 'workDone', pid: p.id, x: p.x, z: p.z });
      return;
    }
  }
}

function handleBuild(
  w: WorldState,
  kind: BuildableType,
  tier: 'crude' | 'refined',
  x: number,
  z: number,
  ev: SimEvent[],
) {
  const spec = buildSpec(kind, tier);
  if (!spec) return;
  if (spec.needsTech && !w.techs[spec.needsTech].unlocked) return;
  if (!canPlace(w, x, z, spec.footprint, kind)) return;
  if (!canAfford(w, spec.cost)) return;
  pay(w, spec.cost);
  w.buildings.push({
    id: `b${w.nextId++}`,
    type: kind,
    x,
    z,
    hp: spec.hp,
    maxHp: spec.hp,
    tier: kind === 'blastFurnace' ? null : tier,
    cd: 0,
    ammo: 0,
    smeltT: 0,
    smelting: null,
    recipe: null,
    charges: 0,
    level: 1,
    buildProgress: 0,
  });
  ev.push({ type: 'built', x, z });
}

function handleResearch(w: WorldState, _p: PlayerState, tech: TechId) {
  if (w.research || w.techs[tech].unlocked) return;
  const def = TECHS[tech];
  if (!canAfford(w, def.cost)) return;
  pay(w, def.cost);
  w.research = tech;
  w.techs[tech].progress = 0;
}

// ---------------------------------------------------------------- phase

function tickPhase(w: WorldState, ev: SimEvent[]) {
  const len = w.phase === 'day' ? DAY_LEN : NIGHT_LEN;
  w.phaseT += DT / len;
  if (w.phaseT < 1) return;
  w.phaseT = 0;
  if (w.phase === 'day') {
    w.phase = 'night';
    scheduleWave(w);
    ev.push({ type: 'nightStart', night: w.dayIndex });
  } else {
    w.phase = 'day';
    w.nightsSurvived++;
    w.dayIndex++;
    ev.push({ type: 'dawn', day: w.dayIndex });
  }
}

/**
 * How far the base has advanced: researched techs and standing towers.
 * Feeds gentle extra pressure into waves so a strong economy stays contested.
 */
export function advancement(w: WorldState): number {
  const techCount = Object.values(w.techs).filter((t) => t.unlocked).length;
  const towerCount = w.buildings.filter(
    (b) => b.hp > 0 && (b.type === 'towerArrow' || b.type === 'towerBallista'),
  ).length;
  return techCount * ADV_TECH_WEIGHT + towerCount * ADV_TOWER_WEIGHT;
}

function scheduleWave(w: WorldState) {
  const n = w.dayIndex;
  const adv = advancement(w);
  const runners = 5 + 3 * n + Math.round(adv * ADV_RUNNERS_PER_POINT);
  const brutes = (n >= 2 ? Math.min(5, n - 1) : 0) + (n >= 3 && adv >= 6 ? 1 : 0);
  const entries: { t: number; kind: EnemyKind }[] = [];
  for (let i = 0; i < runners; i++) entries.push({ t: 2 + (i / runners) * 32, kind: 'runner' });
  for (let i = 0; i < brutes; i++) entries.push({ t: 10 + (i / Math.max(1, brutes)) * 25, kind: 'brute' });
  w.spawnQueue = entries.map((e) => {
    const sp = ENEMY_SPAWNS[Math.floor(Math.random() * ENEMY_SPAWNS.length)];
    return {
      t: e.t + Math.random() * 2,
      kind: e.kind,
      x: sp.x + (Math.random() - 0.5) * 5,
      z: sp.z + (Math.random() - 0.5) * 3,
    };
  });
}

function tickSpawns(w: WorldState) {
  if (w.phase !== 'night' || w.spawnQueue.length === 0) return;
  const elapsed = w.phaseT * NIGHT_LEN;
  const due = w.spawnQueue.filter((e) => e.t <= elapsed);
  if (due.length === 0) return;
  w.spawnQueue = w.spawnQueue.filter((e) => e.t > elapsed);
  const n = w.dayIndex;
  const hpMul = 1 + advancement(w) * ADV_HP_PER_POINT;
  for (const d of due) {
    if (w.enemies.length > 80) break;
    const runner = d.kind === 'runner';
    const hp = Math.round((runner ? 18 + 4 * n : 90 + 22 * n) * hpMul);
    w.enemies.push({
      id: `e${w.nextId++}`,
      kind: d.kind,
      x: d.x,
      z: d.z,
      hp,
      maxHp: hp,
      targetId: null,
      atkT: 0,
      speed: runner ? 3.4 : 2.0,
      dmg: runner ? 4 : 20,
      atkPeriod: runner ? 0.9 : 1.5,
    });
  }
}

// ---------------------------------------------------------------- players

/** Roll what one swing at a vein actually yields. */
function rollVeinYield(kind: string): ResourceId {
  const y = VEIN_YIELDS[kind as keyof typeof VEIN_YIELDS];
  const r = Math.random();
  if (r < y.primaryChance) return y.primary;
  if (r < y.primaryChance + y.stoneChance || y.strays.length === 0) return 'stone';
  return y.strays[Math.floor(Math.random() * y.strays.length)];
}

function tickPlayers(w: WorldState, inputs: Map<string, PlayerInput>, ev: SimEvent[]) {
  for (const p of w.players) {
    const input = inputs.get(p.id) ?? IDLE;
    p.atkCd = Math.max(0, p.atkCd - DT);
    p.gunCd = Math.max(0, p.gunCd - DT);

    if (p.riding) {
      p.working = false;
      continue; // position handled in tickCarts
    }

    // Movement
    let mx = input.mx;
    let mz = input.mz;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) {
      mx /= ml;
      mz /= ml;
    }
    if (ml > 0.05) {
      const speed = PLAYER_SPEED * (1 - 0.25 * (p.carryTotal / CARRY_CAP));
      p.x = Math.min(MAP_HALF - 2, Math.max(-MAP_HALF + 2, p.x + mx * speed * DT));
      p.z = Math.min(MAP_HALF - 2, Math.max(-MAP_HALF + 2, p.z + mz * speed * DT));
      p.heading = Math.atan2(mx, mz);
    }

    // Walk-over dump: pack empties into the cart as soon as you brush it.
    tryAutoLoadCart(w, p, ev);
    // Auto-swing the pick whenever something hostile is in reach.
    tryAutoMelee(w, p, ev);

    // Work (hold E)
    const ctx = input.hold ? getContext(w, p) : null;
    if (!ctx) {
      p.working = false;
      p.ctxKey = '';
      p.workT = 0;
      p.beatHit = false;
      continue;
    }
    p.working = true;
    const key = JSON.stringify(ctx);
    if (key !== p.ctxKey) {
      p.ctxKey = key;
      p.workT = 0;
      p.beatHit = false;
    }

    const pickSpeed = (w.techs.sharpPick.unlocked ? 1.6 : 1) / Math.max(1, p.beatPenalty);

    switch (ctx.kind) {
      case 'mine': {
        p.workT += DT * pickSpeed;
        if (p.workT >= MINE_TIME) {
          finishSwing(w, p, ctx, ev, () => {
            const node = w.nodes.find((nd) => nd.id === ctx.nodeId);
            if (!node || node.amount <= 0 || p.carryTotal >= CARRY_CAP) return false;
            node.amount--;
            addRes(p.carry, rollVeinYield(node.kind), 1);
            p.carryTotal++;
            if (node.amount <= 0) {
              w.nodes = w.nodes.filter((nd) => nd !== node);
              const fresh = spawnVein(w);
              if (fresh) ev.push({ type: 'veinFound', ...fresh });
            }
            return true;
          });
        }
        break;
      }
      case 'loadCart': {
        const cart = w.carts.find((c) => c.id === ctx.cartId);
        let moved = false;
        while (cart && cart.loadTotal < cartCap(w) && p.carryTotal > 0) {
          const res = Object.keys(p.carry)[0] as ResourceId | undefined;
          if (!res) break;
          addRes(p.carry, res, -1);
          p.carryTotal--;
          addRes(cart.load, res, 1);
          cart.loadTotal++;
          moved = true;
        }
        if (moved) ev.push({ type: 'workDone', pid: p.id, x: p.x, z: p.z });
        break;
      }
      case 'unloadCart': {
        const cart = w.carts.find((c) => c.id === ctx.cartId);
        let moved = false;
        while (cart && cart.loadTotal > 0) {
          unloadOne(w, cart);
          moved = true;
        }
        if (moved) ev.push({ type: 'workDone', pid: p.id, x: p.x, z: p.z });
        break;
      }
      case 'anvil': {
        if (!ctx.ready) break;
        p.workT += DT * pickSpeed;
        if (p.workT >= BREAK_TIME) {
          const anvil = w.buildings.find((b) => b.type === 'anvil');
          finishSwing(w, p, ctx, ev, () => {
            const recipe = findRecipe('anvil', ctx.recipe);
            if (!hasInputs(w, recipe.inputs)) return false;
            pay(w, recipe.inputs);
            w.stockpile[recipe.out]++;
            if (Math.random() < ANVIL_STONE_CHANCE) w.stockpile.stone++;
            if (anvil) ev.push({ type: 'smelted', x: anvil.x, z: anvil.z, res: recipe.out });
            return true;
          });
        }
        break;
      }
      case 'forge': {
        if (!ctx.ready) break;
        // Each beat cycle pumps the bellows a little further into the melt.
        p.workT += DT / Math.max(1, p.beatPenalty);
        if (p.workT >= FORGE_TEND_TIME) {
          finishSwing(w, p, ctx, ev, () => pumpForge(w, ctx.recipe, 1.15, ev));
        }
        break;
      }
      case 'furnace': {
        if (!ctx.ready) break;
        const furnace = w.buildings.find((b) => b.id === ctx.buildingId);
        let loaded = false;
        while (furnace && furnace.charges < FURNACE_CAP && hasInputs(w, FURNACE_CHARGE)) {
          pay(w, FURNACE_CHARGE);
          furnace.charges++;
          loaded = true;
        }
        if (loaded && furnace) {
          ev.push({ type: 'charged', x: furnace.x, z: furnace.z });
          ev.push({ type: 'workDone', pid: p.id, x: p.x, z: p.z });
        }
        break;
      }
      case 'repair': {
        const b = w.buildings.find((bb) => bb.id === ctx.buildingId);
        if (b && b.hp > 0 && b.hp < b.maxHp) {
          const costMul = w.techs.reinforcedWalls.unlocked ? 0.5 : 1;
          const hpGain = Math.min(REPAIR_RATE * DT, b.maxHp - b.hp);
          const cost = hpGain * REPAIR_ORE_PER_HP * costMul;
          if (crudeStock(w) >= cost) {
            payCrude(w, cost);
            b.hp += hpGain;
            if (b.hp >= b.maxHp) ev.push({ type: 'workDone', pid: p.id, x: p.x, z: p.z });
          }
        }
        break;
      }
      case 'rebuild': {
        if (!ctx.ready) break;
        const b = w.buildings.find((bb) => bb.id === ctx.buildingId);
        if (!b || b.hp > 0) break;
        if (b.buildProgress <= 0) {
          const cost = b.type === 'gate' ? GATE_REBUILD_COST : WALL_REBUILD_COST;
          if (!canAfford(w, cost)) break;
          pay(w, cost);
        }
        b.buildProgress = Math.min(1, b.buildProgress + DT / WALL_REBUILD_TIME);
        if (b.buildProgress >= 1) {
          b.buildProgress = 0;
          b.hp = b.maxHp;
          ev.push({ type: 'built', x: b.x, z: b.z });
          ev.push({ type: 'workDone', pid: p.id, x: p.x, z: p.z });
        }
        break;
      }
      case 'deposit': {
        let moved = false;
        while (p.carryTotal > 0) {
          const res = Object.keys(p.carry)[0] as ResourceId | undefined;
          if (!res) break;
          addRes(p.carry, res, -1);
          p.carryTotal--;
          w.stockpile[res]++;
          moved = true;
        }
        if (moved) ev.push({ type: 'workDone', pid: p.id, x: p.x, z: p.z });
        break;
      }
    }
  }
}

// ---------------------------------------------------------------- carts

function tickCarts(w: WorldState, inputs: Map<string, PlayerInput>, ev?: SimEvent[]) {
  const loco = w.techs.locomotive.unlocked;
  for (const c of w.carts) {
    let push = 0;
    const rider = c.riderId ? w.players.find((p) => p.id === c.riderId) : null;

    if (rider) {
      const input = inputs.get(rider.id) ?? IDLE;
      const tan = railTangentAt(c.s);
      const dot = input.mx * tan.x + input.mz * tan.z;
      push = dot * (loco ? CART_LOCO_PUSH : CART_PUSH);
    } else if (loco) {
      const target = c.loadTotal > 0 ? RAIL_LENGTH : CART_S_MIN;
      const delta = target - c.s;
      if (Math.abs(delta) > 2) push = Math.sign(delta) * CART_LOCO_PUSH * 0.8;
      else c.v *= 0.8;
    }

    const grade = railGradeAt(c.s);
    const massF = 1 + (c.loadTotal / 12) * 1.2 + (rider ? 0.4 : 0);
    const gravityA = -9.8 * 0.45 * grade;
    let a = gravityA + push / massF;

    c.v += a * DT;
    c.v -= c.v * 0.14 * DT; // drag
    // rolling friction / stiction
    if (Math.abs(c.v) > 0.03) {
      c.v -= Math.sign(c.v) * Math.min(Math.abs(c.v), 0.35 * DT);
    } else if (push === 0 && Math.abs(gravityA) < 0.45) {
      c.v = 0;
    }
    c.v = Math.min(13, Math.max(-13, c.v));
    c.s += c.v * DT;

    // Soft buffers: leave room for the trailing ore cart at the mine end,
    // and bounce lightly instead of stacking into the stop.
    if (c.s <= CART_S_MIN) {
      if (c.v < -0.4 && ev) {
        const pos = railPosAt(CART_S_MIN);
        ev.push({ type: 'cartBump', x: pos.x, z: pos.z });
      }
      c.s = CART_S_MIN;
      // Soft bumper: kill most of the impact, no hard stack into the stop.
      c.v = c.v < 0 ? Math.min(1.2, -c.v * 0.18) : Math.max(0, c.v);
      if (Math.abs(c.v) < 0.35) c.v = 0;
    }
    if (c.s >= RAIL_LENGTH) {
      if (c.v > 0.4 && ev) {
        const pos = railPosAt(RAIL_LENGTH);
        ev.push({ type: 'cartBump', x: pos.x, z: pos.z });
      }
      c.s = RAIL_LENGTH;
      c.v = c.v > 0 ? Math.max(-1.2, -c.v * 0.18) : Math.min(0, c.v);
      if (Math.abs(c.v) < 0.35) c.v = 0;
    }

    if (rider) {
      const pos = railPosAt(c.s);
      rider.x = pos.x;
      rider.z = pos.z;
      const tan = railTangentAt(c.s);
      rider.heading = Math.atan2(tan.x, tan.z);
    }

    // Locomotive dock auto-unload
    if (loco && !rider && cartDocked(c.s) && c.loadTotal > 0) {
      c.v = 0;
      if (w.tick % 8 === 0) unloadOne(w, c); // ~2.5/s
    }
  }
}

function unloadOne(w: WorldState, cart: CartState) {
  const res = Object.keys(cart.load)[0] as ResourceId | undefined;
  if (!res) return;
  addRes(cart.load, res, -1);
  cart.loadTotal--;
  w.stockpile[res]++;
}

// ---------------------------------------------------------------- forge

/**
 * Finish a melt: take the inputs and hand over the ingot. Inputs are charged
 * here rather than when the melt starts, so a smelt can never swallow ore
 * without giving the matching ingot back.
 */
function completeSmelt(w: WorldState, forge: BuildingState, ev: SimEvent[]): boolean {
  const recipe = findRecipe('forge', forge.smelting);
  if (!hasInputs(w, recipe.inputs)) {
    // Someone spent the inputs mid-melt: hold the heat and wait for restock.
    forge.smeltT = 0.999;
    return false;
  }
  pay(w, recipe.inputs);
  w.stockpile[recipe.out]++;
  if (Math.random() < SMELT_STONE_CHANCE) w.stockpile.stone++;
  forge.smelting = null;
  forge.smeltT = 0;
  ev.push({ type: 'smelted', x: forge.x, z: forge.z, res: recipe.out });
  return true;
}

/**
 * Advance the forge by `rate` (1 = one full tend pulse) on the selected
 * recipe. Returns false if there was nothing to do.
 */
function pumpForge(w: WorldState, out: ResourceId, rate: number, ev: SimEvent[]): boolean {
  const forge = w.buildings.find((b) => b.type === 'forge');
  if (!forge || forge.hp <= 0) return false;
  const recipe = findRecipe('forge', out);
  if (!hasInputs(w, recipe.inputs)) return false;

  if (forge.smelting !== recipe.out) {
    forge.smelting = recipe.out;
    forge.smeltT = 0;
  }

  // One tend pulse advances roughly a third of an ingot.
  forge.smeltT += rate * 0.34;
  if (forge.smeltT >= 1) completeSmelt(w, forge, ev);
  return true;
}

function tickForge(w: WorldState, ev: SimEvent[]) {
  const forge = w.buildings.find((b) => b.type === 'forge');
  if (!forge || forge.hp <= 0 || forge.smelting === null) return;

  // Players actively pumping (hold E) advance via the forge work context.
  // Bellows tech keeps a slow residual burn while someone is still nearby.
  if (!w.techs.bellows.unlocked) return;
  const nearby = w.players.some(
    (p) => !p.riding && Math.hypot(p.x - forge.x, p.z - forge.z) < REACH_FORGE,
  );
  if (!nearby) return;
  forge.smeltT += (0.25 * DT) / SMELT_TIME;
  if (forge.smeltT >= 1) completeSmelt(w, forge, ev);
}

// ---------------------------------------------------------------- blast furnace

/**
 * The blast furnace runs on its own: it burns the charges of iron and coal a
 * player shovelled in, one slow ingot at a time. Upgrading the draught is the
 * only way to make it quick.
 */
function tickFurnaces(w: WorldState, ev: SimEvent[]) {
  for (const b of w.buildings) {
    if (b.type !== 'blastFurnace' || b.hp <= 0) continue;

    if (b.smelting === null) {
      if (b.charges < 1) continue;
      b.charges--;
      b.smelting = 'steelIngot';
      b.smeltT = 0;
    }

    const seconds = furnaceLevel(b.level).time;
    b.smeltT += DT / seconds;
    if (b.smeltT >= 1) {
      w.stockpile.steelIngot++;
      b.smelting = null;
      b.smeltT = 0;
      ev.push({ type: 'smelted', x: b.x, z: b.z, res: 'steelIngot' });
    }
  }
}

// ---------------------------------------------------------------- research

function tickResearch(w: WorldState, ev: SimEvent[]) {
  if (!w.research) return;
  const tech = w.research;
  const t = w.techs[tech];
  t.progress += DT / TECHS[tech].time;
  if (t.progress < 1) return;
  t.progress = 1;
  t.unlocked = true;
  w.research = null;
  ev.push({ type: 'research', tech });

  if (tech === 'reinforcedWalls') {
    for (const b of w.buildings) {
      if (b.type === 'wall' || b.type === 'gate') {
        const bonus = Math.round(b.maxHp * 0.6);
        b.maxHp += bonus;
        b.hp = Math.min(b.maxHp, b.hp + bonus);
      }
    }
  }
}

// ---------------------------------------------------------------- enemies

/**
 * Monsters are drawn to the gates. Only once a gate is broken do they pour
 * through the opening and hunt buildings inside. Walls are never attacked.
 */
function pickTarget(w: WorldState, e: EnemyState): string | null {
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

function tickEnemies(w: WorldState, ev: SimEvent[]) {
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

function killEnemy(w: WorldState, e: EnemyState, ev: SimEvent[]) {
  ev.push({ type: 'enemyDied', x: e.x, z: e.z, kind: e.kind });
  // Night creatures crumble into coal shards.
  if (e.kind === 'brute') w.stockpile.coal += 2;
  else if (Math.random() < 0.25) w.stockpile.coal += 1;
  w.enemies = w.enemies.filter((en) => en !== e);
}

// ---------------------------------------------------------------- towers

function tickTowers(w: WorldState) {
  for (const b of w.buildings) {
    if ((b.type !== 'towerArrow' && b.type !== 'towerBallista') || b.hp <= 0) continue;
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
      kind: b.tier === 'crude' ? 'stone' : 'bolt',
    });
  }
}

function tickProjectiles(w: WorldState, ev: SimEvent[]) {
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
