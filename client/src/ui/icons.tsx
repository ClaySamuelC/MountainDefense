import type { ResourceId } from '@shared';

/** Saturated face colors — intentionally farther apart than the old earthy set. */
export const RES_UI: Record<ResourceId, { face: string; deep: string; glow: string }> = {
  coal: { face: '#2a2d38', deep: '#12141a', glow: '#6b7288' },
  stone: { face: '#c5c0b4', deep: '#7a7568', glow: '#ebe6d8' },
  ironOre: { face: '#8b3a22', deep: '#4a1c10', glow: '#e07a4a' },
  copperOre: { face: '#e8872a', deep: '#8a4510', glow: '#ffd08a' },
  crushedIron: { face: '#c4784e', deep: '#6e3a24', glow: '#f0b090' },
  crushedCopper: { face: '#f0a040', deep: '#9a5518', glow: '#ffe0a0' },
  ironIngot: { face: '#d0d6e2', deep: '#6a7388', glow: '#ffffff' },
  copperIngot: { face: '#f0a050', deep: '#a05018', glow: '#ffe8b8' },
  steelIngot: { face: '#6a8eae', deep: '#243848', glow: '#c8e4ff' },
};

export function ResIcon({ id, size = 22 }: { id: ResourceId; size?: number }) {
  const c = RES_UI[id];
  if (id === 'coal') {
    return (
      <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden>
        <circle cx="8" cy="13" r="5.2" fill={c.face} stroke={c.glow} strokeWidth="0.6" />
        <circle cx="14.5" cy="10.5" r="4.6" fill={c.deep} stroke={c.glow} strokeWidth="0.5" />
        <circle cx="11" cy="15.5" r="3.4" fill="#3a3e4c" />
        <path d="M6 11.5 L7.5 10 L8.2 11.8 Z" fill={c.glow} opacity="0.55" />
      </svg>
    );
  }
  if (id === 'stone') {
    return (
      <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden>
        <path d="M4 16.5 L5.5 8.5 L11 5.5 L17 8 L18.5 16 L12 18.5 Z" fill={c.face} stroke={c.deep} strokeWidth="0.8" />
        <path d="M5.5 8.5 L11 5.5 L17 8 L11.5 11.5 Z" fill={c.glow} opacity="0.55" />
        <path d="M8 14 L10 12.5 L12.5 15" stroke={c.deep} strokeWidth="1" fill="none" opacity="0.5" />
      </svg>
    );
  }
  if (id === 'ironOre' || id === 'copperOre') {
    return (
      <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden>
        <path
          d="M3.5 15.5 L7 5.5 L15 4.5 L19 12.5 L14.5 17.5 L5.5 18 Z"
          fill="#6e675c"
          stroke="#3a3630"
          strokeWidth="0.7"
        />
        <circle cx="9" cy="10.5" r="2.4" fill={c.face} stroke={c.deep} strokeWidth="0.6" />
        <circle cx="14" cy="12.5" r="1.8" fill={c.face} />
        <circle cx="8.5" cy="14.5" r="1.3" fill={c.glow} opacity="0.85" />
        <circle cx="13" cy="8.5" r="1.1" fill={c.deep} />
      </svg>
    );
  }
  if (id === 'crushedIron' || id === 'crushedCopper') {
    return (
      <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden>
        <path d="M3.5 17 L7.5 9.5 L11.5 17 Z" fill={c.face} stroke={c.deep} strokeWidth="0.5" />
        <path d="M9 16.5 L13 7.5 L17 16.5 Z" fill={c.glow} opacity="0.9" stroke={c.deep} strokeWidth="0.4" />
        <path d="M13.5 18 L16 12.5 L19.5 18 Z" fill={c.face} opacity="0.8" />
        <circle cx="10" cy="14" r="0.7" fill={c.deep} />
        <circle cx="14.5" cy="13" r="0.6" fill={c.deep} />
      </svg>
    );
  }
  // Ingots — distinct silhouette + metal edge
  const notch = id === 'steelIngot' ? 1.2 : 0;
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden>
      <path
        d={`M3.5 ${14.5 - notch} L6 7 L16.5 7 L19 ${14.5 - notch} L16.5 ${17.5 - notch} L6 ${17.5 - notch} Z`}
        fill={c.face}
        stroke={c.deep}
        strokeWidth="0.9"
      />
      <path d="M6.2 8 L7.2 11.2 L15.8 11.2 L16.6 8 Z" fill={c.glow} opacity="0.4" />
      {id === 'steelIngot' && (
        <path d="M8 13.5 H14.5" stroke={c.glow} strokeWidth="1.1" strokeLinecap="round" opacity="0.7" />
      )}
    </svg>
  );
}
