import type { CSSProperties } from 'react';
import {
  RESOURCE_HINTS,
  RESOURCE_IDS,
  RESOURCE_NAMES,
  RESOURCE_SHORT,
  RESOURCE_STAGE,
  STAGE_LABELS,
  type ResourceId,
  type WorldState,
} from '@shared';
import { ResIcon, RES_UI } from './icons';

/** Preferred HUD order; any new catalog resources append automatically. */
const HUD_PREFERRED: ResourceId[] = [
  'stone',
  'coal',
  'ironOre',
  'copperOre',
  'crushedIron',
  'crushedCopper',
  'ironIngot',
  'copperIngot',
  'steelIngot',
];
const HUD_RESOURCES: ResourceId[] = [
  ...HUD_PREFERRED.filter((r) => RESOURCE_IDS.includes(r)),
  ...RESOURCE_IDS.filter((r) => !HUD_PREFERRED.includes(r)),
];

const everSeen = new Set<ResourceId>(['coal', 'ironOre', 'stone']);

export function ResourceRail({ w }: { w: WorldState }) {
  for (const r of HUD_RESOURCES) if (w.stockpile[r] >= 1) everSeen.add(r);
  const shown = HUD_RESOURCES.filter((r) => everSeen.has(r));
  const groups: { stage: string; items: ResourceId[] }[] = [];
  for (const r of shown) {
    const stage = RESOURCE_STAGE[r];
    const last = groups[groups.length - 1];
    if (last && last.stage === stage) last.items.push(r);
    else groups.push({ stage, items: [r] });
  }
  return (
    <div className="res-rail">
      {groups.map((g) => (
        <div className="res-group" key={g.stage} data-stage={g.stage}>
          <span className="res-group-label">{STAGE_LABELS[g.stage as keyof typeof STAGE_LABELS]}</span>
          <div className="res-group-items">
            {g.items.map((r) => {
              const tint = RES_UI[r];
              return (
                <div
                  className="res-chip hud-clickable"
                  key={r}
                  data-res={r}
                  style={
                    {
                      '--res-face': tint.face,
                      '--res-deep': tint.deep,
                      '--res-glow': tint.glow,
                    } as CSSProperties
                  }
                >
                  <span className="res-icon-wrap">
                    <ResIcon id={r} size={22} />
                  </span>
                  <span className="res-meta">
                    <span className="res-tag">{RESOURCE_SHORT[r]}</span>
                    <span className="res-num">{Math.floor(w.stockpile[r])}</span>
                  </span>
                  <div className="tip">
                    <div className="tip-head">
                      <ResIcon id={r} size={24} />
                      <strong>{RESOURCE_NAMES[r]}</strong>
                      <span className="tip-count">{Math.floor(w.stockpile[r])}</span>
                    </div>
                    <p>{RESOURCE_HINTS[r]}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function DayDial({ w }: { w: WorldState }) {
  const r = 23;
  const circ = 2 * Math.PI * r;
  const isNight = w.phase === 'night';
  const warn = !isNight && w.phaseT > 0.85;
  const stroke = isNight ? '#8f9dff' : warn ? '#ffab40' : '#ffd167';
  const angle = w.phaseT * Math.PI * 2 - Math.PI / 2;
  return (
    <div className={`day-dial ${isNight ? 'night' : ''} ${warn ? 'warn' : ''}`}>
      <svg width="64" height="64" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={r} className="dial-plate" />
        <circle cx="32" cy="32" r={r} className="dial-track" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth="4"
          strokeDasharray={`${circ * w.phaseT} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 32 32)"
        />
        <circle cx={32 + Math.cos(angle) * r} cy={32 + Math.sin(angle) * r} r="3.4" fill={stroke} />
        <text x="32" y="38" textAnchor="middle" fontSize="17" fill={stroke}>
          {isNight ? '☾' : '☀'}
        </text>
      </svg>
      <span className="dial-label">
        {isNight ? `Night ${w.dayIndex}` : `Day ${w.dayIndex}`}
        {warn && <em> · dusk</em>}
      </span>
    </div>
  );
}

export function KeepStatus({
  hp,
  maxHp,
  enemies,
  night,
}: {
  hp: number;
  maxHp: number;
  enemies: number;
  night: boolean;
}) {
  const pct = (100 * hp) / maxHp;
  const state = pct > 60 ? 'ok' : pct > 30 ? 'hurt' : 'critical';
  return (
    <div className="keep-status">
      <div className="keep-row">
        <span className="keep-label">KEEP</span>
        <div className={`bar ${state}`}>
          <div className="bar-fill" style={{ width: `${pct}%` }} />
          <div className="bar-ticks" />
        </div>
        <span className="keep-num">{Math.ceil(hp)}</span>
      </div>
      {night && enemies > 0 && (
        <div className="threat">
          <span className="threat-dot" />
          {enemies} on the field
        </div>
      )}
    </div>
  );
}
