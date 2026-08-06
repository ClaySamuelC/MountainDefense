import { useSyncExternalStore, useState } from 'react';
import { CARRY_CAP, RESOURCE_NAMES, type ResourceId } from '@shared';
import { store, type UIState } from './store';
import { ResIcon } from './icons';
import { sfx } from '../game/sfx';
import { BeatBar } from './BeatBar';
import { ResourceRail, DayDial, KeepStatus } from './HudChrome';
import { Menu, Connecting } from './MenuScreen';
import {
  StationPanel,
  TowerPanel,
  FurnacePanel,
  BuildMenu,
  TechPanel,
} from './SidePanels';

function useUI(): UIState {
  return useSyncExternalStore(store.subscribe, store.get);
}

export interface AppCallbacks {
  onSolo: () => void;
  onContinue: () => void;
  onSave: () => void;
  onDeleteSave: () => void;
  hasSave: () => boolean;
  onHost: () => void;
  onJoin: (code: string) => void;
  onLeave: () => void;
}

export function App({ cb }: { cb: AppCallbacks }) {
  const ui = useUI();
  if (ui.screen === 'menu') return <Menu cb={cb} ui={ui} />;
  if (ui.screen === 'connecting') return <Connecting />;
  return <Hud cb={cb} ui={ui} />;
}

// ---------------------------------------------------------------- HUD

function Hud({ cb, ui }: { cb: AppCallbacks; ui: UIState }) {
  const w = ui.snap;
  if (!w) return null;
  const keep = w.buildings.find((b) => b.type === 'keep');
  const me = w.players.find((p) => p.id === ui.myId);

  return (
    <>
      <ResourceRail w={w} />
      <DayDial w={w} />
      {keep && <KeepStatus hp={keep.hp} maxHp={keep.maxHp} enemies={w.enemies.length} night={w.phase === 'night'} />}

      {me && me.carryTotal > 0 && (
        <div className="carry-chip">
          <span className="carry-label">Pack</span>
          <span className="carry-count">
            {me.carryTotal}
            <em>/{CARRY_CAP}</em>
          </span>
          <span className="carry-items">
            {Object.entries(me.carry).map(([r, n]) => (
              <span key={r} className="carry-item" title={RESOURCE_NAMES[r as ResourceId]}>
                <ResIcon id={r as ResourceId} size={14} /> {n}
              </span>
            ))}
          </span>
        </div>
      )}

      {ui.buildSel ? (
        <div className="prompt place">
          <strong>Click</strong> to place · <kbd>Esc</kbd> to cancel
        </div>
      ) : (
        ui.prompt && <div className="prompt">{ui.prompt}</div>
      )}

      <BeatBar />

      {ui.station && <StationPanel w={w} station={ui.station} />}
      {ui.furnaceId && <FurnacePanel w={w} id={ui.furnaceId} />}
      {ui.towerId && <TowerPanel w={w} id={ui.towerId} />}

      <div className="action-bar hud-clickable">
        <button
          className={`btn small ${ui.buildOpen ? 'active' : ''} ${ui.guide.build ? 'hint-pulse' : ''}`}
          onClick={() => store.set({ buildOpen: !ui.buildOpen, techOpen: false })}
        >
          Build <kbd>B</kbd>
        </button>
        <button
          className={`btn small ${ui.techOpen ? 'active' : ''}`}
          onClick={() => store.set({ techOpen: !ui.techOpen, buildOpen: false })}
        >
          Tech <kbd>T</kbd>
        </button>
        <button
          className={`btn small ${ui.paused ? 'active' : ''}`}
          onClick={() => store.set({ paused: !ui.paused, buildOpen: false, techOpen: false })}
          title="Pause and sound settings"
        >
          Pause <kbd>P</kbd>
        </button>
        {ui.roomCode && <span className="room-code">room {ui.roomCode}</span>}
      </div>

      <div className="toasts">
        {ui.toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>

      {ui.buildOpen && <BuildMenu ui={ui} />}
      {ui.techOpen && <TechPanel ui={ui} />}
      {ui.introTip && <IntroTip text={ui.introTip} />}
      {ui.showHint && !ui.introTip && (
        <div className="hint">
          <kbd>WASD</kbd> move · <kbd>E</kbd> work / beat · <strong>Space on the beat</strong> ·{' '}
          <kbd>F</kbd> ride cart · <kbd>Q</kbd> stone gun · <kbd>P</kbd> pause
        </div>
      )}
      {ui.paused && <PauseMenu cb={cb} ui={ui} />}
      {w.gameOver && (
        <div className="overlay">
          <div className="panel gameover">
            <h2>The Keep Has Fallen</h2>
            <p>
              You survived {w.nightsSurvived} night{w.nightsSurvived === 1 ? '' : 's'}.
            </p>
            <button className="btn primary" onClick={cb.onLeave}>
              Return to Camp
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function IntroTip({ text }: { text: string }) {
  return (
    <button
      type="button"
      className="intro-tip hud-clickable"
      onClick={() => store.set({ introTip: null })}
    >
      <strong>First day</strong>
      <p>{text}</p>
      <span className="intro-tip-dismiss">Click or press E to dismiss</span>
    </button>
  );
}

function PauseMenu({ cb, ui }: { cb: AppCallbacks; ui: UIState }) {
  const [vol, setVol] = useState(() => sfx.getVolume());
  const [muted, setMuted] = useState(() => sfx.muted);
  const solo = ui.mode === 'solo';
  return (
    <div className="overlay pause-overlay">
      <div className="panel pause-panel hud-clickable">
        <h2>Paused</h2>
        <p className="tagline">The mountain waits.</p>
        <label className="sound-row">
          <span>Sound</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : vol}
            onChange={(e) => {
              const v = Number(e.target.value);
              setVol(v);
              setMuted(v <= 0.001);
              sfx.setMuted(v <= 0.001);
              sfx.setVolume(Math.max(0.01, v));
              sfx.ui();
            }}
          />
          <em>{muted || vol <= 0.001 ? 'Off' : `${Math.round(vol * 100)}%`}</em>
        </label>
        <button
          className={`btn small toggle ${muted ? 'off' : ''}`}
          onClick={() => {
            const next = !muted;
            setMuted(next);
            sfx.setMuted(next);
            sfx.ui();
          }}
        >
          {muted ? 'Unmute' : 'Mute'}
        </button>
        <label className="sound-row debug-row">
          <span>Debug mode</span>
          <input
            type="checkbox"
            checked={!!ui.snap?.debug}
            onChange={(e) => {
              const on = e.target.checked;
              sfx.ui();
              store.transport()?.send({ type: 'setDebug', enabled: on });
              try {
                localStorage.setItem('md-debug', on ? '1' : '0');
              } catch {
                /* ignore */
              }
              store.toast(
                on ? 'Debug on — build & research are free and instant' : 'Debug off',
                on ? 'warn' : 'info',
              );
            }}
          />
          <em>{ui.snap?.debug ? 'On' : 'Off'}</em>
        </label>
        <div className="pause-actions">
          <button
            className="btn primary"
            onClick={() => {
              sfx.ui();
              store.set({ paused: false });
            }}
          >
            Resume
          </button>
          {solo && (
            <button
              className="btn"
              onClick={() => {
                sfx.ui();
                cb.onSave();
              }}
            >
              Save expedition
            </button>
          )}
          <button className="btn" onClick={cb.onLeave}>
            Leave expedition
          </button>
        </div>
        <p className="fine">
          <kbd>P</kbd> or <kbd>Esc</kbd> to resume
          {solo ? ' · solo autosaves' : ''}
        </p>
      </div>
    </div>
  );
}
