import { sanitizeWorld, type WorldState } from '@shared';

const SAVE_KEY = 'mountain-defense-save';
/**
 * Bump when WorldState / catalog shape can no longer load older blobs.
 * Policy: mismatch wipes the save (no migrators). Additive resource/tech IDs
 * and missing entity fields are filled by sanitizeWorld.
 */
export const SAVE_VERSION = 4;

const STALE_NOTICE_KEY = 'mountain-defense-stale-save';

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

/**
 * Read a compatible save, or discard an incompatible/corrupt one.
 * Older versions are cleared so Continue never offers a broken expedition.
 */
export function peekSave(): SaveBlob | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SaveBlob;
    if (!parsed || typeof parsed !== 'object' || !parsed.world) {
      clearSave();
      return null;
    }
    if (parsed.v !== SAVE_VERSION) {
      clearSave();
      markStaleSaveDiscarded(parsed.v);
      return null;
    }
    return parsed;
  } catch {
    clearSave();
    return null;
  }
}

export function loadSave(): WorldState | null {
  const blob = peekSave();
  if (!blob) return null;
  try {
    return sanitizeWorld(blob.world);
  } catch {
    clearSave();
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

function markStaleSaveDiscarded(fromVersion: unknown): void {
  try {
    localStorage.setItem(
      STALE_NOTICE_KEY,
      JSON.stringify({ from: fromVersion ?? 'unknown', at: Date.now() }),
    );
  } catch {
    /* ignore */
  }
}

/** One-shot message after an incompatible save was wiped. */
export function consumeStaleSaveNotice(): string | null {
  try {
    const raw = localStorage.getItem(STALE_NOTICE_KEY);
    if (!raw) return null;
    localStorage.removeItem(STALE_NOTICE_KEY);
    const parsed = JSON.parse(raw) as { from?: unknown };
    const from = parsed?.from;
    return from != null && from !== 'unknown'
      ? `Save from an older version (v${from}) was cleared — start a new expedition.`
      : 'Save from an older version was cleared — start a new expedition.';
  } catch {
    try {
      localStorage.removeItem(STALE_NOTICE_KEY);
    } catch {
      /* ignore */
    }
    return 'Save from an older version was cleared — start a new expedition.';
  }
}

function saveLabel(w: WorldState): string {
  const phase = w.phase === 'night' ? 'Night' : 'Day';
  return `${phase} ${w.dayIndex} · ${w.nightsSurvived} night${w.nightsSurvived === 1 ? '' : 's'} held`;
}

export { sanitizeWorld };
