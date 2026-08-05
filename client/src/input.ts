import type { Transport } from './net/transport';
import { store } from './ui/store';
import { sfx } from './game/sfx';

// Camera-relative movement basis (fixed isometric yaw, camera sits at +x/+z).
const FWD = { x: -Math.SQRT1_2, z: -Math.SQRT1_2 }; // W = screen-up
const RIGHT = { x: Math.SQRT1_2, z: -Math.SQRT1_2 }; // D = screen-right

export class InputManager {
  keys = new Set<string>();
  mouse = { x: 0, y: 0, inside: false };
  zoomDelta = 0;
  /** Enemy id under the cursor for aimed stone-gun shots. */
  aimEnemyId: string | null = null;
  private rmbHeld = false;
  private lastCycle = 0;
  /** Sticky work mode: press E to enter, any move cancels. */
  private working = false;
  private lastSent = { mx: 0, mz: 0, hold: false };
  private sendTimer: number;
  private disposers: (() => void)[] = [];

  constructor(
    private transport: Transport,
    private onPlaceClick: () => void,
  ) {
    const down = (e: KeyboardEvent) => this.onKeyDown(e);
    const up = (e: KeyboardEvent) => this.keys.delete(e.code);
    const blur = () => {
      this.keys.clear();
      this.rmbHeld = false;
      this.working = false;
    };
    const move = (e: MouseEvent) => {
      this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      this.mouse.inside = true;
    };
    const click = (e: MouseEvent) => {
      sfx.resume();
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('#ui-root .panel, #ui-root .hud-clickable')) return;
      if (e.button === 2) {
        if (store.get().buildSel) store.set({ buildSel: null });
        else this.rmbHeld = true;
        return;
      }
      if (e.button !== 0) return;
      if (store.get().buildSel) {
        this.onPlaceClick();
        return;
      }
    };
    const mouseUp = (e: MouseEvent) => {
      if (e.button === 2) this.rmbHeld = false;
    };
    const contextMenu = (e: Event) => e.preventDefault();
    const wheel = (e: WheelEvent) => {
      // At the anvil or the forge the wheel picks what you are making instead
      // of zooming — the station is right there, so that is what you mean.
      if (store.get().station && Math.abs(e.deltaY) > 0.5) {
        const now = performance.now();
        if (now - this.lastCycle < 90) return;
        this.lastCycle = now;
        sfx.ui();
        this.transport.send({ type: 'cycleRecipe', dir: e.deltaY > 0 ? 1 : -1 });
        return;
      }
      this.zoomDelta += e.deltaY * 0.02;
    };

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    window.addEventListener('mousemove', move);
    window.addEventListener('mousedown', click);
    window.addEventListener('mouseup', mouseUp);
    window.addEventListener('contextmenu', contextMenu);
    window.addEventListener('wheel', wheel, { passive: true });
    this.disposers.push(() => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mousedown', click);
      window.removeEventListener('mouseup', mouseUp);
      window.removeEventListener('contextmenu', contextMenu);
      window.removeEventListener('wheel', wheel);
    });

    this.sendTimer = window.setInterval(() => this.sendInput(), 66);
  }

  private onKeyDown(e: KeyboardEvent) {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    if ((e.target as HTMLElement)?.tagName === 'RANGE') return;
    sfx.resume();
    this.keys.add(e.code);
    const ui = store.get();
    if (ui.showHint) store.set({ showHint: false });

    switch (e.code) {
      case 'KeyE':
        // First press enters work mode; further presses also hit the beat.
        if (this.working) this.transport.send({ type: 'beat' });
        this.working = true;
        break;
      case 'KeyF':
        this.transport.send({ type: 'mount' });
        break;
      case 'Space':
        // Timing beat while mining / anvil / forge (sim gates it when idle)
        this.transport.send({ type: 'beat' });
        e.preventDefault();
        break;
      case 'KeyB':
        if (ui.paused) break;
        sfx.ui();
        store.set({ buildOpen: !ui.buildOpen, techOpen: false, buildSel: null });
        break;
      case 'KeyT':
        if (ui.paused) break;
        sfx.ui();
        store.set({ techOpen: !ui.techOpen, buildOpen: false, buildSel: null });
        break;
      case 'KeyR':
        // Keyboard twin of scrolling at a station, for trackpad players
        if (ui.station) {
          sfx.ui();
          this.transport.send({ type: 'cycleRecipe', dir: 1 });
        }
        break;
      case 'KeyP':
      case 'Escape':
        if (ui.buildOpen || ui.techOpen || ui.buildSel) {
          store.set({ buildOpen: false, techOpen: false, buildSel: null });
        } else {
          sfx.ui();
          store.set({ paused: !ui.paused, buildOpen: false, techOpen: false });
        }
        break;
    }
  }

  private sendInput() {
    if (store.get().paused) return;

    let mx = 0;
    let mz = 0;
    const k = this.keys;
    const f = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    const r = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    mx = FWD.x * f + RIGHT.x * r;
    mz = FWD.z * f + RIGHT.z * r;
    const len = Math.hypot(mx, mz);
    if (len > 1) {
      mx /= len;
      mz /= len;
    }
    // Any movement drops work mode — you leave the timing event by walking off.
    if (len > 0.05) this.working = false;

    const hold = this.working;
    const last = this.lastSent;
    if (mx !== last.mx || mz !== last.mz || hold !== last.hold || Math.random() < 0.2) {
      this.lastSent = { mx, mz, hold };
      this.transport.send({ type: 'input', mx, mz, hold });
    }

    if (k.has('KeyQ') || this.rmbHeld) {
      this.transport.send({
        type: 'shoot',
        ...(this.aimEnemyId ? { targetId: this.aimEnemyId } : {}),
      });
    }
  }

  consumeZoom(): number {
    const d = this.zoomDelta;
    this.zoomDelta = 0;
    return d;
  }

  dispose() {
    window.clearInterval(this.sendTimer);
    for (const d of this.disposers) d();
  }
}
