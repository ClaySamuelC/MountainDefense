import type { BuildingId, ResourceId, TechId, WorldState } from './types';
import {
  BUILDING_IDS,
  RESOURCE_IDS,
  STATION_DEFAULT,
  TECH_IDS,
  emptyStockpile,
  getBuilding,
  isStation,
} from './constants';

const RES_IDS = RESOURCE_IDS as readonly ResourceId[];
const TECH_ID_LIST = TECH_IDS as readonly TechId[];
const BUILDING_ID_SET = new Set<string>(BUILDING_IDS);

/**
 * Fill missing fields / drop unknown catalog ids so partial blobs don't crash
 * the sim. Used by local save load and smoke round-trips.
 */
export function sanitizeWorld(raw: WorldState): WorldState {
  const stock = emptyStockpile();
  for (const r of RES_IDS) stock[r] = Math.max(0, Number(raw.stockpile?.[r] ?? 0) || 0);

  const techs = {} as WorldState['techs'];
  for (const id of TECH_ID_LIST) {
    const t = raw.techs?.[id];
    techs[id] = {
      unlocked: !!t?.unlocked,
      progress: Math.min(1, Math.max(0, Number(t?.progress ?? 0) || 0)),
    };
  }

  const buildings = Array.isArray(raw.buildings)
    ? raw.buildings.map(sanitizeBuilding).filter((b): b is WorldState['buildings'][number] => !!b)
    : [];

  const w: WorldState = {
    tick: Math.max(0, Number(raw.tick) || 0),
    time: Math.max(0, Number(raw.time) || 0),
    phase: raw.phase === 'night' ? 'night' : 'day',
    phaseT: clamp01(raw.phaseT),
    dayIndex: Math.max(1, Math.floor(Number(raw.dayIndex) || 1)),
    stockpile: stock,
    players: Array.isArray(raw.players) ? raw.players.map(sanitizePlayer) : [],
    nodes: Array.isArray(raw.nodes)
      ? raw.nodes.map(sanitizeNode).filter((n): n is WorldState['nodes'][number] => !!n)
      : [],
    carts: Array.isArray(raw.carts) ? raw.carts.map(sanitizeCart) : [],
    buildings,
    enemies: Array.isArray(raw.enemies)
      ? raw.enemies.map(sanitizeEnemy).filter((e): e is WorldState['enemies'][number] => !!e)
      : [],
    projectiles: [],
    techs,
    research: (raw.research && TECH_ID_LIST.includes(raw.research)
      ? raw.research
      : null) as WorldState['research'],
    spawnQueue: Array.isArray(raw.spawnQueue) ? raw.spawnQueue : [],
    nextId: Math.max(1, Math.floor(Number(raw.nextId) || 1)),
    gameOver: !!raw.gameOver,
    nightsSurvived: Math.max(0, Math.floor(Number(raw.nightsSurvived) || 0)),
    debug: !!raw.debug,
  };

  if (w.players.length === 0) {
    throw new Error('Save has no players');
  }
  if (w.buildings.length === 0) {
    throw new Error('Save has no buildings');
  }
  return w;
}

function sanitizeBuilding(
  b: WorldState['buildings'][number],
): WorldState['buildings'][number] | null {
  const type = String(b?.type || '');
  if (!BUILDING_ID_SET.has(type)) return null;
  const def = getBuilding(type);
  const maxHp = Math.max(1, Number(b.maxHp) || def?.hp || 100);
  const hp = Math.min(maxHp, Math.max(0, Number(b.hp) || 0));
  const level = Math.max(1, Math.floor(Number(b.level) || 1));
  let recipe = b.recipe ?? null;
  if (isStation(type)) {
    const out = recipe as ResourceId | null;
    recipe = out && RES_IDS.includes(out) ? out : STATION_DEFAULT[type];
  } else {
    recipe = null;
  }
  return {
    id: String(b.id || `b${Math.random().toString(36).slice(2, 8)}`),
    type: type as BuildingId,
    x: Number(b.x) || 0,
    z: Number(b.z) || 0,
    hp,
    maxHp,
    tier: b.tier === 'refined' || b.tier === 'crude' ? b.tier : null,
    cd: Math.max(0, Number(b.cd) || 0),
    ammo: Math.max(0, Number(b.ammo) || 0),
    smeltT: clamp01(b.smeltT),
    smelting: b.smelting && RES_IDS.includes(b.smelting as ResourceId) ? b.smelting : null,
    recipe,
    charges: Math.max(0, Math.floor(Number(b.charges) || 0)),
    level,
    buildProgress: clamp01(b.buildProgress),
  };
}

