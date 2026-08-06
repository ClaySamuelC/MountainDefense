export type ResourceId =
  | 'coal'
  | 'stone'
  | 'ironOre'
  | 'copperOre'
  | 'crushedIron'
  | 'crushedCopper'
  | 'ironIngot'
  | 'copperIngot'
  | 'steelIngot';

/**
 * Cost bag. The special 'crude' entry is stone-only (legacy alias for tower /
 * repair / gun costs that still use the crude helpers).
 */
export type Cost = Partial<Record<ResourceId | 'crude', number>>;

export type TechId =
  | 'sharpPick'
  | 'cartCapacity'
  | 'locomotive'
  | 'bellows'
  | 'steel'
  | 'reinforcedWalls';

export type Tier = 'crude' | 'refined';

export type BuildingType =
  | 'keep'
  | 'wall'
  | 'gate'
  | 'anvil'
  | 'forge'
  | 'blastFurnace'
  | 'techhub'
  | 'dock'
  | 'towerArrow'
  | 'towerBallista';

/** Buildings the player can raise from the build menu. */
export type BuildableType = 'towerArrow' | 'towerBallista' | 'blastFurnace';

/** Hand-worked refining stations whose output the player picks. */
export type StationType = 'anvil' | 'forge';

export type EnemyKind = 'runner' | 'brute';
export type NodeKind = 'iron' | 'copper' | 'coal';

export interface PlayerState {
  id: string;
  name: string;
  color: number; // palette index
  x: number;
  z: number;
  heading: number;
  carry: Partial<Record<ResourceId, number>>;
  carryTotal: number;
  riding: string | null; // cart id
  working: boolean;
  swung: number; // increments on melee swing (client anim)
  shots: number; // increments on stone gun shot (client anim)
  atkCd: number;
  gunCd: number;
  workT: number;
  ctxKey: string;
  /** True if the player clicked inside this swing's beat window. */
  beatHit: boolean;
  /** Duration multiplier for the current swing (>1 = slower after a miss). */
  beatPenalty: number;
  /** Client cue: increments on a good beat hit. */
  beatGood: number;
  /** Client cue: increments on a missed beat. */
  beatMiss: number;
}

export interface OreNodeState {
  id: string;
  kind: NodeKind;
  x: number;
  z: number;
  amount: number;
  max: number; // starting amount, for depletion visuals
}

export interface CartState {
  id: string;
  s: number; // arc-length along rail, 0 = mine end
  v: number;
  load: Partial<Record<ResourceId, number>>;
  loadTotal: number;
  riderId: string | null;
}

export interface BuildingState {
  id: string;
  type: BuildingType;
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  tier: Tier | null;
  cd: number; // tower fire cooldown
  ammo: number;
  smeltT: number; // forge / furnace progress 0..1
  smelting: ResourceId | null; // output currently in the fire
  /**
   * Chosen output for a refining station. Stations never silently switch: if
   * the inputs for this recipe are missing, the station simply idles.
   */
  recipe: ResourceId | null;
  /** Blast furnace: charges of iron + coal loaded and waiting to burn. */
  charges: number;
  /** Blast furnace / tower upgrade level, 1-based. */
  level: number;
  /** Fallen wall/gate rebuild progress, 0..1. */
  buildProgress: number;
}

export interface EnemyState {
  id: string;
  kind: EnemyKind;
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  targetId: string | null;
  atkT: number;
  speed: number;
  dmg: number;
  atkPeriod: number;
}

export interface ProjectileState {
  id: string;
  x: number;
  y: number;
  z: number;
  targetId: string;
  dmg: number;
  kind: 'bolt' | 'stone';
}

export interface TechState {
  unlocked: boolean;
  progress: number; // 0..1 while researching
}

export interface SpawnEntry {
  t: number; // seconds into the night
  kind: EnemyKind;
  x: number;
  z: number;
}

export interface WorldState {
  tick: number;
  time: number;
  phase: 'day' | 'night';
  phaseT: number; // 0..1 within phase
  dayIndex: number; // 1-based; night N follows day N
  stockpile: Record<ResourceId, number>;
  players: PlayerState[];
  nodes: OreNodeState[];
  carts: CartState[];
  buildings: BuildingState[];
  enemies: EnemyState[];
  projectiles: ProjectileState[];
  techs: Record<TechId, TechState>;
  research: TechId | null;
  spawnQueue: SpawnEntry[];
  nextId: number;
  gameOver: boolean;
  nightsSurvived: number;
}

export type SimEvent =
  | { type: 'nightStart'; night: number }
  | { type: 'dawn'; day: number }
  | { type: 'smelted'; x: number; z: number; res: ResourceId }
  | { type: 'charged'; x: number; z: number }
  | { type: 'upgraded'; x: number; z: number; level: number }
  | { type: 'hit'; x: number; z: number }
  | { type: 'enemyDied'; x: number; z: number; kind: EnemyKind }
  | { type: 'destroyed'; x: number; z: number }
  | { type: 'research'; tech: TechId }
  | { type: 'built'; x: number; z: number }
  | { type: 'workDone'; pid: string; x: number; z: number }
  | { type: 'beatHit'; pid: string; x: number; z: number; kind: 'mine' | 'anvil' | 'forge' }
  | { type: 'beatMiss'; pid: string; x: number; z: number; kind: 'mine' | 'anvil' | 'forge' }
  | { type: 'veinFound'; x: number; z: number; kind: NodeKind }
  | { type: 'cartBump'; x: number; z: number }
  | { type: 'gameOver' };

export interface PlayerInput {
  mx: number;
  mz: number;
  hold: boolean;
}

export type Intent =
  | { type: 'input'; mx: number; mz: number; hold: boolean }
  | { type: 'mount' }
  | { type: 'attack' }
  /** Stone gun. Optional targetId aims at a specific enemy in range. */
  | { type: 'shoot'; targetId?: string }
  | { type: 'beat' }
  | { type: 'build'; kind: BuildableType; tier: Tier; x: number; z: number }
  | { type: 'research'; tech: TechId }
  | { type: 'setRecipe'; station: StationType; res: ResourceId }
  /** Scroll wheel at the station the player is standing at. */
  | { type: 'cycleRecipe'; dir: number }
  | { type: 'upgradeFurnace' }
  | { type: 'upgradeTower'; buildingId: string };

export interface QueuedIntent {
  sid: string;
  intent: Intent;
}
