import type {
  BuildableType,
  Cost,
  PlayerState,
  QueuedIntent,
  ResourceId,
  SimEvent,
  StationType,
  TechId,
  WorldState,
} from './types';
import {
  BEAT_EARLY_FORGIVE,
  BEAT_EARLY_SETBACK,
  BEAT_WINDOW,
  REACH_MOUNT,
  STATION_RECIPES,
  TECHS,
  applyTechUnlock,
  buildSpec,
  buildingUnlocked,
  furnaceUpgradeCost,
  hasCombat,
  isChargeBuilding,
  recipeIdForOut,
  recipeUnlocked,
  techRequiresMet,
  towerLevel,
  towerUpgradeCost,
} from './constants';
import { railPosAt, railTangentAt } from './rail';
import {
  contextReady,
  getContext,
  isBeatWork,
  stationAt,
  workDuration,
} from './context';
import { canAfford, pay } from './sim-helpers';
import { canPlace } from './place';
import { handleShoot } from './simCombat';
import { tryAutoMelee } from './simPlayers';

export function handleQueued(w: WorldState, queued: QueuedIntent[], ev: SimEvent[]) {
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
        handleResearch(w, p, intent.tech, ev);
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
      case 'setDebug':
        w.debug = !!intent.enabled;
        break;
    }
  }
  queued.length = 0;
}

function setStationRecipe(w: WorldState, station: StationType, res: ResourceId) {
  if (!STATION_RECIPES[station]?.some((r) => r.out === res)) return;
  const rid = recipeIdForOut(res);
  if (rid && !recipeUnlocked(w, rid)) return;
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
  const list = STATION_RECIPES[ctx.station].filter((r) => {
    const rid = recipeIdForOut(r.out);
    return !rid || recipeUnlocked(w, rid);
  });
  if (!list.length) return;
  const at = list.findIndex((r) => r.out === ctx.recipe);
  const step = dir >= 0 ? 1 : -1;
  const next = list[(Math.max(0, at) + step + list.length) % list.length];
  setStationRecipe(w, ctx.station, next.out);
}

function handleUpgradeFurnace(w: WorldState, p: PlayerState, ev: SimEvent[]) {
  const ctx = getContext(w, p);
  const furnace =
    ctx?.kind === 'furnace' ? w.buildings.find((b) => b.id === ctx.buildingId) : undefined;
  if (!furnace) return;
  const cost = furnaceUpgradeCost(furnace.level, furnace.type);
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

function handleUpgradeTower(w: WorldState, buildingId: string, ev: SimEvent[]) {
  const b = w.buildings.find((bb) => bb.id === buildingId);
  if (!b || !hasCombat(b.type) || b.hp <= 0) return;
  const cost = towerUpgradeCost(b.type, b.tier, b.level);
  if (!cost || !canAfford(w, cost)) return;
  const prev = towerLevel(b.type, b.tier, b.level);
  pay(w, cost);
  b.level++;
  const next = towerLevel(b.type, b.tier, b.level);
  const gained = (next.hpBonus ?? 0) - (prev.hpBonus ?? 0);
  b.maxHp += gained;
  b.hp = Math.min(b.maxHp, b.hp + gained);
  ev.push({ type: 'upgraded', x: b.x, z: b.z, level: b.level });
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
  if (!w.debug && !buildingUnlocked(w, kind)) return;
  if (!canPlace(w, x, z, spec.footprint, kind)) return;
  if (!w.debug) {
    if (!canAfford(w, spec.cost)) return;
    pay(w, spec.cost);
  }
  w.buildings.push({
    id: `b${w.nextId++}`,
    type: kind,
    x,
    z,
    hp: spec.hp,
    maxHp: spec.hp,
    tier: isChargeBuilding(kind) ? null : tier,
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

function handleResearch(w: WorldState, _p: PlayerState, tech: TechId, ev: SimEvent[]) {
  if (w.techs[tech].unlocked) return;
  if (!w.debug) {
    if (w.research) return;
    if (!techRequiresMet(w, tech)) return;
    const def = TECHS[tech];
    const cost = def.cost as Cost;
    if (!canAfford(w, cost)) return;
    pay(w, cost);
    w.research = tech;
    w.techs[tech].progress = 0;
    return;
  }
  // Debug: unlock immediately, free, no prereqs, cancel any in-flight research.
  if (w.research) {
    w.techs[w.research].progress = 0;
    w.research = null;
  }
  const t = w.techs[tech];
  t.progress = 1;
  t.unlocked = true;
  applyTechUnlock(w, tech);
  ev.push({ type: 'research', tech });
}
