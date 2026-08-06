import { useEffect, useRef, useSyncExternalStore, useState, type CSSProperties } from 'react';
import {
  CARRY_CAP,
  FURNACE_CAP,
  FURNACE_CHARGE,
  RESOURCE_HINTS,
  RESOURCE_NAMES,
  RESOURCE_SHORT,
  RESOURCE_STAGE,
  STAGE_LABELS,
  STATION_RECIPES,
  TECHS,
  buildSpec,
  canAfford,
  furnaceLevel,
  furnaceUpgradeCost,
  hasInputs,
  towerCombat,
  towerLevel,
  towerSpec,
  towerUpgradeCost,
  type BuildableType,
  type Cost,
  type ResourceId,
  type StationType,
  type TechId,
  type Tier,
  type WorldState,
} from '@shared';
import { beatHud, store, type UIState } from './store';
import { ResIcon, RES_UI } from './icons';
import { sfx } from '../game/sfx';
import { peekSave } from '../net/save';

declare const __APP_VERSION__: string;

/** Render a cost bag (`crude` is shown as stone). */
function CostChips({ cost, w }: { cost: Cost; w?: WorldState }) {
  return (
    <span className="cost">
      {Object.entries(cost).map(([r, n]) => {
        const short = w ? !canAfford(w, { [r]: n } as Cost) : false;
        if (r === 'crude') {
          return (
            <span key={r} className={short ? 'short' : ''} title={RESOURCE_NAMES.stone}>
              <ResIcon id="stone" size={14} /> {n}
            </span>
          );
        }
        return (
          <span key={r} className={short ? 'short' : ''} title={RESOURCE_NAMES[r as ResourceId]}>
            <ResIcon id={r as ResourceId} size={14} /> {n}
          </span>
        );
      })}
    </span>
  );
}

function useUI(): UIState {
  return useSyncExternalStore(store.subscribe, store.get);
}

