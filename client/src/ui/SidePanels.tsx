import {
  FURNACE_CAP,
  FURNACE_CHARGE,
  RESOURCE_NAMES,
  STATION_RECIPES,
  TECHS,
  TECH_BRANCH_LABELS,
  TECH_IDS,
  buildOptions,
  buildSpec,
  buildingUnlocked,
  canAfford,
  furnaceLevel,
  furnaceUpgradeCost,
  hasInputs,
  techRequiresMet,
  towerCombat,
  towerLevel,
  towerSpec,
  towerUpgradeCost,
  unlockTechForBuilding,
  type BuildableType,
  type ResourceId,
  type StationType,
  type TechId,
  type Tier,
  type WorldState,
} from '@shared';
import { CostChips } from './CostChips';
import { ResIcon } from './icons';
import { store, type UIState } from './store';

function send(intent: Parameters<NonNullable<ReturnType<typeof store.transport>>['send']>[0]) {
  store.transport()?.send(intent);
}

export function StationPanel({ w, station }: { w: WorldState; station: StationType }) {
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

export function TowerPanel({ w, id }: { w: WorldState; id: string }) {
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

export function FurnacePanel({ w, id }: { w: WorldState; id: string }) {
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

const BUILD_GROUPS: { id: 'defense' | 'industry'; label: string }[] = [
  { id: 'defense', label: 'Defense' },
  { id: 'industry', label: 'Industry' },
];

export function BuildMenu({ ui }: { ui: UIState }) {
  const w = ui.snap!;
  const options = buildOptions();
  return (
    <div className="panel side-panel">
      <h3>Build</h3>
      {BUILD_GROUPS.map((grp) => (
        <div key={grp.id}>
          <h4>{grp.label}</h4>
          {options
            .filter((o) => o.group === grp.id)
            .map((opt) => {
              const spec = buildSpec(opt.kind, opt.tier)!;
              const tower = towerSpec(opt.kind, opt.tier);
              const locked = !w.debug && !buildingUnlocked(w, opt.kind);
              const unlockTech = locked ? unlockTechForBuilding(opt.kind) : null;
              const affordable = w.debug || canAfford(w, spec.cost);
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
                    {w.debug ? <span className="fine">Free</span> : <CostChips cost={spec.cost} w={w} />}
                  </div>
                  <p>
                    {locked && unlockTech
                      ? `Requires ${TECHS[unlockTech].name}`
                      : spec.blurb}
                  </p>
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
        Towers fire for free. Refined frames hit harder and reach farther.
      </p>
    </div>
  );
}

export function TechPanel({ ui }: { ui: UIState }) {
  const w = ui.snap!;
  const branches = [...new Set(TECH_IDS.map((id) => TECHS[id].branch))];
  return (
    <div className="panel side-panel wide">
      <h3>Research</h3>
      {branches.map((br) => (
        <div key={br}>
          <h4>{TECH_BRANCH_LABELS[br] ?? br}</h4>
          {TECH_IDS.filter((id) => TECHS[id].branch === br).map((id) => {
            const def = TECHS[id];
            const t = w.techs[id];
            const researching = w.research === id;
            const affordable = w.debug || canAfford(w, def.cost);
            const busy = !w.debug && w.research !== null;
            const prereqOk = w.debug || techRequiresMet(w, id);
            const blocked = !prereqOk && !t.unlocked;
            const prereqNames = (def.requires ?? [])
              .filter((r: string) => !w.techs[r as TechId]?.unlocked)
              .map((r: string) => TECHS[r as TechId]?.name ?? r);
            return (
              <div key={id} className={`tech-row ${t.unlocked ? 'done' : ''}`}>
                <div className="tech-info">
                  <strong>
                    {t.unlocked && <span className="tick">✓</span>}
                    {def.name}
                  </strong>
                  <p>
                    {blocked && prereqNames.length
                      ? `Requires ${prereqNames.join(', ')}`
                      : def.desc}
                  </p>
                  {researching && (
                    <div className="eff-meter">
                      <div style={{ width: `${t.progress * 100}%` }} />
                    </div>
                  )}
                </div>
                <div className="tech-side">
                  {w.debug ? <span className="fine">Instant</span> : <CostChips cost={def.cost} w={w} />}
                  <button
                    className="btn small"
                    disabled={t.unlocked || researching || busy || !affordable || !prereqOk}
                    onClick={() => send({ type: 'research', tech: id })}
                  >
                    {t.unlocked
                      ? 'Done'
                      : researching
                        ? `${Math.round(t.progress * 100)}%`
                        : blocked
                          ? 'Locked'
                          : w.debug
                            ? 'Unlock'
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
