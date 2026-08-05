import type { ResourceId } from '@shared';

const COLORS: Record<ResourceId, string> = {
  coal: '#3b3b44',
  stone: '#b0aca1',
  ironOre: '#a3663f',
  copperOre: '#cd7a3e',
  crushedIron: '#b98a64',
  crushedCopper: '#dd9455',
  ironIngot: '#c3c8d1',
  copperIngot: '#e09a58',
  steelIngot: '#8fa3b8',
};

export function ResIcon({ id, size = 18 }: { id: ResourceId; size?: number }) {
  const c = COLORS[id];
  if (id === 'coal') {
    return (
      <svg width={size} height={size} viewBox="0 0 20 20">
        <circle cx="7" cy="12" r="5" fill={c} />
        <circle cx="13" cy="10" r="4.4" fill="#2b2b33" />
        <circle cx="10" cy="14" r="3.6" fill="#494952" />
      </svg>
    );
  }
  if (id === 'stone') {
    return (
      <svg width={size} height={size} viewBox="0 0 20 20">
        <path d="M4 16 L5 9 L10 6 L15 8 L16 15 L11 17 Z" fill={c} />
        <path d="M5 9 L10 6 L15 8 L10 11 Z" fill="#c9c5ba" />
        <path d="M10 11 L15 8 L16 15 L11 17 Z" fill="#8f8b80" />
      </svg>
    );
  }
  if (id === 'ironOre' || id === 'copperOre') {
    return (
      <svg width={size} height={size} viewBox="0 0 20 20">
        <path d="M4 15 L7 6 L14 5 L17 12 L13 16 L6 17 Z" fill="#8d8577" />
        <circle cx="9" cy="10" r="2" fill={c} />
        <circle cx="13" cy="12" r="1.4" fill={c} />
        <circle cx="8" cy="14" r="1.1" fill={c} />
      </svg>
    );
  }
  if (id === 'crushedIron' || id === 'crushedCopper') {
    return (
      <svg width={size} height={size} viewBox="0 0 20 20">
        <path d="M4 16 L7 10 L10 16 Z" fill={c} />
        <path d="M9 15 L12 8 L15 15 Z" fill={c} opacity="0.85" />
        <path d="M12 17 L14 13 L17 17 Z" fill={c} opacity="0.7" />
      </svg>
    );
  }
  // ingots
  return (
    <svg width={size} height={size} viewBox="0 0 20 20">
      <path d="M4 14 L6 8 L16 8 L18 14 Z" fill={c} />
      <path d="M6 8.6 L7 11 L15.4 11 L16.4 8.6 Z" fill="#ffffff" opacity="0.28" />
    </svg>
  );
}