function send(intent: Parameters<NonNullable<ReturnType<typeof store.transport>>['send']>[0]) {
  store.transport()?.send(intent);
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

// ---------------------------------------------------------------- menu

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

function Menu({ cb, ui }: { cb: AppCallbacks; ui: UIState }) {
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

function Connecting() {
  return (
    <div className="menu-bg">
      <div className="menu panel">
        <h2>Connecting…</h2>
        <div className="spinner" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- HUD

const HUD_RESOURCES: ResourceId[] = [
  'stone',
  'coal',
  'ironOre',
  'copperOre',
  'crushedIron',
  'crushedCopper',
  'ironIngot',
  'copperIngot',
  'steelIngot',
];

const everSeen = new Set<ResourceId>(['coal', 'ironOre', 'stone']);

function Hud({ cb, ui }: { cb: AppCallbacks; ui: UIState }) {
  const w = ui.snap;
  if (!w) return null;
  const keep = w.buildings.find((b) => b.type === 'keep');
  const me = w.players.find((p) => p.id === ui.myId);

  for (const r of HUD_RESOURCES) if (w.stockpile[r] >= 1) everSeen.add(r);

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

// ---------------------------------------------------------------- timing bar

/**
 * The timing mini-game, front and centre. A marker sweeps the rail and the lit
 * band at the end is the window to click in. Animated by hand on every frame
 * rather than through React state, so the sweep stays smooth.
 */
function BeatBar() {
  const root = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const zone = useRef<HTMLDivElement>(null);
  const grace = useRef<HTMLDivElement>(null);
  const needle = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let raf = 0;
    let prev = performance.now();
    let lastHit = beatHud.hitPulse;
    let lastMiss = beatHud.missPulse;
    let flash = 0;
    let flashGood = true;
    let lastWindow = -1;
    let lastGrace = -1;
    let lastLabel = '';
    // The sim only ticks 20x a second, so carry our own copy of the swing
    // forward every frame and steer it gently back onto the real value.
    let shown = 0;
    let wasActive = false;

    let trackW = 0;
    const measure = () => {
      trackW = track.current?.clientWidth ?? 0;
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (track.current) ro.observe(track.current);

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const el = root.current;
      if (!el) return;
      const now = performance.now();
      const dt = Math.min(0.1, (now - prev) / 1000);
      prev = now;

      if (beatHud.hitPulse !== lastHit) {
        lastHit = beatHud.hitPulse;
        flash = 0.34;
        flashGood = true;
      }
      if (beatHud.missPulse !== lastMiss) {
        lastMiss = beatHud.missPulse;
        flash = 0.34;
        flashGood = false;
      }
      flash = Math.max(0, flash - dt);

      const on = beatHud.active || flash > 0;
      el.classList.toggle('on', on);
      if (!on) {
        wasActive = false;
        return;
      }

      const target = Math.max(0, Math.min(1, beatHud.frac));
      if (!wasActive || target < shown - 0.12 || Math.abs(target - shown) > 0.3) {
        shown = target; // fresh swing, or we drifted badly — just jump
      } else {
        shown = Math.min(1, shown + beatHud.rate * dt);
        shown += (target - shown) * Math.min(1, dt * 8);
      }
      wasActive = true;

      const p = Math.max(0, Math.min(1, shown));
      const inWindow = p >= 1 - beatHud.window;
      const inGrace = p >= 1 - beatHud.window - beatHud.grace;

      if (beatHud.window !== lastWindow || beatHud.grace !== lastGrace) {
        lastWindow = beatHud.window;
        lastGrace = beatHud.grace;
        if (zone.current) zone.current.style.width = `${beatHud.window * 100}%`;
        if (grace.current) {
          grace.current.style.right = `${beatHud.window * 100}%`;
          grace.current.style.width = `${beatHud.grace * 100}%`;
        }
      }
      if (beatHud.label !== lastLabel && label.current) {
        lastLabel = beatHud.label;
        label.current.textContent = beatHud.label;
      }
      if (fill.current) fill.current.style.transform = `scaleX(${Math.max(0.001, p)})`;
      if (needle.current) needle.current.style.transform = `translate3d(${(p * trackW).toFixed(2)}px,0,0)`;

      el.classList.toggle('in-window', inWindow && !beatHud.hit);
      el.classList.toggle('in-grace', inGrace && !beatHud.hit);
      el.classList.toggle('banked', beatHud.hit);
      el.classList.toggle('penalty', beatHud.penalty);
      el.classList.toggle('flash-good', flash > 0 && flashGood);
      el.classList.toggle('flash-miss', flash > 0 && !flashGood);
      el.style.setProperty('--flash', String(flash / 0.34));
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <div className="beat" ref={root}>
      <div className="beat-head">
        <span className="beat-label" ref={label} />
        <span className="beat-penalty-tag">slowed — missed the beat</span>
      </div>
      <div className="beat-track" ref={track}>
        <div className="beat-fill" ref={fill} />
        <div className="beat-grace" ref={grace} />
        <div className="beat-zone" ref={zone}>
          <span>HIT</span>
        </div>
        <div className="beat-needle" ref={needle} />
      </div>
      <div className="beat-tip">
        <span className="beat-tip-wait">Press Space or E while the marker is in the green</span>
        <span className="beat-tip-now">Now — Space or E!</span>
        <span className="beat-tip-done">Beat banked · stay put</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- resources

function ResourceRail({ w }: { w: WorldState }) {
  const shown = HUD_RESOURCES.filter((r) => everSeen.has(r));
  const groups: { stage: string; items: ResourceId[] }[] = [];
  for (const r of shown) {
    const stage = RESOURCE_STAGE[r];
    const last = groups[groups.length - 1];
    if (last && last.stage === stage) last.items.push(r);
    else groups.push({ stage, items: [r] });
  }
  return (
    <div className="res-rail">
      {groups.map((g) => (
        <div className="res-group" key={g.stage} data-stage={g.stage}>
          <span className="res-group-label">{STAGE_LABELS[g.stage as keyof typeof STAGE_LABELS]}</span>
          <div className="res-group-items">
            {g.items.map((r) => {
              const tint = RES_UI[r];
              return (
                <div
                  className="res-chip hud-clickable"
                  key={r}
                  data-res={r}
                  style={
                    {
                      '--res-face': tint.face,
                      '--res-deep': tint.deep,
                      '--res-glow': tint.glow,
                    } as CSSProperties
                  }
                >
                  <span className="res-icon-wrap">
                    <ResIcon id={r} size={22} />
                  </span>
                  <span className="res-meta">
                    <span className="res-tag">{RESOURCE_SHORT[r]}</span>
                    <span className="res-num">{Math.floor(w.stockpile[r])}</span>
                  </span>
                  <div className="tip">
                    <div className="tip-head">
                      <ResIcon id={r} size={24} />
                      <strong>{RESOURCE_NAMES[r]}</strong>
                      <span className="tip-count">{Math.floor(w.stockpile[r])}</span>
                    </div>
                    <p>{RESOURCE_HINTS[r]}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- top status

function DayDial({ w }: { w: WorldState }) {
  const r = 23;
  const circ = 2 * Math.PI * r;
  const isNight = w.phase === 'night';
  const warn = !isNight && w.phaseT > 0.85;
  const stroke = isNight ? '#8f9dff' : warn ? '#ffab40' : '#ffd167';
  const angle = w.phaseT * Math.PI * 2 - Math.PI / 2;
  return (
    <div className={`day-dial ${isNight ? 'night' : ''} ${warn ? 'warn' : ''}`}>
      <svg width="64" height="64" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={r} className="dial-plate" />
        <circle cx="32" cy="32" r={r} className="dial-track" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth="4"
          strokeDasharray={`${circ * w.phaseT} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 32 32)"
        />
        <circle cx={32 + Math.cos(angle) * r} cy={32 + Math.sin(angle) * r} r="3.4" fill={stroke} />
        <text x="32" y="38" textAnchor="middle" fontSize="17" fill={stroke}>
          {isNight ? '☾' : '☀'}
        </text>
      </svg>
      <span className="dial-label">
        {isNight ? `Night ${w.dayIndex}` : `Day ${w.dayIndex}`}
        {warn && <em> · dusk</em>}
      </span>
    </div>
  );
}

function KeepStatus({
  hp,
  maxHp,
  enemies,
  night,
}: {
  hp: number;
  maxHp: number;
  enemies: number;
  night: boolean;
}) {
  const pct = (100 * hp) / maxHp;
  const state = pct > 60 ? 'ok' : pct > 30 ? 'hurt' : 'critical';
  return (
    <div className="keep-status">
      <div className="keep-row">
        <span className="keep-label">KEEP</span>
        <div className={`bar ${state}`}>
          <div className="bar-fill" style={{ width: `${pct}%` }} />
          <div className="bar-ticks" />
        </div>
        <span className="keep-num">{Math.ceil(hp)}</span>
      </div>
      {night && enemies > 0 && (
        <div className="threat">
          <span className="threat-dot" />
          {enemies} on the field
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- stations

function StationPanel({ w, station }: { w: WorldState; station: StationType }) {
  const b = w.buildings.find((bb) => bb.type === station);
  const recipes = STATION_RECIPES[station];
  const selected = b?.recipe ?? recipes[0].out;
  const title = station === 'anvil' ? 'Anvil' : 'Forge';
  return (
    <div className="panel station-panel">
      <div className="station-head">
        <h4>{title}</h4>
        <span className="fine">
          <kbd>Wheel</kbd> or <kbd>R</kbd> to change
        </span>
      </div>
      {recipes.map((rec) => {
        const ok = hasInputs(w, rec.inputs);
        const active = rec.out === selected;
        return (
          <button
            key={rec.out}
            className={`recipe-row ${active ? 'active' : ''} ${ok ? '' : 'short'}`}
            onClick={() => send({ type: 'setRecipe', station, res: rec.out })}
          >
            <span className="recipe-mark">{active ? '●' : '○'}</span>
            <span className="recipe-io">
              {Object.entries(rec.inputs).map(([res, n]) => (
                <span key={res} className="io-item" title={RESOURCE_NAMES[res as ResourceId]}>
                  <ResIcon id={res as ResourceId} size={15} />
                  {(n ?? 1) > 1 && <em>×{n}</em>}
                </span>
              ))}
              <span className="io-arrow">→</span>
              <span className="io-item out" title={RESOURCE_NAMES[rec.out]}>
                <ResIcon id={rec.out} size={17} />
              </span>
            </span>
            <span className="recipe-name">{RESOURCE_NAMES[rec.out]}</span>
          </button>
        );
      })}
      {b && b.smelting && b.smeltT > 0 && (
        <div className="station-progress">
          <div className="eff-meter">
            <div style={{ width: `${Math.min(100, b.smeltT * 100)}%` }} />
          </div>
          <span className="fine">In the fire: {RESOURCE_NAMES[b.smelting]}</span>
        </div>
      )}
    </div>
  );
}

function TowerPanel({ w, id }: { w: WorldState; id: string }) {
  const b = w.buildings.find((bb) => bb.id === id);
  if (!b) return null;
  const base = towerSpec(b.type, b.tier ?? 'crude');
  if (!base) return null;
  const lvl = towerLevel(b.type, b.tier, b.level);
  const combat = towerCombat(b.type, b.tier, b.level)!;
  const upgrade = towerUpgradeCost(b.type, b.tier, b.level);
  const maxed = !upgrade;
  const affordable = upgrade ? canAfford(w, upgrade) : false;
  const name =
    buildSpec(b.type as BuildableType, (b.tier ?? 'crude') as Tier)?.name ?? 'Tower';
  return (
    <div className="panel station-panel tower-panel">
      <div className="station-head">
        <h4>{name}</h4>
        <span className="lvl-badge">
          {lvl.name} · Lv {b.level}
        </span>
      </div>
      <div className="tower-stats">
        <span>
          <em>DMG</em> {combat.dmg.toFixed(1)}
        </span>
        <span>
          <em>RATE</em> {combat.rate.toFixed(2)}/s
        </span>
        <span>
          <em>RANGE</em> {combat.range.toFixed(0)}
        </span>
        <span>
          <em>HP</em> {Math.ceil(b.hp)}/{b.maxHp}
        </span>
      </div>
      {maxed ? (
        <p className="fine good">Tower fully upgraded.</p>
      ) : (
        <button
          className="btn small upgrade"
          disabled={!affordable}
          onClick={() => send({ type: 'upgradeTower', buildingId: b.id })}
        >
          Upgrade <CostChips cost={upgrade!} w={w} />
        </button>
      )}
    </div>
  );
}

function FurnacePanel({ w, id }: { w: WorldState; id: string }) {
  const b = w.buildings.find((bb) => bb.id === id);
  if (!b) return null;
  const lvl = furnaceLevel(b.level);
  const upgrade = furnaceUpgradeCost(b.level);
  const maxed = !upgrade;
  const affordable = upgrade ? canAfford(w, upgrade) : false;
  const canCharge = hasInputs(w, FURNACE_CHARGE) && b.charges < FURNACE_CAP;
  return (
    <div className="panel station-panel furnace-panel">
      <div className="station-head">
        <h4>Blast Furnace</h4>
        <span className="lvl-badge">
          {lvl.name} · Lv {b.level}
        </span>
      </div>

      <div className="furnace-rate">
        <span className="io-item">
          <ResIcon id="ironIngot" size={15} />
        </span>
        <span className="io-item">
          <ResIcon id="coal" size={15} />
          <em>×{FURNACE_CHARGE.coal}</em>
        </span>
        <span className="io-arrow">→</span>
        <span className="io-item out">
          <ResIcon id="steelIngot" size={17} />
        </span>
        <span className="fine">one every {lvl.time}s</span>
      </div>

      <div className="charge-row">
        <span className="fine">Charges</span>
        <div className="pips">
          {Array.from({ length: FURNACE_CAP }, (_, i) => (
            <span key={i} className={`pip ${i < b.charges ? 'lit' : ''}`} />
          ))}
        </div>
        <span className="charge-num">
          {b.charges}
          <em>/{FURNACE_CAP}</em>
        </span>
      </div>

      <div className="eff-meter">
        <div className="steel" style={{ width: `${b.smelting ? Math.min(100, b.smeltT * 100) : 0}%` }} />
      </div>
      <p className="fine">
        {b.smelting
          ? 'Burning — it works whether you watch it or not.'
          : b.charges > 0
            ? 'Stoking up…'
            : canCharge
              ? 'Press E to shovel in iron and coal.'
              : 'Idle — bring iron ingots and coal.'}
      </p>

      {maxed ? (
        <p className="fine good">Draught fully upgraded.</p>
      ) : (
        <button
          className="btn small upgrade"
          disabled={!affordable}
          onClick={() => send({ type: 'upgradeFurnace' })}
        >
          Upgrade draught <CostChips cost={upgrade} w={w} />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- build menu

interface BuildOption {
  kind: BuildableType;
  tier: Tier;
  group: 'defense' | 'industry';
}

const BUILD_OPTIONS: BuildOption[] = [
  { kind: 'towerArrow', tier: 'crude', group: 'defense' },
  { kind: 'towerArrow', tier: 'refined', group: 'defense' },
  { kind: 'towerBallista', tier: 'refined', group: 'defense' },
  { kind: 'blastFurnace', tier: 'crude', group: 'industry' },
];

const BUILD_GROUPS: { id: 'defense' | 'industry'; label: string }[] = [
  { id: 'defense', label: 'Defense' },
  { id: 'industry', label: 'Industry' },
];

function BuildMenu({ ui }: { ui: UIState }) {
  const w = ui.snap!;
  return (
    <div className="panel side-panel">
      <h3>Build</h3>
      {BUILD_GROUPS.map((grp) => (
        <div key={grp.id}>
          <h4>{grp.label}</h4>
          {BUILD_OPTIONS.filter((o) => o.group === grp.id).map((opt) => {
            const spec = buildSpec(opt.kind, opt.tier)!;
            const tower = towerSpec(opt.kind, opt.tier);
            const locked = spec.needsTech && !w.techs[spec.needsTech].unlocked;
            const affordable = canAfford(w, spec.cost);
            const active =
              ui.buildSel?.kind === opt.kind && ui.buildSel?.tier === opt.tier;
            return (
              <button
                key={`${opt.kind}:${opt.tier}`}
                className={`card ${locked || !affordable ? 'disabled' : ''} ${active ? 'active' : ''}`}
                disabled={!!locked}
                onClick={() =>
                  store.set({ buildSel: { kind: opt.kind, tier: opt.tier }, buildOpen: false })
                }
              >
                <div className="card-head">
                  <strong>{spec.name}</strong>
                  <CostChips cost={spec.cost} w={w} />
                </div>
                <p>{locked ? `Requires ${TECHS[spec.needsTech!].name}` : spec.blurb}</p>
                {tower ? (
                  <div className="stat-row">
                    <span>
                      <em>DMG</em> {tower.dmg}
                    </span>
                    <span>
                      <em>RATE</em> {tower.rate}/s
                    </span>
                    <span>
                      <em>RANGE</em> {tower.range}
                    </span>
                    <span>
                      <em>HP</em> {tower.hp}
                    </span>
                  </div>
                ) : (
                  <div className="stat-row">
                    <span>
                      <em>HP</em> {spec.hp}
                    </span>
                    <span>
                      <em>OUTPUT</em> steel, slowly
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      ))}
      <p className="fine">
        Towers reload straight from the stockpile. Refined shots go much further per ingot.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- tech panel

const BRANCH_LABEL = { mining: 'Mining & Haul', refining: 'Refining', defense: 'Defense' } as const;

function TechPanel({ ui }: { ui: UIState }) {
  const w = ui.snap!;
  const branches: ('mining' | 'refining' | 'defense')[] = ['mining', 'refining', 'defense'];
  return (
    <div className="panel side-panel wide">
      <h3>Research</h3>
      {branches.map((br) => (
        <div key={br}>
          <h4>{BRANCH_LABEL[br]}</h4>
          {(Object.entries(TECHS) as [TechId, (typeof TECHS)[TechId]][])
            .filter(([, def]) => def.branch === br)
            .map(([id, def]) => {
              const t = w.techs[id];
              const researching = w.research === id;
              const affordable = canAfford(w, def.cost);
              const busy = w.research !== null;
              return (
                <div key={id} className={`tech-row ${t.unlocked ? 'done' : ''}`}>
                  <div className="tech-info">
                    <strong>
                      {t.unlocked && <span className="tick">✓</span>}
                      {def.name}
                    </strong>
                    <p>{def.desc}</p>
                    {researching && (
                      <div className="eff-meter">
                        <div style={{ width: `${t.progress * 100}%` }} />
                      </div>
                    )}
                  </div>
                  <div className="tech-side">
                    <CostChips cost={def.cost} w={w} />
                    <button
                      className="btn small"
                      disabled={t.unlocked || researching || busy || !affordable}
                      onClick={() => send({ type: 'research', tech: id })}
                    >
                      {t.unlocked
                        ? 'Done'
                        : researching
                          ? `${Math.round(t.progress * 100)}%`
                          : 'Research'}
                    </button>
                  </div>
                </div>
              );
            })}
        </div>
      ))}
    </div>
  );
}
