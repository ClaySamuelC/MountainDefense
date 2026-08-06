import * as THREE from 'three';
import {
  BEAT_EARLY_FORGIVE,
  BEAT_WINDOW,
  CARRY_CAP,
  ENEMY_SPAWNS,
  GUN_RANGE,
  POS,
  REACH_MOUNT,
  RESOURCE_NAMES,
  TECHS,
  VEIN_LABELS,
  buildSpec,
  canAfford,
  contextReady,
  findRecipe,
  furnaceLevel,
  getContext,
  hasCombat,
  isBeatWork,
  isChargeBuilding,
  placeError,
  railPosAt,
  stat,
  terrainHeight,
  towerSpec,
  workDuration,
  type BuildableType,
  type ResourceId,
  type SimEvent,
  type Tier,
  type WorldState,
} from '@shared';
import type { Transport } from '../net/transport';
import { InputManager } from '../input';
import { beatHud, store } from '../ui/store';
import { buildTerrain, scatterDecorations } from './terrainMesh';
import { buildTrack } from './trackMesh';
import {
  RES_COLORS,
  makeCloud,
  makeCrystalCluster,
  makeGhost,
  makeLanternPost,
  makeMineEntrance,
  makePile,
  makeRock,
  makeSpawnMarker,
  makeTorch,
  makeTree,
  type makeCartTrain,
} from './meshes';
import { Particles } from './particles';
import { sfx } from './sfx';
import {
  INTERP_DELAY,
  LANTERN_POS,
  PILE_POS,
  SHADOW_HALF,
  SHADOW_MAP,
  TORCH_POS,
  type SnapEntry,
  type TrackedEntity,
} from './gameTypes';
import {
  syncBuildings,
  syncCarts,
  syncEnemies,
  syncNodes,
  syncPiles,
  syncPlayers,
  syncProjectiles,
  type EntitySyncCtx,
} from './entitySync';
import {
  clearGuideOutlines,
  clearOutline,
  updateGuideHints,
  updateInteractGlow,
  type InteractGlowCtx,
} from './interactGlow';
import { updateCamera, updateLighting, type AtmosphereCtx } from './atmosphere';

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private input: InputManager;
  private particles: Particles;
  private raycaster = new THREE.Raycaster();
  private terrain: THREE.Mesh;

  private buffer: SnapEntry[] = [];
  private latest: WorldState | null = null;

  private players = new Map<string, TrackedEntity>();
  private enemies = new Map<string, TrackedEntity>();
  private projectiles = new Map<string, TrackedEntity>();
  private buildings = new Map<string, TrackedEntity>();
  private nodes = new Map<string, TrackedEntity>();
  private carts = new Map<string, ReturnType<typeof makeCartTrain>>();
  private piles = new Map<ResourceId, THREE.Group>();

  private clouds: THREE.Group[] = [];
  private spawnMarkers: THREE.Mesh[] = [];
  private lanterns: ReturnType<typeof makeLanternPost>[] = [];
  private torches: ReturnType<typeof makeTorch>[] = [];
  private ghost: ReturnType<typeof makeGhost>;
  private ghostPos = new THREE.Vector3();
  private ghostValid = false;

  // Glow outline around whatever the local player can interact with
  private outline: THREE.Group | null = null;
  private outlineKey = '';
  private outlineTarget: THREE.Group | null = null;
  private yardRing: THREE.Mesh;

  /** Extra onboarding outlines (cart / gates / first tower). */
  private guideOutlines = new Map<string, { outline: THREE.Group; target: THREE.Group }>();
  private introCart = true;
  private firstNightGuide = false;
  private firstNightUntil = 0;
  private readonly startedAt = performance.now();

  private camTarget = new THREE.Vector3(5, 0, 12);
  private camDist = 52;
  private raf = 0;
  private lastFrame = performance.now();
  private hudTimer: number;
  private disposed = false;

  constructor(
    container: HTMLElement,
    private transport: Transport,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(
      30,
      window.innerWidth / window.innerHeight,
      1,
      500,
    );

    this.hemi = new THREE.HemisphereLight('#bfd9ff', '#8a7f5f', 0.9);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#ffe8c0', 1.7);
    this.sun.castShadow = true;
    // Higher res + normal bias + texel-snapped camera (below) kill shadow swimming.
    this.sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
    this.sun.shadow.camera.left = -SHADOW_HALF;
    this.sun.shadow.camera.right = SHADOW_HALF;
    this.sun.shadow.camera.top = SHADOW_HALF;
    this.sun.shadow.camera.bottom = -SHADOW_HALF;
    this.sun.shadow.camera.far = 280;
    this.sun.shadow.camera.near = 10;
    this.sun.shadow.bias = -0.00015;
    this.sun.shadow.normalBias = 0.04;
    // The frustum never changes shape, only where it sits, so bake it once here.
    this.sun.shadow.camera.updateProjectionMatrix();
    this.scene.add(this.sun, this.sun.target);

    this.scene.fog = new THREE.Fog('#cfe3f5', 140, 340);
    this.scene.background = new THREE.Color('#cfe3f5');

    // Static world
    this.terrain = buildTerrain();
    this.scene.add(this.terrain);
    this.scene.add(buildTrack());
    const { trees, rocks } = scatterDecorations();
    for (const t of trees) {
      const tree = makeTree();
      tree.position.copy(t);
      this.scene.add(tree);
    }
    for (const r of rocks) {
      const rock = makeRock();
      rock.position.copy(r);
      rock.position.y += 0.2;
      this.scene.add(rock);
    }
    for (let i = 0; i < 10; i++) {
      const cloud = makeCloud();
      cloud.position.set((Math.random() * 2 - 1) * 80, 26 + Math.random() * 9, (Math.random() * 2 - 1) * 80);
      this.clouds.push(cloud);
      this.scene.add(cloud);
    }
    for (const sp of ENEMY_SPAWNS) {
      const m = makeSpawnMarker();
      m.position.set(sp.x, 3.5, sp.z);
      m.visible = false;
      this.spawnMarkers.push(m);
      this.scene.add(m);
    }
    for (const [res, [x, z]] of Object.entries(PILE_POS) as [ResourceId, [number, number]][]) {
      const pile = makePile(res);
      pile.position.set(x, terrainHeight(x, z), z);
      pile.visible = false;
      this.piles.set(res, pile);
      this.scene.add(pile);
    }

    // Mine dressing: tunnel entrance, lantern posts, glowing crystal clusters
    const entrance = makeMineEntrance();
    const ex = POS.mine.x - 6;
    const ez = POS.mine.z + 5;
    entrance.position.set(ex, terrainHeight(ex, ez), ez);
    entrance.lookAt(POS.mine.x, terrainHeight(ex, ez), POS.mine.z);
    this.scene.add(entrance);
    for (const [lx, lz] of LANTERN_POS) {
      const lantern = makeLanternPost();
      lantern.group.position.set(lx, terrainHeight(lx, lz), lz);
      lantern.group.rotation.y = Math.random() * Math.PI * 2;
      this.lanterns.push(lantern);
      this.scene.add(lantern.group);
    }
    for (const [tx, tz] of TORCH_POS) {
      const torch = makeTorch();
      torch.group.position.set(tx, terrainHeight(tx, tz), tz);
      this.torches.push(torch);
      this.scene.add(torch.group);
    }
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 4 + Math.random() * 12;
      const cx = POS.mine.x + Math.cos(a) * r;
      const cz = POS.mine.z + Math.sin(a) * r;
      if (terrainHeight(cx, cz) < 6.5) continue;
      const cluster = makeCrystalCluster();
      cluster.position.set(cx, terrainHeight(cx, cz), cz);
      this.scene.add(cluster);
    }

    // Boulders sealing the seam between the east wall end and the bluff
    const SEAM_ROCKS: [number, number, number][] = [
      [22.3, 15.6, 1.6],
      [23.6, 16.8, 2.1],
      [25.0, 18.2, 1.8],
      [22.8, 17.8, 1.3],
      [21.8, 16.6, 1.0],
    ];
    for (const [rx, rz, rs] of SEAM_ROCKS) {
      const rock = makeRock();
      rock.position.set(rx, terrainHeight(rx, rz) + 0.3, rz);
      rock.scale.setScalar(rs);
      this.scene.add(rock);
    }

    // Deposit spot indicator (glows when you can drop your pack at the yard)
    this.yardRing = new THREE.Mesh(
      new THREE.RingGeometry(2.6, 3.1, 40),
      new THREE.MeshBasicMaterial({
        color: '#ffd76a',
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.yardRing.rotation.x = -Math.PI / 2;
    this.yardRing.position.set(POS.yard.x, terrainHeight(POS.yard.x, POS.yard.z) + 0.1, POS.yard.z);
    this.yardRing.visible = false;
    this.scene.add(this.yardRing);

    this.ghost = makeGhost();
    this.scene.add(this.ghost.group);

    this.particles = new Particles(this.scene);

    this.input = new InputManager(transport, () => this.tryPlace());

    transport.onSnapshot((w, ev) => this.onSnapshot(w, ev));

    window.addEventListener('resize', this.onResize);
    this.hudTimer = window.setInterval(() => this.syncHud(), 50);
    this.loop();
  }

  // ------------------------------------------------------------ snapshots

  private onSnapshot(w: WorldState, ev: SimEvent[]) {
    this.latest = w;
    this.buffer.push({ t: performance.now(), w });
    if (this.buffer.length > 30) this.buffer.splice(0, this.buffer.length - 30);
    for (const e of ev) this.onEvent(e);
  }

  private onEvent(e: SimEvent) {
    switch (e.type) {
      case 'nightStart':
        sfx.night();
        store.toast(`Night ${e.night} — they come for the gates`, 'warn');
        if (e.night === 1) {
          this.firstNightGuide = true;
          this.firstNightUntil = performance.now() + 55_000;
          store.toast('Build a tower — defend the glowing gates', 'warn');
        }
        break;
      case 'dawn':
        sfx.dawn();
        store.toast(`Dawn breaks — Day ${e.day}`, 'good');
        this.firstNightGuide = false;
        break;
      case 'hit':
        sfx.hit();
        this.particles.burst(e.x, 1.2, e.z, '#ffd76a', 5, 3, 0.4);
        break;
      case 'enemyDied':
        sfx.enemyDie();
        this.particles.burst(e.x, 0.8, e.z, '#3a3a44', e.kind === 'brute' ? 16 : 9, 5, 0.7);
        break;
      case 'destroyed':
        sfx.cartBump();
        this.particles.burst(e.x, 1.5, e.z, '#8f887a', 20, 6, 0.9);
        store.toast('A structure has fallen!', 'warn');
        break;
      case 'built':
        sfx.built();
        this.particles.burst(e.x, 1, e.z, '#6fe08b', 12, 4, 0.6);
        break;
      case 'workDone': {
        this.particles.burst(e.x, 1.4, e.z, '#ffe9a8', 7, 3.5, 0.45);
        const ent = this.players.get(e.pid);
        ent?.extra?.workBar?.pop(true);
        break;
      }
      case 'beatHit': {
        sfx.beatGood();
        if (e.kind === 'mine') sfx.mineHit();
        else if (e.kind === 'anvil') sfx.anvil();
        else sfx.forge();
        this.particles.burst(e.x, 1.5, e.z, '#ffe08a', 6, 3, 0.35);
        if (e.pid === this.transport.myId) beatHud.hitPulse++;
        break;
      }
      case 'beatMiss': {
        sfx.beatMiss();
        if (e.kind === 'mine') sfx.mineMiss();
        this.particles.burst(e.x, 1.3, e.z, '#ff8a70', 4, 2, 0.3);
        this.players.get(e.pid)?.extra?.workBar?.pop(false);
        if (e.pid === this.transport.myId) beatHud.missPulse++;
        break;
      }
      case 'cartBump':
        sfx.cartBump();
        this.particles.burst(e.x, 0.6, e.z, '#c9b896', 5, 2, 0.35);
        break;
      case 'smelted':
        this.particles.burst(e.x, 1.6, e.z, RES_COLORS[e.res], 12, 3.5, 0.6);
        if (e.res === 'steelIngot') {
          sfx.built();
          store.toast(`Steel poured — ${RESOURCE_NAMES.steelIngot}`, 'good');
        }
        break;
      case 'charged':
        sfx.forge();
        this.particles.burst(e.x, 2.6, e.z, '#3b3b44', 10, 2.5, 0.7);
        break;
      case 'upgraded':
        sfx.built();
        this.particles.burst(e.x, 2.5, e.z, '#ffd76a', 22, 5, 0.9);
        store.toast(`Blast furnace upgraded — ${furnaceLevel(e.level).name}`, 'good');
        break;
      case 'veinFound':
        this.particles.burst(e.x, 1.2, e.z, '#9fd8e8', 18, 5, 0.9);
        store.toast(`A new ${VEIN_LABELS[e.kind].toLowerCase()} glitters in the mine`, 'good');
        break;
      case 'research':
        sfx.built();
        store.toast(`Research complete: ${TECHS[e.tech].name}`, 'good');
        break;
      case 'gameOver':
        store.toast('The keep has fallen...', 'warn');
        break;
    }
  }

  /** Interpolated view of the world at render time. */
  private view(): { w: WorldState; prev: WorldState; alpha: number } | null {
    if (!this.latest) return null;
    const now = performance.now() - INTERP_DELAY;
    const buf = this.buffer;
    if (buf.length < 2) return { w: this.latest, prev: this.latest, alpha: 1 };
    let i = buf.length - 1;
    while (i > 0 && buf[i - 1].t > now) i--;
    const a = buf[Math.max(0, i - 1)];
    const b = buf[i];
    const alpha = b.t > a.t ? Math.min(1, Math.max(0, (now - a.t) / (b.t - a.t))) : 1;
    return { w: b.w, prev: a.w, alpha };
  }

  // ------------------------------------------------------------ placement

  /** Why placement would fail right now, or null if it is allowed. */
  private placementProblem(w: WorldState, sel: { kind: BuildableType; tier: Tier }): string | null {
    const spec = buildSpec(sel.kind, sel.tier);
    if (!spec) return 'Unknown structure';
    const err = placeError(w, this.ghostPos.x, this.ghostPos.z, spec.footprint, sel.kind);
    if (err) return err;
    if (!w.debug && !canAfford(w, spec.cost)) return 'Not enough resources';
    return null;
  }

  private tryPlace() {
    const sel = store.get().buildSel;
    const w = this.latest;
    if (!sel || !w || !this.ghost.group.visible) return;
    const problem = this.placementProblem(w, sel);
    if (problem) {
      store.toast(problem, 'warn');
      return;
    }
    this.transport.send({
      type: 'build',
      kind: sel.kind,
      tier: sel.tier,
      x: this.ghostPos.x,
      z: this.ghostPos.z,
    });
    store.set({ buildSel: null });
  }

  private updateGhost() {
    const sel = store.get().buildSel;
    const w = this.latest;
    if (!sel || !w || !this.input.mouse.inside) {
      this.ghost.group.visible = false;
      return;
    }
    this.raycaster.setFromCamera(
      new THREE.Vector2(this.input.mouse.x, this.input.mouse.y),
      this.camera,
    );
    const hits = this.raycaster.intersectObject(this.terrain);
    if (!hits.length) {
      this.ghost.group.visible = false;
      return;
    }
    const p = hits[0].point;
    this.ghostPos.copy(p);
    const tower = towerSpec(sel.kind, sel.tier);
    const ok = this.placementProblem(w, sel) === null;
    this.ghostValid = ok;
    this.ghost.group.visible = true;
    this.ghost.group.position.set(p.x, terrainHeight(p.x, p.z), p.z);
    const color = ok ? '#6fe08b' : '#e05b5b';
    (this.ghost.body.material as THREE.MeshStandardMaterial).color.set(color);
    (this.ghost.ring.material as THREE.LineBasicMaterial).color.set(color);
    // Towers show their firing range; the furnace just shows its footprint.
    const range = tower?.range ?? buildSpec(sel.kind, sel.tier)?.footprint ?? 3;
    this.ghost.ring.scale.set(range, 1, range);
  }

  // ------------------------------------------------------------ HUD sync

  private syncHud() {
    const w = this.latest;
    if (!w) return;
    const me = w.players.find((p) => p.id === this.transport.myId);
    let prompt = '';
    let station: 'anvil' | 'forge' | null = null;
    let furnaceId: string | null = null;
    let towerId: string | null = null;
    if (me) {
      if (me.riding) {
        prompt = 'W/S — push the cart · F — hop off';
      } else {
        const ctx = getContext(w, me);
        if (ctx) {
          if (ctx.kind === 'anvil' || ctx.kind === 'forge') station = ctx.kind;
          if (ctx.kind === 'furnace') furnaceId = ctx.buildingId;
          const ready = contextReady(ctx);
          const sticky =
            workDuration(ctx) !== null ||
            ctx.kind === 'repair' ||
            ctx.kind === 'rebuild' ||
            ctx.kind === 'furnace';
          if (!ready) prompt = ctx.label;
          else if (isBeatWork(ctx)) prompt = `E / Space on the beat — ${ctx.label}`;
          else if (sticky) prompt = `E — ${ctx.label}${ctx.kind === 'rebuild' ? ' (≈1 min)' : ''}`;
          else prompt = `E — ${ctx.label}`;
        } else {
          for (const c of w.carts) {
            const pos = railPosAt(c.s);
            if (Math.hypot(me.x - pos.x, me.z - pos.z) < REACH_MOUNT && !c.riderId) {
              prompt = 'F — ride the cart';
              break;
            }
          }
        }
        if (!prompt && me.carryTotal >= CARRY_CAP) {
          prompt = 'Pack full — walk over the cart to unload';
        } else if (!prompt && this.introCart) {
          prompt = 'The cart is ready — F to ride up the mountain';
        } else if (!prompt && this.firstNightGuide) {
          prompt = 'Night falls — Build a tower, hold the gates';
        }
      }
    }
    // Hover / proximity for upgrade panels (hover wins when the cursor is on one).
    const inspect = this.pickInspectTarget(w, me ?? null);
    towerId = inspect.towerId;
    if (inspect.furnaceId) furnaceId = inspect.furnaceId;
    (window as any).__mdPaused = !!store.get().paused;
    store.set({ snap: w, prompt, station, furnaceId, towerId });
  }

  /**
   * Upgrade panels open when you stand next to a tower/furnace, or when you
   * hover the cursor over one — hover takes priority so you can inspect from afar.
   */
  private pickInspectTarget(
    w: WorldState,
    me: { x: number; z: number } | null,
  ): { towerId: string | null; furnaceId: string | null } {
    let hoverTower: string | null = null;
    let hoverFurnace: string | null = null;
    let nearTower: string | null = null;
    let nearFurnace: string | null = null;

    if (this.input.mouse.inside) {
      this.raycaster.setFromCamera(
        new THREE.Vector2(this.input.mouse.x, this.input.mouse.y),
        this.camera,
      );
      const hits = this.raycaster.intersectObject(this.terrain);
      if (hits[0]) {
        const ax = hits[0].point.x;
        const az = hits[0].point.z;
        let bestT = 3.6;
        let bestF = 4.2;
        for (const b of w.buildings) {
          if (b.hp <= 0) continue;
          const d = Math.hypot(ax - b.x, az - b.z);
          if (hasCombat(b.type) && d < bestT) {
            bestT = d;
            hoverTower = b.id;
          }
          if (isChargeBuilding(b.type) && d < bestF) {
            bestF = d;
            hoverFurnace = b.id;
          }
        }
      }
    }

    if (me) {
      let bestT = 4.2;
      let bestF = 4.8;
      for (const b of w.buildings) {
        if (b.hp <= 0) continue;
        const d = Math.hypot(me.x - b.x, me.z - b.z);
        if (hasCombat(b.type) && d < bestT) {
          bestT = d;
          nearTower = b.id;
        }
        if (isChargeBuilding(b.type) && d < bestF) {
          bestF = d;
          nearFurnace = b.id;
        }
      }
    }

    return {
      towerId: hoverTower ?? nearTower,
      furnaceId: hoverFurnace ?? nearFurnace,
    };
  }

  // ------------------------------------------------------------ frame loop

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;

    const v = this.view();
    if (v) {
      const sync = this.entitySyncCtx();
      syncPlayers(sync, v.w, v.prev, v.alpha);
      syncEnemies(sync, v.w, v.prev, v.alpha);
      syncProjectiles(sync, v.w, v.prev, v.alpha);
      syncBuildings(sync, v.w);
      syncNodes(sync, v.w);
      syncCarts(sync, v.w, v.prev, v.alpha);
      syncPiles(sync, v.w);
      this.runInteractGlow(v.w);
      this.runGuideHints(v.w);
      this.runLighting(v.w, dt);
      this.runCamera(v.w, dt);
    }
    this.updateGhost();
    this.updateGunAim(v?.w ?? null);
    this.publishBeatHud();
    this.particles.update(dt);

    const cam = this.camera.position;
    for (const cloud of this.clouds) {
      cloud.position.x += dt * 0.5;
      if (cloud.position.x > 100) cloud.position.x = -100;
      // Fade clouds that would otherwise plaster the camera / player view.
      const mat = cloud.userData.cloudMat as THREE.MeshStandardMaterial | undefined;
      const base = (cloud.userData.baseOpacity as number) ?? 0.72;
      if (mat) {
        const d = cam.distanceTo(cloud.position);
        const fade = d < 55 ? Math.max(0.08, (d - 18) / 37) : 1;
        mat.opacity = base * fade;
      }
    }

    this.renderer.render(this.scene, this.camera);
  };

  /**
   * Hand the local player's swing to the HUD bar. Reads the newest snapshot
   * rather than the interpolated view — mixing a delayed position with fresh
   * timing made the needle stutter — and publishes how fast the swing climbs so
   * the HUD can carry it smoothly between 20 Hz ticks.
   */
  private publishBeatHud() {
    const w = this.latest;
    const me = w?.players.find((p) => p.id === this.transport.myId);
    if (!w || !me || !me.working) {
      beatHud.active = false;
      return;
    }
    const ctx = getContext(w, me);
    const dur = ctx && contextReady(ctx) ? workDuration(ctx) : null;
    if (!ctx || !dur || !isBeatWork(ctx)) {
      beatHud.active = false;
      return;
    }
    const workStat = ctx.kind === 'anvil' ? 'anvilWorkSpeed' : 'mineWorkSpeed';
    const speed =
      ctx.kind === 'forge'
        ? 1 / Math.max(1, me.beatPenalty)
        : stat(w, workStat) / Math.max(1, me.beatPenalty);
    beatHud.active = true;
    beatHud.frac = Math.min(1, me.workT / dur);
    beatHud.rate = speed / dur;
    beatHud.window = BEAT_WINDOW;
    beatHud.grace = BEAT_EARLY_FORGIVE;
    beatHud.hit = me.beatHit;
    beatHud.penalty = me.beatPenalty > 1.05;
    beatHud.label = ctx.kind === 'mine' ? ctx.label : findRecipe(ctx.station, ctx.recipe).verb;
  }

  /** Pick the enemy under the cursor (or nearest to the aim point) for the gun. */
  private updateGunAim(w: WorldState | null) {
    if (!w || !this.input.mouse.inside) {
      this.input.aimEnemyId = null;
      return;
    }
    const me = w.players.find((p) => p.id === this.transport.myId);
    if (!me || me.riding) {
      this.input.aimEnemyId = null;
      return;
    }
    this.raycaster.setFromCamera(
      new THREE.Vector2(this.input.mouse.x, this.input.mouse.y),
      this.camera,
    );
    const hits = this.raycaster.intersectObject(this.terrain);
    let aimX = me.x;
    let aimZ = me.z;
    if (hits[0]) {
      aimX = hits[0].point.x;
      aimZ = hits[0].point.z;
    }
    let best: { id: string; score: number } | null = null;
    for (const e of w.enemies) {
      const toPlayer = Math.hypot(me.x - e.x, me.z - e.z);
      if (toPlayer > GUN_RANGE) continue;
      const toAim = Math.hypot(aimX - e.x, aimZ - e.z);
      // Prefer enemies near the cursor, then near the player.
      const score = toAim + toPlayer * 0.15;
      if (!best || score < best.score) best = { id: e.id, score };
    }
    this.input.aimEnemyId = best && best.score < 6.5 ? best.id : best?.id ?? null;
  }

  // ------------------------------------------------------------ delegated ctx helpers

  private entitySyncCtx(): EntitySyncCtx {
    return {
      scene: this.scene,
      myId: this.transport.myId,
      particles: this.particles,
      players: this.players,
      enemies: this.enemies,
      projectiles: this.projectiles,
      buildings: this.buildings,
      nodes: this.nodes,
      carts: this.carts,
      piles: this.piles,
    };
  }

  private interactGlowCtx(): InteractGlowCtx {
    return {
      scene: this.scene,
      myId: this.transport.myId,
      nodes: this.nodes,
      carts: this.carts,
      buildings: this.buildings,
      outline: this.outline,
      outlineKey: this.outlineKey,
      outlineTarget: this.outlineTarget,
      yardRing: this.yardRing,
      guideOutlines: this.guideOutlines,
      introCart: this.introCart,
      firstNightGuide: this.firstNightGuide,
      firstNightUntil: this.firstNightUntil,
      startedAt: this.startedAt,
    };
  }

  private applyInteractGlowCtx(ctx: InteractGlowCtx) {
    this.outline = ctx.outline;
    this.outlineKey = ctx.outlineKey;
    this.outlineTarget = ctx.outlineTarget;
    this.introCart = ctx.introCart;
    this.firstNightGuide = ctx.firstNightGuide;
    this.firstNightUntil = ctx.firstNightUntil;
  }

  private atmosphereCtx(): AtmosphereCtx {
    return {
      scene: this.scene,
      sun: this.sun,
      hemi: this.hemi,
      camera: this.camera,
      camTarget: this.camTarget,
      camDist: this.camDist,
      myId: this.transport.myId,
      input: this.input,
      buildings: this.buildings,
      enemies: this.enemies,
      spawnMarkers: this.spawnMarkers,
      lanterns: this.lanterns,
      torches: this.torches,
    };
  }

  private runInteractGlow(w: WorldState) {
    const ctx = this.interactGlowCtx();
    updateInteractGlow(ctx, w);
    this.applyInteractGlowCtx(ctx);
  }

  private runGuideHints(w: WorldState) {
    const ctx = this.interactGlowCtx();
    updateGuideHints(ctx, w);
    this.applyInteractGlowCtx(ctx);
  }

  private runLighting(w: WorldState, dt: number) {
    updateLighting(this.atmosphereCtx(), w, dt);
  }

  private runCamera(w: WorldState, dt: number) {
    const ctx = this.atmosphereCtx();
    updateCamera(ctx, w, dt);
    this.camDist = ctx.camDist;
  }

  // ------------------------------------------------------------ lifecycle

  private onResize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.clearInterval(this.hudTimer);
    window.removeEventListener('resize', this.onResize);
    const glow = this.interactGlowCtx();
    clearOutline(glow);
    clearGuideOutlines(glow);
    this.applyInteractGlowCtx(glow);
    this.input.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
