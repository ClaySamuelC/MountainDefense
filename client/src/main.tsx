import { createRoot } from 'react-dom/client';
import { App, type AppCallbacks } from './ui/App';
import { store } from './ui/store';
import { Game } from './game/Game';
import { LocalTransport } from './net/local';
import { hostGame, joinGame } from './net/remote';
import type { Transport } from './net/transport';
import './styles.css';

let game: Game | null = null;
let transport: Transport | null = null;

function startGame(t: Transport, mode: 'solo' | 'online') {
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
  });
  (window as any).__mdPaused = false;
  game = new Game(document.getElementById('game-root')!, t);
}

function leaveGame() {
  game?.dispose();
  game = null;
  transport?.dispose();
  transport = null;
  store.setTransport(null);
  store.set({ screen: 'menu', snap: null, roomCode: null, paused: false });
  (window as any).__mdPaused = false;
}

const callbacks: AppCallbacks = {
  onSolo: () => startGame(new LocalTransport(), 'solo'),
  onHost: async () => {
    store.set({ screen: 'connecting', connectError: null });
    try {
      startGame(await hostGame('Miner'), 'online');
    } catch (err) {
      store.set({
        screen: 'menu',
        connectError: 'Could not reach the server. Is it running? (npm run dev:server)',
      });
    }
  },
  onJoin: async (code: string) => {
    store.set({ screen: 'connecting', connectError: null });
    try {
      startGame(await joinGame(code, 'Miner'), 'online');
    } catch (err) {
      store.set({ screen: 'menu', connectError: `Could not join room "${code}".` });
    }
  },
  onLeave: () => leaveGame(),
};

createRoot(document.getElementById('ui-root')!).render(<App cb={callbacks} />);
