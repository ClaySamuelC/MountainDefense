import type { NodeKind, ResourceId } from '@shared';

export const PLAYER_COLORS = ['#4f8fdd', '#dd6a4f', '#5cb85c', '#d8b743'];

export const RES_COLORS: Record<ResourceId, string> = {
  coal: '#33333a',
  stone: '#a8a49a',
  ironOre: '#9a5f3f',
  copperOre: '#c8763a',
  crushedIron: '#b07a54',
  crushedCopper: '#d9884d',
  ironIngot: '#b9bec7',
  copperIngot: '#d98a4a',
  steelIngot: '#7f93a8',
};

export const CRYSTAL_COLORS: Record<NodeKind, string> = {
  iron: '#e0956a',
  copper: '#ffab5e',
  coal: '#54545e',
};

export const NODE_COLORS: Record<NodeKind, string> = {
  iron: '#8f5636',
  copper: '#c8763a',
  coal: '#2e2e34',
};
