import {
  BEAT_EARLY_FORGIVE,
  BEAT_WINDOW,
  type BuildableType,
  type StationType,
  type Tier,
  type WorldState,
} from '@shared';
import type { Transport } from '../net/transport';

/**
 * Timing mini-game read-out for the local player. Written by the renderer every
 * frame and animated straight into the DOM, so the needle is smooth without
 * pushing 60 state updates a second through React.
 */
export interface BeatHud {
  active: boolean;
  /** Swing progress from the newest snapshot, 0..1. */
  frac: number;
  /** How fast frac climbs, per second — lets the HUD run between sim ticks. */
  rate: number;
  /** Share of the swing at the end that is the lit hit window. */
  window: number;
  /** Extra acceptance just before the window; a tap here still banks. */
  grace: number;
  /** The beat for this swing is already banked. */
  hit: boolean;
  /** Last swing was missed, so this one is slowed. */
  penalty: boolean;
  label: string;
  hitPulse: number;
  missPulse: number;
}

export const beatHud: BeatHud = {
  active: false,
  frac: 0,
  rate: 1,
  window: BEAT_WINDOW,
  grace: BEAT_EARLY_FORGIVE,
  hit: false,
  penalty: false,
  label: '',
  hitPulse: 0,
  missPulse: 0,
};

export interface BuildSelection {
  kind: BuildableType;
  tier: Tier;
}

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'warn' | 'good';
}

export interface UIState {
  screen: 'menu' | 'connecting' | 'game';
  mode: 'solo' | 'online' | null;
  connectError: string | null;
  roomCode: string | null;
  myId: string;
  snap: WorldState | null;
  prompt: string;
  buildSel: BuildSelection | null;
  buildOpen: boolean;
  techOpen: boolean;
  nearTechHub: boolean;
  /** Refining station the local player is standing at, if any. */
  station: StationType | null;
  /** Blast furnace the local player is standing at, if any. */
  furnaceId: string | null;
  /** Standing tower the local player can upgrade, if any. */
  towerId: string | null;
  /** Solo pause overlay (also hosts the sound menu). */
  paused: boolean;
  toasts: Toast[];
  showHint: boolean;
}

let state: UIState = {
  screen: 'menu',
  mode: null,
  connectError: null,
  roomCode: null,
  myId: '',
  snap: null,
  prompt: '',
  buildSel: null,
  buildOpen: false,
  techOpen: false,
  nearTechHub: false,
  station: null,
  furnaceId: null,
  towerId: null,
  paused: false,
  toasts: [],
  showHint: true,
};

let transport: Transport | null = null;
const listeners = new Set<() => void>();
let toastId = 1;

export const store = {
  get: () => state,
  set(partial: Partial<UIState>) {
    state = { ...state, ...partial };
    for (const l of listeners) l();
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  setTransport(t: Transport | null) {
    transport = t;
  },
  transport: () => transport,
  toast(text: string, kind: Toast['kind'] = 'info') {
    const id = toastId++;
    state = { ...state, toasts: [...state.toasts, { id, text, kind }].slice(-4) };
    for (const l of listeners) l();
    window.setTimeout(() => {
      state = { ...state, toasts: state.toasts.filter((t) => t.id !== id) };
      for (const l of listeners) l();
    }, 4200);
  },
};
