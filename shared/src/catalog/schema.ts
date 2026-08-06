/** Cost bag. The special 'crude' entry is stone-only (legacy alias). */
export type Cost = Partial<Record<string, number>>;

export type Tier = 'crude' | 'refined';

export type BuildingTag =
  | 'defense'
  | 'industry'
  | 'logistics'
  | 'landmark'
  | 'fortification'
  | 'station';

export type StatId =
  | 'mineWorkSpeed'
  | 'anvilWorkSpeed'
  | 'cartCap'
  | 'repairCost'
  | 'forgeSpeed';

export type FlagId = 'locomotive' | 'forgeSlowBurn';

export type Effect =
  | { op: 'mulStat'; stat: StatId; value: number }
  | { op: 'addStat'; stat: StatId; value: number }
  | { op: 'unlockBuilding'; building: string }
  | { op: 'unlockRecipe'; recipe: string }
  | {
      op: 'modBuildingStat';
      building: string | { tag: BuildingTag };
      stat: 'maxHp';
      mul?: number;
      add?: number;
    }
  | { op: 'flag'; flag: FlagId };

export interface ResourceDef {
  name: string;
  short: string;
  hint: string;
  stage: string;
  carry?: boolean;
  stockpile?: boolean;
  stackInCart?: boolean;
}

export interface RecipeDef {
  out: string;
  inputs: Partial<Record<string, number>>;
  /** Short verb phrase for the hold-E prompt. */
  verb: string;
  time?: number;
}

export interface PlaceVariant {
  name: string;
  blurb: string;
  cost: Cost;
  hp: number;
}

export interface PlaceCap {
  footprint: number;
  zone?: 'courtyard';
  maxAlive?: number;
  /** Tier keys that appear in the build menu. */
  variants: Partial<Record<Tier, PlaceVariant>>;
  /** Build menu group. */
  group?: 'defense' | 'industry';
}

export interface CombatCap {
  dmg: number;
  rate: number;
  range: number;
  projectile: 'bolt' | 'stone';
}

export interface IndustryCap {
  mode: 'attended' | 'unattended' | 'charge';
  recipes: string[];
  defaultRecipe?: string;
  /** Resources consumed when charging (charge-mode producers). */
  charge?: Partial<Record<string, number>>;
  chargeCap?: number;
}

export interface LogisticsCap {
  roles: Array<'railDock' | 'railMine' | 'buffer' | 'sink' | 'source'>;
  accepts?: string[] | '*';
  /** Carts unloaded per second at this dock when locomotive is researched. */
  autoUnloadRate?: number;
}

export interface InteractCap {
  work: string;
  label?: string;
}

/** Per-building field upgrades. */
export interface UpgradeLevel {
  name: string;
  /** Seconds per charge (furnace). */
  time?: number;
  dmgMul?: number;
  rateMul?: number;
  rangeMul?: number;
  hpBonus?: number;
  /** Cost to buy this level from the previous one (towers). */
  cost?: Partial<Record<string, number>>;
  /** Cost to buy this level from the previous one (charge buildings). */
  upgrade?: Partial<Record<string, number>>;
}

export interface BuildingDef {
  name: string;
  blurb: string;
  tags: BuildingTag[];
  mesh: string;
  hp: number;
  footprint: number;
  place?: PlaceCap;
  combat?: Partial<Record<Tier, CombatCap>>;
  industry?: IndustryCap;
  logistics?: LogisticsCap;
  interact?: InteractCap;
  /** Tower upgrades keyed by tier, or a flat list for non-tiered buildings. */
  upgrades?: UpgradeLevel[] | Partial<Record<Tier, UpgradeLevel[]>>;
}

export interface TechDef {
  name: string;
  desc: string;
  branch: string;
  cost: Partial<Record<string, number>>;
  time: number;
  requires?: string[];
  effects: Effect[];
  /** Wave pressure weight when unlocked. Default ADV_TECH_WEIGHT. */
  advWeight?: number;
}
