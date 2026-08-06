import type { EnemyKind, SimEvent, WorldState } from './types';
import {
  ADV_HP_PER_POINT,
  ADV_RUNNERS_PER_POINT,
  ADV_TECH_WEIGHT,
  ADV_TOWER_WEIGHT,
  DAY_LEN,
  DT,
  ENEMY_SPAWNS,
  NIGHT_LEN,
  advancementFromTechs,
  hasCombat,
} from './constants';

export function tickPhase(w: WorldState, ev: SimEvent[]) {
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
  const techAdv = advancementFromTechs(w, ADV_TECH_WEIGHT);
  const towerCount = w.buildings.filter((b) => b.hp > 0 && hasCombat(b.type)).length;
  return techAdv + towerCount * ADV_TOWER_WEIGHT;
}

export function scheduleWave(w: WorldState) {
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

export function tickSpawns(w: WorldState) {
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
