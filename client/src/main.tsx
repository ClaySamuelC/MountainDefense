import { createRoot } from 'react-dom/client';
import { App, type AppCallbacks } from './ui/App';
import { store } from './ui/store';
import { Game } from './game/Game';
import { LocalTransport } from './net/local';
import { hostGame, joinGame, type P2PTransport } from './net/p2p';
import { clearSave, hasSave, loadSave } from './net/save';
import type { Transport } from './net/transport';
import './styles.css';

const INTRO_TIP =
  'Gather some resources to build a defensive building before night comes. Monsters will attack.';

let game: Game | null = null;
let transport: Transport | null = null;

function startGame(t: Transport, mode: 'solo' | 'online', opts?: { intro?: boolean }) {
  transport = t;
  store.setTransport(t);
  store.set({
    screen: 'game',
    mode,
    myId: t.myId,
    roomCode: t.roomCode,
    connectError: null,
    snap: null,
    showHint: true,
    buildOpen: false,
    techOpen: false,
    buildSel: null,
    paused: false,
    introTip: opts?.intro ? INTRO_TIP : null,
  });
  (window as any).__mdPaused = false;
  game = new Game(document.getElementById('game-root')!, t);

  const p2p = t as P2PTransport;
  if (mode === 'online' && t.roomCode && t.myId === 'p1') {
    store.toast(`Room code ${t.roomCode} — friends Join with this`, 'good');
  }

  if (typeof p2p.whenDisconnected === 'function') {
    p2p.whenDisconnected((reason) => {
      if (!transport) return;
      leaveGame();
      store.set({ screen: 'menu', connectError: reason });
    });
  }
}

function leaveGame() {
  game?.dispose();
  game = null;
  transport?.dispose();
  transport = null;
  store.setTransport(null);
  store.set({ screen: 'menu', snap: null, roomCode: null, paused: false, introTip: null });
  (window as any).__mdPaused = false;
}

function errMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

function saveSolo(): boolean {
  if (!(transport instanceof LocalTransport)) {
    store.toast('Save is only available in solo', 'warn');
    return false;
  }
  try {
    transport.save();
    store.toast('Expedition saved', 'good');
    return true;
  } catch (err) {
    console.warn(err);
    store.toast('Could not save', 'warn');
    return false;
  }
}

const callbacks: AppCallbacks = {
  onSolo: () => startGame(new LocalTransport(), 'solo', { intro: true }),
  onContinue: () => {
    const world = loadSave();
    if (!world) {
      store.set({ connectError: 'No save found — start a new solo expedition.' });
      return;
    }
    startGame(new LocalTransport(world), 'solo');
    store.toast('Continued from save', 'good');
  },
  onSave: () => {
    saveSolo();
  },
  onDeleteSave: () => {
    clearSave();
    store.toast('Save cleared', 'info');
  },
  hasSave: () => hasSave(),
  onHost: async () => {
    store.set({ screen: 'connecting', connectError: null });
    try {
      startGame(await hostGame('Miner'), 'online');
    } catch (err) {
      store.set({
        screen: 'menu',
        connectError: errMessage(err, 'Could not host — check your network and try again.'),
      });
    }
  },
  onJoin: async (code: string) => {
    store.set({ screen: 'connecting', connectError: null });
    try {
      startGame(await joinGame(code, 'Miner'), 'online');
    } catch (err) {
      store.set({
        screen: 'menu',
        connectError: errMessage(err, `Could not join room "${code}".`),
      });
    }
  },
  onLeave: () => leaveGame(),
};

createRoot(document.getElementById('ui-root')!).render(<App cb={callbacks} />);
