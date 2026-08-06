import {
  emptyStockpile,
  type ResourceId,
  type TechId,
  type WorldState,
} from '@shared';

const SAVE_KEY = 'mountain-defense-save';
const SAVE_VERSION = 2;

export interface SaveBlob {
  v: number;
  savedAt: number;
  /** Day / phase label for the Continue button. */
  label: string;
  world: WorldState;
}

export function hasSave(): boolean {
  return peekSave() !== null;
}

export function peekSave(): SaveBlob | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SaveBlob;
    if (!parsed || typeof parsed !== 'object' || !parsed.world) return null;
    if (parsed.v !== SAVE_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function loadSave(): WorldState | null {
  const blob = peekSave();
  if (!blob) return null;
  try {
    return sanitizeWorld(blob.world);
  } catch {
    return null;
  }
}

export function writeSave(world: WorldState): SaveBlob {
  const clean = sanitizeWorld(structuredClone(world));
  // Don't persist mid-flight projectiles — they deserialize poorly mid-tick.
  clean.projectiles = [];
  const blob: SaveBlob = {
    v: SAVE_VERSION,
    savedAt: Date.now(),
    label: saveLabel(clean),
    world: clean,
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(blob));
  return blob;
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

function saveLabel(w: WorldState): string {
  const phase = w.phase === 'night' ? 'Night' : 'Day';
  return `${phase} ${w.dayIndex} · ${w.nightsSurvived} night${w.nightsSurvived === 1 ? '' : 's'} held`;
}

const TECH_IDS: TechId[] = [
  'sharpPick',
  'cartCapacity',
  'locomotive',
  'bellows',
  'steel',
  'reinforcedWalls',
];

const RES_IDS = Object.keys(emptyStockpile()) as ResourceId[];

/** Fill missing fields so older / partial blobs don't crash the sim. */
export function sanitizeWorld(raw: WorldState): WorldState {
  const stock = emptyStockpile();
  for (const r of RES_IDS) stock[r] = Math.max(0, Number(raw.stockpile?.[r] ?? 0) || 0);

  const techs = {} as WorldState['techs'];
  for (const id of TECH_IDS) {
    const t = raw.techs?.[id];
    techs[id] = {
      unlocked: !!t?.unlocked,
      progress: Math.min(1, Math.max(0, Number(t?.progress ?? 0) || 0)),
    };
  }

  const w: WorldState = {
    tick: Math.max(0, Number(raw.tick) || 0),
    time: Math.max(0, Number(raw.time) || 0),
    phase: raw.phase === 'night' ? 'night' : 'day',
    phaseT: clamp01(raw.phaseT),
    dayIndex: Math.max(1, Math.floor(Number(raw.dayIndex) || 1)),
    stockpile: stock,
    players: Array.isArray(raw.players) ? raw.players.map(sanitizePlayer) : [],
    nodes: Array.isArray(raw.nodes) ? raw.nodes : [],
    carts: Array.isArray(raw.carts) ? raw.carts : [],
    buildings: Array.isArray(raw.buildings) ? raw.buildings : [],
    enemies: Array.isArray(raw.enemies) ? raw.enemies : [],
    projectiles: [],
    techs,
    research: (raw.research && TECH_IDS.includes(raw.research) ? raw.research : null) as WorldState['research'],
    spawnQueue: Array.isArray(raw.spawnQueue) ? raw.spawnQueue : [],
    nextId: Math.max(1, Math.floor(Number(raw.nextId) || 1)),
    gameOver: !!raw.gameOver,
    nightsSurvived: Math.max(0, Math.floor(Number(raw.nightsSurvived) || 0)),
  };

  if (w.players.length === 0) {
    throw new Error('Save has no players');
  }
  if (w.buildings.length === 0) {
    throw new Error('Save has no buildings');
  }
  return w;
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
