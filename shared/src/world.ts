import type {
  BuildingState,
  BuildingType,
  NodeKind,
  PlayerState,
  ResourceId,
  TechId,
  Tier,
  WorldState,
} from './types';
import {
  GATE_HP,
  GATE_XS,
  KEEP_HP,
  POS,
  STATION_DEFAULT,
  WALL_HP,
  WALL_XS,
  WALL_Z,
} from './constants';
import { terrainHeight, terrainSlope } from './terrain';
import { distToRail, RAIL_LENGTH } from './rail';

export function emptyStockpile(): Record<ResourceId, number> {
  return {
    coal: 0,
    stone: 0,
    ironOre: 0,
    copperOre: 0,
    crushedIron: 0,
    crushedCopper: 0,
    ironIngot: 0,
    copperIngot: 0,
    steelIngot: 0,
  };
}

function building(
  w: WorldState,
  type: BuildingType,
  x: number,
  z: number,
  hp: number,
  tier: Tier | null = null,
): BuildingState {
  const b: BuildingState = {
    id: `b${w.nextId++}`,
    type,
    x,
    z,
    hp,
    maxHp: hp,
    tier,
    cd: 0,
    ammo: 0,
    smeltT: 0,
    smelting: null,
    recipe: type === 'anvil' || type === 'forge' ? STATION_DEFAULT[type] : null,
    charges: 0,
    level: 1,
    buildProgress: 0,
  };
  w.buildings.push(b);
  return b;
}

function node(w: WorldState, kind: NodeKind, x: number, z: number, amount: number) {
  w.nodes.push({ id: `n${w.nextId++}`, kind, x, z, amount, max: amount });
}

/**
 * Find a spot for a fresh vein on the mine plateau. Keeps veins spread out so
 * a depleted vein sends miners exploring for the next one.
 */
export function spawnVein(w: WorldState, kind?: NodeKind): { x: number; z: number; kind: NodeKind } | null {
  const kinds: NodeKind[] = ['iron', 'iron', 'coal', 'coal', 'copper'];
  const k = kind ?? kinds[Math.floor(Math.random() * kinds.length)];
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 5.5 + Math.random() * 12;
    const x = POS.mine.x + Math.cos(a) * r;
    const z = POS.mine.z + Math.sin(a) * r;
    if (terrainHeight(x, z) < 6.5 || terrainSlope(x, z) > 0.35) continue;
    if (distToRail(x, z) < 4.2) continue;
    if (w.nodes.some((n) => n.amount > 0 && Math.hypot(n.x - x, n.z - z) < 4)) continue;
    const amount = 60 + Math.floor(Math.random() * 70);
    node(w, k, x, z, amount);
    return { x, z, kind: k };
  }
  return null;
}

export function createWorld(): WorldState {
  const w: WorldState = {
    tick: 0,
    time: 0,
    phase: 'day',
    phaseT: 0,
    dayIndex: 1,
    stockpile: emptyStockpile(),
    players: [],
    nodes: [],
    carts: [],
    buildings: [],
    enemies: [],
    projectiles: [],
    techs: {
      sharpPick: { unlocked: false, progress: 0 },
      cartCapacity: { unlocked: false, progress: 0 },
      locomotive: { unlocked: false, progress: 0 },
      bellows: { unlocked: false, progress: 0 },
      steel: { unlocked: false, progress: 0 },
      reinforcedWalls: { unlocked: false, progress: 0 },
    },
    research: null,
    spawnQueue: [],
    nextId: 1,
    gameOver: false,
    nightsSurvived: 0,
  };

  // Starting supplies: one crude tower (stone) plus ore to begin refining.
  w.stockpile.ironOre = 10;
  w.stockpile.coal = 8;
  w.stockpile.stone = 18;

  building(w, 'keep', POS.keep.x, POS.keep.z, KEEP_HP);
  building(w, 'dock', POS.dock.x, POS.dock.z, 250);
  building(w, 'anvil', POS.anvil.x, POS.anvil.z, 150);
  building(w, 'forge', POS.forge.x, POS.forge.z, 200);
  for (const x of WALL_XS) building(w, 'wall', x, WALL_Z, WALL_HP);
  for (const x of GATE_XS) building(w, 'gate', x, WALL_Z, GATE_HP);

  // A little farther from the rail spur than the old cluster, so the cart
  // buffer doesn't sit on top of the first veins.
  node(w, 'iron', -39, -30, 130);
  node(w, 'iron', -43, -27, 110);
  node(w, 'coal', -31, -29, 100);
  node(w, 'coal', -34, -23, 80);
  node(w, 'copper', -45, -33, 90);
  node(w, 'copper', -32, -41, 90);

  w.carts.push({
    id: `c${w.nextId++}`,
    s: RAIL_LENGTH, // start parked at the dock so the day opens at the base
    v: 0,
    load: {},
    loadTotal: 0,
    riderId: null,
  });

  return w;
}

const PLAYER_COLORS = 4;

export function addPlayer(w: WorldState, id: string, name: string): PlayerState {
  const p: PlayerState = {
    id,
    name,
    color: w.players.length % PLAYER_COLORS,
    // Open courtyard between the yard and the wall — not tucked behind the forge.
    x: 5 + w.players.length * 1.6,
    z: 12,
    heading: 0,
    carry: {},
    carryTotal: 0,
    riding: null,
    working: false,
    swung: 0,
    shots: 0,
    atkCd: 0,
    gunCd: 0,
    workT: 0,
    ctxKey: '',
    beatHit: false,
    beatPenalty: 1,
    beatGood: 0,
    beatMiss: 0,
  };
  w.players.push(p);
  return p;
}

export function removePlayer(w: WorldState, id: string) {
  const p = w.players.find((pl) => pl.id === id);
  if (p?.riding) {
    const cart = w.carts.find((c) => c.id === p.riding);
    if (cart) cart.riderId = null;
  }
  w.players = w.players.filter((pl) => pl.id !== id);
}

export function techUnlocked(w: WorldState, id: TechId): boolean {
  return w.techs[id].unlocked;
}
