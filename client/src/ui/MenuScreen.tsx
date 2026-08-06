import { useState } from 'react';
import { peekSave } from '../net/save';
import type { UIState } from './store';

declare const __APP_VERSION__: string;

const MENU_KEYS: [string, string][] = [
  ['WASD', 'move'],
  ['E', 'start work'],
  ['Space', 'hit the beat'],
  ['Wheel', 'pick recipe'],
  ['F', 'ride cart'],
  ['Q', 'stone gun'],
  ['B', 'build'],
  ['T', 'tech'],
  ['P / Esc', 'pause'],
];

export function Menu({
  cb,
  ui,
}: {
  cb: {
    onSolo: () => void;
    onContinue: () => void;
    onDeleteSave: () => void;
    onHost: () => void;
    onJoin: (code: string) => void;
  };
  ui: UIState;
}) {
  const [code, setCode] = useState('');
  const [saveRev, setSaveRev] = useState(0);
  const save = peekSave();
  void saveRev;
  return (
    <div className="menu-bg">
      <div className="menu panel">
        <div className="menu-crest">⛏</div>
        <h1>MOUNTAIN DEFENSE</h1>
        <p className="tagline">Mine by day. Hold the wall by night.</p>
        <p className="menu-version">v{__APP_VERSION__}</p>
        {save && (
          <button className="btn primary" onClick={cb.onContinue}>
            Continue
            <span className="btn-sub">{save.label}</span>
          </button>
        )}
        <button
          className={`btn ${save ? '' : 'primary'}`}
          onClick={() => {
            if (
              save &&
              !window.confirm('Start a new expedition? Playing will overwrite your current save.')
            ) {
              return;
            }
            cb.onSolo();
          }}
        >
          {save ? 'New Solo Expedition' : 'Solo Expedition'}
        </button>
        {save && (
          <button
            className="btn small ghost"
            onClick={() => {
              if (window.confirm('Delete the saved expedition?')) {
                cb.onDeleteSave();
                setSaveRev((n) => n + 1);
              }
            }}
          >
            Clear save
          </button>
        )}
        <div className="menu-row">
          <button className="btn" onClick={cb.onHost}>
            Host Co-op
          </button>
          <div className="join-row">
            <input
              placeholder="4-digit code"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
              onKeyDown={(e) => e.key === 'Enter' && code.length === 4 && cb.onJoin(code)}
            />
            <button className="btn" disabled={code.length !== 4} onClick={() => cb.onJoin(code)}>
              Join
            </button>
          </div>
        </div>
        <p className="menu-coop-note">
          Co-op is peer-to-peer — host stays in the game and shares the 4-digit room code.
        </p>
        {ui.connectError && <p className="error">{ui.connectError}</p>}
        <div className="controls-hint">
          {MENU_KEYS.map(([k, label]) => (
            <span key={k}>
              <kbd>{k}</kbd> {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Connecting() {
  return (
    <div className="menu-bg">
      <div className="menu panel">
        <h2>Connecting…</h2>
        <div className="spinner" />
      </div>
    </div>
  );
}