function sanitizeCart(c: WorldState['carts'][number]): WorldState['carts'][number] {
  const load: Partial<Record<ResourceId, number>> = {};
  let total = 0;
  if (c.load && typeof c.load === 'object') {
    for (const [k, v] of Object.entries(c.load)) {
      const n = Math.max(0, Number(v) || 0);
      if (n > 0 && RES_IDS.includes(k as ResourceId)) {
        load[k as ResourceId] = n;
        total += n;
      }
    }
  }
  return {
    id: String(c.id || 'c1'),
    s: Number(c.s) || 0,
    v: Number(c.v) || 0,
    load,
    loadTotal: total,
    riderId: c.riderId ? String(c.riderId) : null,
  };
}

function sanitizeNode(n: WorldState['nodes'][number]): WorldState['nodes'][number] | null {
  if (!n || (n.kind !== 'iron' && n.kind !== 'copper' && n.kind !== 'coal')) return null;
  const max = Math.max(1, Number(n.max) || Number(n.amount) || 1);
  return {
    id: String(n.id || 'n1'),
    kind: n.kind,
    x: Number(n.x) || 0,
    z: Number(n.z) || 0,
    amount: Math.max(0, Math.min(max, Number(n.amount) || 0)),
    max,
  };
}

function sanitizeEnemy(e: WorldState['enemies'][number]): WorldState['enemies'][number] | null {
  if (!e || (e.kind !== 'runner' && e.kind !== 'brute')) return null;
  const maxHp = Math.max(1, Number(e.maxHp) || Number(e.hp) || 1);
  return {
    id: String(e.id || 'e1'),
    kind: e.kind,
    x: Number(e.x) || 0,
    z: Number(e.z) || 0,
    hp: Math.max(0, Math.min(maxHp, Number(e.hp) || 0)),
    maxHp,
    targetId: e.targetId ? String(e.targetId) : null,
    atkT: Math.max(0, Number(e.atkT) || 0),
    speed: Math.max(0.1, Number(e.speed) || 2),
    dmg: Math.max(0, Number(e.dmg) || 5),
    atkPeriod: Math.max(0.1, Number(e.atkPeriod) || 1),
  };
}

function sanitizePlayer(p: WorldState['players'][number]): WorldState['players'][number] {
  const carry: WorldState['players'][number]['carry'] = {};
  let total = 0;
  if (p.carry && typeof p.carry === 'object') {
    for (const [k, v] of Object.entries(p.carry)) {
      const n = Math.max(0, Number(v) || 0);
      if (n > 0 && RES_IDS.includes(k as ResourceId)) {
        carry[k as ResourceId] = n;
        total += n;
      }
    }
  }
  return {
    ...p,
    id: String(p.id || 'p1'),
    name: String(p.name || 'Miner').slice(0, 16),
    color: Number(p.color) || 0,
    x: Number(p.x) || 0,
    z: Number(p.z) || 0,
    heading: Number(p.heading) || 0,
    carry,
    carryTotal: total,
    riding: p.riding ? String(p.riding) : null,
    working: !!p.working,
    swung: Number(p.swung) || 0,
    shots: Number(p.shots) || 0,
    atkCd: Math.max(0, Number(p.atkCd) || 0),
    gunCd: Math.max(0, Number(p.gunCd) || 0),
    workT: Math.max(0, Number(p.workT) || 0),
    ctxKey: String(p.ctxKey || ''),
    beatHit: !!p.beatHit,
    beatPenalty: Math.max(1, Number(p.beatPenalty) || 1),
    beatGood: Number(p.beatGood) || 0,
    beatMiss: Number(p.beatMiss) || 0,
  };
}

function clamp01(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}
