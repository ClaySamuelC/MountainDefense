import * as THREE from 'three';
import {
  BEAT_EARLY_FORGIVE,
  BEAT_WINDOW,
  CARRY_CAP,
  CART_SPACING,
  ENEMY_SPAWNS,
  FURNACE_CAP,
  GATE_XS,
  GUN_RANGE,
  POS,
  REACH_MOUNT,
  RESOURCE_NAMES,
  TECHS,
  VEIN_LABELS,
  WALL_Z,
  buildSpec,
  canAfford,
  cartCap,
  cartDocked,
  contextReady,
  findRecipe,
  furnaceLevel,
  getContext,
  isBeatWork,
  placeError,
  railPosAt,
  railTangentAt,
  terrainHeight,
  towerSpec,
  workDuration,
  type BuildableType,
  type ResourceId,
  type SimEvent,
  type Tier,
  type WorkContext,
  type WorldState,
} from '@shared';
import type { Transport } from '../net/transport';
import { InputManager } from '../input';
import { beatHud, store } from '../ui/store';
import { buildTerrain, scatterDecorations } from './terrainMesh';
import { buildTrack } from './trackMesh';
import {
  RES_COLORS,
  makeBuilding,
  makeCartTrain,
  makeChargePips,
  makeCloud,
  makeCrystalCluster,
  makeEnemy,
  makeGhost,
  makeHealthBar,
  makeLabel,
  makeLanternPost,
  makeMineEntrance,
  makeOreNode,
  makeOutline,
  makePile,
  makePlayer,
  makeProjectile,
  makeRock,
  makeSpawnMarker,
  makeTorch,
  makeTree,
  makeWorkBar,
} from './meshes';
import { Particles } from './particles';
import { sfx } from './sfx';

interface SnapEntry {
  t: number;
  w: WorldState;
}

const INTERP_DELAY = 130; // ms

/**
 * The sun never moves: a fixed direction is what lets the shadow map be snapped
 * to its own texel grid, which is the only reliable cure for crawling edges.
 * Points from the ground toward the sun — high and off to the side, so the faces
 * turned toward the camera stay lit while shadows still fall across the screen.
 */
const SUN_DIR = new THREE.Vector3(-0.45, 0.72, 0.53).normalize();
const SHADOW_HALF = 55;
const SHADOW_MAP = 4096;
const TMP_RIGHT = new THREE.Vector3();
const TMP_UP = new THREE.Vector3();
const TMP_CENTER = new THREE.Vector3();

// Stockpile bins — spaced so each resource has a clear yard pad + marker
const PILE_POS: Record<ResourceId, [number, number]> = {
  coal: [0.5, 2.2],
  stone: [-1.2, 4.0],
  ironOre: [2.5, 1.8],
  copperOre: [4.8, 2.8],
  crushedIron: [1.0, 6.2],
  crushedCopper: [3.5, 6.8],
  ironIngot: [6.2, 5.5],
  copperIngot: [7.5, 3.5],
  steelIngot: [7.8, 7.0],
};

// Hand-placed mine dressing (lantern posts) on the plateau
const LANTERN_POS: [number, number][] = [
  [-37.5, -30.5],
  [-33, -34.5],
  [-40, -35],
  [-35, -39],
  [-42.5, -31.5],
];

// Torches flank each gate on the outside so the approach is lit at night.
const TORCH_POS: [number, number][] = GATE_XS.flatMap(
  (gx) => [[gx - 2.9, WALL_Z + 2.3], [gx + 2.9, WALL_Z + 2.3]] as [number, number][],
);

interface TrackedEntity {
  group: THREE.Group;
  hb?: ReturnType<typeof makeHealthBar>;
  extra?: any;
}

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
    entrance.position.set(-44, terrainHeight(-44, -43), -43);
    entrance.lookAt(POS.mine.x, terrainHeight(-44, -43), POS.mine.z);
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
    if (!canAfford(w, spec.cost)) return 'Not enough resources';
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
          if ((b.type === 'towerArrow' || b.type === 'towerBallista') && d < bestT) {
            bestT = d;
            hoverTower = b.id;
          }
          if (b.type === 'blastFurnace' && d < bestF) {
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
        if ((b.type === 'towerArrow' || b.type === 'towerBallista') && d < bestT) {
          bestT = d;
          nearTower = b.id;
        }
        if (b.type === 'blastFurnace' && d < bestF) {
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
      this.syncPlayers(v.w, v.prev, v.alpha);
      this.syncEnemies(v.w, v.prev, v.alpha);
      this.syncProjectiles(v.w, v.prev, v.alpha);
      this.syncBuildings(v.w);
      this.syncNodes(v.w);
      this.syncCarts(v.w, v.prev, v.alpha);
      this.syncPiles(v.w);
      this.updateInteractGlow(v.w);
      this.updateGuideHints(v.w);
      this.updateLighting(v.w, dt);
      this.updateCamera(v.w, dt);
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
    const speed =
      ctx.kind === 'forge'
        ? 1 / Math.max(1, me.beatPenalty)
        : (w.techs.sharpPick.unlocked ? 1.6 : 1) / Math.max(1, me.beatPenalty);
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

  // ------------------------------------------------------------ interact glow

  /** Resolve the scene object the local player's context points at. */
  private contextTarget(w: WorldState, ctx: WorkContext): { key: string; group: THREE.Group | null } {
    switch (ctx.kind) {
      case 'mine':
        return { key: `n:${ctx.nodeId}`, group: this.nodes.get(ctx.nodeId)?.group ?? null };
      case 'loadCart':
      case 'unloadCart': {
        const train = this.carts.get(ctx.cartId);
        return { key: `c:${ctx.cartId}`, group: train ? train.back : null };
      }
      case 'anvil': {
        const anvil = w.buildings.find((b) => b.type === 'anvil');
        return { key: 'anvil', group: anvil ? this.buildings.get(anvil.id)?.group ?? null : null };
      }
      case 'forge': {
        const forge = w.buildings.find((b) => b.type === 'forge');
        return { key: 'forge', group: forge ? this.buildings.get(forge.id)?.group ?? null : null };
      }
      case 'furnace':
        return { key: `f:${ctx.buildingId}`, group: this.buildings.get(ctx.buildingId)?.group ?? null };
      case 'repair':
      case 'rebuild':
        return { key: `b:${ctx.buildingId}`, group: this.buildings.get(ctx.buildingId)?.group ?? null };
      case 'deposit':
        return { key: 'yard', group: null }; // handled by the yard ring
    }
  }

  private clearOutline() {
    if (this.outline) {
      this.scene.remove(this.outline);
      this.outline = null;
    }
    this.outlineKey = '';
    this.outlineTarget = null;
    this.yardRing.visible = false;
  }

  private clearGuideOutlines() {
    for (const h of this.guideOutlines.values()) this.scene.remove(h.outline);
    this.guideOutlines.clear();
  }

  private updateInteractGlow(w: WorldState) {
    const me = w.players.find((p) => p.id === this.transport.myId);
    const ctx = me ? getContext(w, me) : null;
    if (!ctx) {
      this.clearOutline();
      return;
    }
    const { key, group } = this.contextTarget(w, ctx);
    if (key !== this.outlineKey) {
      this.clearOutline();
      this.outlineKey = key;
      if (key === 'yard') {
        this.yardRing.visible = true;
      } else if (group) {
        this.outline = makeOutline(group);
        this.outlineTarget = group;
        this.scene.add(this.outline);
      }
    }
    // Pulse + follow the target
    const pulse = 0.55 + Math.sin(performance.now() / 240) * 0.3;
    if (this.outline && this.outlineTarget) {
      this.outline.position.copy(this.outlineTarget.position);
      this.outline.rotation.copy(this.outlineTarget.rotation);
      this.outline.scale.copy(this.outlineTarget.scale);
      for (const child of this.outline.children) {
        const m = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        m.opacity = pulse;
        break; // shared material: setting one is enough
      }
    }
    if (this.yardRing.visible) {
      (this.yardRing.material as THREE.MeshBasicMaterial).opacity = pulse * 0.8;
      this.yardRing.rotation.z = performance.now() / 3000;
    }
  }

  /**
   * Soft onboarding: cart at start / when the pack is full; on the first night,
   * pulse Build plus the gates and the first tower so the defense loop is obvious.
   */
  private updateGuideHints(w: WorldState) {
    const me = w.players.find((p) => p.id === this.transport.myId);
    const cart = w.carts[0];
    if (me?.riding || (cart && cart.loadTotal > 0)) this.introCart = false;
    if (performance.now() - this.startedAt > 50_000) this.introCart = false;
    if (this.firstNightGuide && performance.now() > this.firstNightUntil) this.firstNightGuide = false;

    const packFull =
      !!me && me.carryTotal >= CARRY_CAP && !!cart && cart.loadTotal < cartCap(w);
    const wantCart = (this.introCart || packFull) && !!cart;
    const wantBuild = this.firstNightGuide;
    const wantGates = this.firstNightGuide;
    const firstTower = w.buildings.find(
      (b) => (b.type === 'towerArrow' || b.type === 'towerBallista') && b.hp > 0,
    );

    const prev = store.get().guide;
    if (prev.build !== wantBuild || prev.cart !== wantCart) {
      store.set({ guide: { build: wantBuild, cart: wantCart } });
    }

    const desired = new Map<string, { group: THREE.Group; color: string }>();
    // Skip the cart guide when the interact outline already owns it.
    if (wantCart && !this.outlineKey.startsWith('c:')) {
      const train = this.carts.get(cart!.id);
      if (train) desired.set('guide:cart', { group: train.back, color: '#ffd76a' });
    }
    if (wantGates) {
      for (const b of w.buildings) {
        if (b.type !== 'gate' || b.hp <= 0) continue;
        const g = this.buildings.get(b.id)?.group;
        if (g) desired.set(`guide:gate:${b.id}`, { group: g, color: '#ff7a5c' });
      }
    }
    if (this.firstNightGuide && firstTower) {
      const g = this.buildings.get(firstTower.id)?.group;
      if (g && this.outlineKey !== `b:${firstTower.id}`) {
        desired.set('guide:tower', { group: g, color: '#7ec8ff' });
      }
    }

    for (const key of [...this.guideOutlines.keys()]) {
      if (!desired.has(key)) {
        this.scene.remove(this.guideOutlines.get(key)!.outline);
        this.guideOutlines.delete(key);
      }
    }
    for (const [key, spec] of desired) {
      let ent = this.guideOutlines.get(key);
      if (!ent || ent.target !== spec.group) {
        if (ent) this.scene.remove(ent.outline);
        const outline = makeOutline(spec.group, spec.color);
        this.scene.add(outline);
        ent = { outline, target: spec.group };
        this.guideOutlines.set(key, ent);
      }
    }

    const pulse = 0.5 + Math.sin(performance.now() / 220) * 0.35;
    for (const h of this.guideOutlines.values()) {
      h.outline.position.copy(h.target.position);
      h.outline.rotation.copy(h.target.rotation);
      h.outline.scale.copy(h.target.scale);
      for (const child of h.outline.children) {
        ((child as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = pulse;
        break;
      }
    }
  }

  // ------------------------------------------------------------ entity sync

  private syncPlayers(w: WorldState, prev: WorldState, alpha: number) {
    const seen = new Set<string>();
    for (const p of w.players) {
      seen.add(p.id);
      let ent = this.players.get(p.id);
      if (!ent) {
        const group = makePlayer(p.color);
        const workBar = makeWorkBar();
        workBar.group.position.y = 2.7;
        group.add(workBar.group);
        ent = {
          group,
          extra: { workPhase: 0, lastSwung: p.swung, lastShots: p.shots, workBar },
        };
        this.players.set(p.id, ent);
        this.scene.add(ent.group);
      }
      const pp = prev.players.find((q) => q.id === p.id) ?? p;
      const x = pp.x + (p.x - pp.x) * alpha;
      const z = pp.z + (p.z - pp.z) * alpha;
      const y = terrainHeight(x, z);
      ent.group.position.set(x, y, z);
      ent.group.rotation.y = lerpAngle(pp.heading, p.heading, alpha);

      const moving = Math.hypot(p.x - pp.x, p.z - pp.z) > 0.01;
      const t = performance.now() / 1000;
      ent.group.position.y = y + (moving && !p.riding ? Math.abs(Math.sin(t * 9)) * 0.09 : 0);
      if (p.riding) ent.group.position.y = y + 0.55;

      const pick = ent.group.getObjectByName('pick');
      if (pick) {
        if (p.working) {
          pick.rotation.x = Math.sin(t * 10) * 0.9 - 0.4;
          if (Math.sin(t * 10) > 0.95 && Math.random() < 0.3) {
            this.particles.burst(x, y + 0.8, z, '#d9c9a0', 2, 2, 0.3);
          }
        } else if (p.swung !== ent.extra.lastSwung) {
          ent.extra.lastSwung = p.swung;
          ent.extra.workPhase = 0.3;
        }
        if (ent.extra.workPhase > 0) {
          ent.extra.workPhase -= 1 / 60;
          pick.rotation.x = -ent.extra.workPhase * 6;
        } else if (!p.working) {
          pick.rotation.x = 0;
        }
      }
      // Backpack piles up lump by lump as you carry more
      const pack = ent.group.getObjectByName('pack');
      if (pack) {
        pack.visible = p.carryTotal > 0;
        const s = 0.75 + (p.carryTotal / 8) * 0.45;
        pack.scale.set(s, s, s);
        const dominant = (Object.entries(p.carry).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]?.[0] ??
          'ironOre') as ResourceId;
        const lumps = Math.ceil(p.carryTotal / 2);
        for (let i = 0; i < 4; i++) {
          const lump = pack.getObjectByName(`packItem${i}`) as THREE.Mesh | undefined;
          if (!lump) continue;
          lump.visible = i < lumps;
          (lump.material as THREE.MeshStandardMaterial).color.set(RES_COLORS[dominant]);
        }
      }

      // Timing read-out. The local player reads it off the big HUD bar, so the
      // floating one is reserved for watching teammates keep rhythm.
      const bar = ent.extra.workBar as ReturnType<typeof makeWorkBar>;
      if (p.id === this.transport.myId) {
        bar.set(null);
      } else {
        let frac: number | null = null;
        let beatOpts: { beatWindow?: number; beatHit?: boolean; penalty?: boolean } | undefined;
        if (p.working) {
          const ctx = getContext(w, p);
          const dur = ctx && contextReady(ctx) ? workDuration(ctx) : null;
          if (dur && ctx) {
            frac = Math.min(1, p.workT / dur);
            if (isBeatWork(ctx)) {
              beatOpts = {
                beatWindow: BEAT_WINDOW,
                beatHit: p.beatHit,
                penalty: p.beatPenalty > 1.05,
              };
            }
          }
        }
        bar.set(frac, beatOpts);
      }
      bar.update(1 / 60);

      // Stone gun muzzle flash
      if (p.shots !== ent.extra.lastShots) {
        ent.extra.lastShots = p.shots;
        sfx.shoot();
        this.particles.burst(x, y + 1.1, z, '#d8d4c8', 4, 4, 0.25);
      }
    }
    for (const [id, ent] of this.players) {
      if (!seen.has(id)) {
        this.scene.remove(ent.group);
        this.players.delete(id);
      }
    }
  }

  private syncEnemies(w: WorldState, prev: WorldState, alpha: number) {
    const seen = new Set<string>();
    for (const e of w.enemies) {
      seen.add(e.id);
      let ent = this.enemies.get(e.id);
      if (!ent) {
        const group = makeEnemy(e.kind);
        const hb = makeHealthBar(e.kind === 'brute' ? 1.8 : 1.1);
        hb.group.position.y = e.kind === 'brute' ? 2.7 : 1.4;
        group.add(hb.group);
        ent = { group, hb };
        this.enemies.set(e.id, ent);
        this.scene.add(group);
      }
      const pe = prev.enemies.find((q) => q.id === e.id) ?? e;
      const x = pe.x + (e.x - pe.x) * alpha;
      const z = pe.z + (e.z - pe.z) * alpha;
      const t = performance.now() / 1000;
      ent.group.position.set(x, terrainHeight(x, z) + Math.abs(Math.sin(t * 6 + e.x)) * 0.08, z);
      const dx = e.x - pe.x;
      const dz = e.z - pe.z;
      if (Math.hypot(dx, dz) > 0.001) ent.group.rotation.y = Math.atan2(dx, dz);
      ent.hb!.set(e.hp / e.maxHp);
    }
    for (const [id, ent] of this.enemies) {
      if (!seen.has(id)) {
        this.scene.remove(ent.group);
        this.enemies.delete(id);
      }
    }
  }

  private syncProjectiles(w: WorldState, prev: WorldState, alpha: number) {
    const seen = new Set<string>();
    for (const pr of w.projectiles) {
      seen.add(pr.id);
      let ent = this.projectiles.get(pr.id);
      if (!ent) {
        const g = new THREE.Group();
        g.add(makeProjectile(pr.kind));
        ent = { group: g };
        this.projectiles.set(pr.id, ent);
        this.scene.add(g);
      }
      const pp = prev.projectiles.find((q) => q.id === pr.id) ?? pr;
      const x = pp.x + (pr.x - pp.x) * alpha;
      const y = pp.y + (pr.y - pp.y) * alpha;
      const z = pp.z + (pr.z - pp.z) * alpha;
      const old = ent.group.position.clone();
      ent.group.position.set(x, y, z);
      if (old.distanceToSquared(ent.group.position) > 0.0001) {
        ent.group.lookAt(old.x + (x - old.x) * 2, old.y + (y - old.y) * 2, old.z + (z - old.z) * 2);
      }
    }
    for (const [id, ent] of this.projectiles) {
      if (!seen.has(id)) {
        this.scene.remove(ent.group);
        this.projectiles.delete(id);
      }
    }
  }

  private syncBuildings(w: WorldState) {
    for (const b of w.buildings) {
      let ent = this.buildings.get(b.id);
      if (!ent) {
        const group = makeBuilding(b.type, b.tier);
        group.position.set(b.x, terrainHeight(b.x, b.z), b.z);
        const furnace = b.type === 'blastFurnace';
        const hb = makeHealthBar(2.2);
        hb.group.position.y = furnace ? 7.9 : 4.2;
        group.add(hb.group);
        const extra: Record<string, unknown> = {};
        if (furnace) {
          const pips = makeChargePips(FURNACE_CAP);
          pips.group.position.y = 7.2;
          group.add(pips.group);
          extra.pips = pips;
        }
        ent = { group, hb, extra };
        this.buildings.set(b.id, ent);
        this.scene.add(group);
      }
      const intact = ent.group.getObjectByName('intact');
      const rubble = ent.group.getObjectByName('rubble');
      if (intact) intact.visible = b.hp > 0;
      if (rubble) rubble.visible = b.hp <= 0;
      // Fallen walls show rebuild progress on the bar instead of hiding it.
      if (b.hp <= 0 && (b.type === 'wall' || b.type === 'gate')) {
        ent.hb!.set(Math.max(0.001, b.buildProgress));
        ent.hb!.group.visible = b.buildProgress > 0.001;
      } else {
        ent.hb!.set(b.hp > 0 ? b.hp / b.maxHp : 1);
      }

      if (b.type === 'forge') {
        const fire = ent.group.getObjectByName('fire') as THREE.Mesh | undefined;
        if (fire) {
          const m = fire.material as THREE.MeshStandardMaterial;
          const active = b.smelting !== null;
          m.emissiveIntensity = active ? 1.6 + Math.sin(performance.now() / 90) * 0.5 : 0.35;
        }
      }
      if (b.type === 'blastFurnace') {
        const running = b.smelting !== null && b.hp > 0;
        const tap = ent.group.getObjectByName('furnaceFire') as THREE.Mesh | undefined;
        if (tap) {
          const m = tap.material as THREE.MeshStandardMaterial;
          m.emissiveIntensity = running ? 1.5 + Math.sin(performance.now() / 130) * 0.45 : 0.25;
        }
        ent.extra?.pips?.set(b.charges);
        if (ent.extra) ent.extra.smokeT = (ent.extra.smokeT ?? 0) + 1;
        // Smoke from the chimney tells you it is working without a UI panel
        if (running && ent.extra && ent.extra.smokeT % 7 === 0) {
          this.particles.burst(b.x + (Math.random() - 0.5) * 0.3, terrainHeight(b.x, b.z) + 6.4, b.z, '#8d8a86', 2, 1.1, 1.5);
        }
      }
      if (b.type === 'techhub') {
        const crystal = ent.group.getObjectByName('crystal');
        if (crystal) {
          crystal.rotation.y += 0.02;
          crystal.position.y = 4.3 + Math.sin(performance.now() / 600) * 0.15;
        }
      }
    }
  }

  private syncNodes(w: WorldState) {
    const me = w.players.find((p) => p.id === this.transport.myId);
    const seen = new Set<string>();
    for (const n of w.nodes) {
      seen.add(n.id);
      let ent = this.nodes.get(n.id);
      if (!ent) {
        const group = makeOreNode(n.kind);
        group.position.set(n.x, terrainHeight(n.x, n.z), n.z);
        const label = makeLabel(VEIN_LABELS[n.kind]);
        label.position.set(n.x, terrainHeight(n.x, n.z) + 2.3, n.z);
        this.scene.add(label);
        ent = { group, extra: { label } };
        this.nodes.set(n.id, ent);
        this.scene.add(group);
      }
      const s = 0.55 + 0.45 * Math.min(1, n.amount / n.max);
      ent.group.scale.set(s, s, s);
      ent.group.visible = n.amount > 0;
      // Vein labels fade in as you approach
      const label = ent.extra.label as THREE.Sprite;
      const d = me ? Math.hypot(me.x - n.x, me.z - n.z) : 99;
      const vis = Math.max(0, Math.min(1, (14 - d) / 5));
      label.material.opacity = vis * 0.95;
      label.visible = vis > 0.02 && n.amount > 0;
    }
    // Depleted veins vanish (and respawn elsewhere via sim events)
    for (const [id, ent] of this.nodes) {
      if (!seen.has(id)) {
        this.scene.remove(ent.group);
        this.scene.remove(ent.extra.label);
        this.nodes.delete(id);
      }
    }
  }

  private syncCarts(w: WorldState, prev: WorldState, alpha: number) {
    for (const c of w.carts) {
      let train = this.carts.get(c.id);
      if (!train) {
        train = makeCartTrain();
        this.carts.set(c.id, train);
        this.scene.add(train.group);
      }
      const pc = prev.carts.find((q) => q.id === c.id) ?? c;
      const s = pc.s + (c.s - pc.s) * alpha;

      const place = (obj: THREE.Group, ss: number) => {
        const p = railPosAt(Math.max(0, ss));
        const t = railTangentAt(Math.max(0, ss));
        obj.position.set(p.x, p.y, p.z);
        obj.rotation.y = Math.atan2(t.x, t.z);
        obj.rotation.x = -Math.asin(Math.max(-0.6, Math.min(0.6, t.y)));
      };
      place(train.front, s);
      // Ore cart always trails by CART_SPACING; sim keeps s >= CART_S_MIN so they never stack.
      place(train.back, Math.max(0, s - CART_SPACING));

      train.load.visible = c.loadTotal > 0;
      const fill = Math.min(1, c.loadTotal / 12);
      train.load.scale.set(0.5 + fill, 0.4 + fill * 0.9, 0.5 + fill);
      const dominant = (Object.keys(c.load)[0] ?? 'ironOre') as ResourceId;
      (train.load.material as THREE.MeshStandardMaterial).color.set(RES_COLORS[dominant]);
    }
  }

  private syncPiles(w: WorldState) {
    for (const [res, pile] of this.piles) {
      const amt = w.stockpile[res];
      if (amt >= 1) {
        pile.visible = true;
        const s = 0.45 + Math.min(1.15, Math.cbrt(amt) / 3.2);
        pile.scale.set(s, s, s);
      } else {
        pile.visible = false;
      }
    }
  }

  // ------------------------------------------------------------ atmosphere

  private updateLighting(w: WorldState, dt: number) {
    // Map phase to a 24h-style clock: day = 7.5h..19.5h, night = 19.5h..7.5h
    const hour =
      w.phase === 'day' ? 7.5 + w.phaseT * 12 : (19.5 + w.phaseT * 12) % 24;
    let night: number;
    if (hour >= 7.2 && hour <= 18) night = 0;
    else if (hour > 18 && hour < 21) night = (hour - 18) / 3;
    else if (hour >= 21 || hour < 4.5) night = 1;
    else night = Math.max(0, 1 - (hour - 4.5) / 2.7);

    const lerpC = (a: string, b: string, t: number) =>
      new THREE.Color(a).lerp(new THREE.Color(b), t);

    const skyC = lerpC('#cfe3f5', '#141a2c', night);
    this.scene.background = skyC;
    (this.scene.fog as THREE.Fog).color = skyC;
    (this.scene.fog as THREE.Fog).near = 140 - night * 50;
    (this.scene.fog as THREE.Fog).far = 340 - night * 80;

    this.sun.color = lerpC('#ffe8c0', '#8fa3ff', night);
    // dusk warmth
    if (night > 0.05 && night < 0.75) this.sun.color.lerp(new THREE.Color('#ff9d5c'), 0.5 - Math.abs(night - 0.4));
    // The sun is pinned in the sky and simply fades out after dusk. An arcing
    // light either made shadows crawl or, once quantized, snap between steps;
    // a fixed direction lets the shadow map be texel-snapped and stay steady.
    this.sun.intensity = 1.7 * (1 - night) + 0.2 * night;
    // Ease the shadows out over dusk instead of switching them off in one frame.
    this.sun.shadow.intensity = Math.max(0, 1 - night * 1.5);
    this.sun.castShadow = this.sun.shadow.intensity > 0.01;

    // Shadow frustum follows the camera, snapped to whole texels along the two
    // axes across the light direction so shadow edges don't shimmer while panning.
    const texel = (SHADOW_HALF * 2) / SHADOW_MAP;
    const right = TMP_RIGHT.crossVectors(THREE.Object3D.DEFAULT_UP, SUN_DIR).normalize();
    const up = TMP_UP.crossVectors(SUN_DIR, right).normalize();
    const c = TMP_CENTER.set(this.camTarget.x, 0, this.camTarget.z);
    const dr = Math.round(c.dot(right) / texel) * texel;
    const du = Math.round(c.dot(up) / texel) * texel;
    const dl = c.dot(SUN_DIR);
    c.copy(right).multiplyScalar(dr).addScaledVector(up, du).addScaledVector(SUN_DIR, dl);
    this.sun.target.position.copy(c);
    this.sun.position.copy(c).addScaledVector(SUN_DIR, 150);
    this.sun.target.updateMatrixWorld();

    this.hemi.color = lerpC('#bfd9ff', '#37427a', night);
    this.hemi.groundColor = lerpC('#8a7f5f', '#232840', night);
    this.hemi.intensity = 0.9 - night * 0.22;

    const t = performance.now() / 1000;

    // Night-reactive emissives
    for (const [, ent] of this.buildings) {
      const win = ent.group.getObjectByName('window') as THREE.Mesh | undefined;
      if (win) (win.material as THREE.MeshStandardMaterial).emissiveIntensity = night * 1.6;
      ent.group.traverse((obj) => {
        if (obj.name !== 'gateFire') return;
        const m = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial;
        const flicker = 0.85 + Math.sin(t * 8 + obj.position.x) * 0.12;
        m.emissiveIntensity = night * 2.4 * flicker;
        obj.visible = night > 0.04;
        obj.scale.y = 0.85 + flicker * 0.3;
      });
    }
    for (const [, ent] of this.enemies) {
      const pulse = Math.sin(t * 3 + ent.group.position.x);
      const eye = ent.group.getObjectByName('eye') as THREE.Mesh | undefined;
      if (eye) {
        const m = eye.material as THREE.MeshStandardMaterial;
        m.emissiveIntensity = 1.4 + night * 5.5 + pulse * 0.4;
      }
      const threat = ent.group.getObjectByName('threat') as THREE.Mesh | undefined;
      if (threat) {
        const m = threat.material as THREE.MeshBasicMaterial;
        m.opacity = night * (0.34 + pulse * 0.05);
        threat.visible = m.opacity > 0.01;
      }
    }
    for (const m of this.spawnMarkers) {
      m.visible = w.phase === 'night' && !w.gameOver;
      (m.material as THREE.MeshBasicMaterial).opacity =
        0.1 + Math.abs(Math.sin(performance.now() / 400)) * 0.12;
    }

    // Mine lanterns glow warmer as the light fades, with a subtle flicker
    for (let i = 0; i < this.lanterns.length; i++) {
      const lantern = this.lanterns[i];
      const flicker = 0.85 + Math.sin(t * 9 + i * 2.4) * 0.08 + Math.sin(t * 23 + i) * 0.07;
      lantern.light.intensity = (2.5 + night * 9) * flicker;
      (lantern.flame.material as THREE.MeshStandardMaterial).emissiveIntensity =
        (0.9 + night * 1.3) * flicker;
    }

    // Gate torches: dead weight by day, the difference between seeing the
    // horde and guessing at it by night.
    for (let i = 0; i < this.torches.length; i++) {
      const torch = this.torches[i];
      const flicker = 0.86 + Math.sin(t * 7.5 + i * 1.9) * 0.09 + Math.sin(t * 19 + i * 3) * 0.06;
      torch.light.intensity = (1.2 + night * 26) * flicker;
      const flameMat = torch.flame.material as THREE.MeshStandardMaterial;
      flameMat.emissiveIntensity = (1.3 + night * 2.2) * flicker;
      torch.flame.scale.set(0.9 + flicker * 0.18, 0.85 + flicker * 0.32, 0.9 + flicker * 0.18);
      (torch.glow.material as THREE.SpriteMaterial).opacity = (0.05 + night * 0.42) * flicker;
    }
  }

  private updateCamera(w: WorldState, dt: number) {
    const me = w.players.find((p) => p.id === this.transport.myId);
    if (me) {
      let tx = me.x;
      let tz = me.z;
      if (me.riding) {
        const cart = w.carts.find((c) => c.id === me.riding);
        if (cart) {
          const p = railPosAt(cart.s);
          tx = p.x;
          tz = p.z;
        }
      }
      const ty = terrainHeight(tx, tz);
      const k = 1 - Math.exp(-4.5 * dt);
      this.camTarget.lerp(new THREE.Vector3(tx, ty, tz), k);
    }
    this.camDist = Math.max(28, Math.min(85, this.camDist + this.input.consumeZoom()));

    const dir = new THREE.Vector3(1, 1.18, 1).normalize();
    const desired = this.camTarget.clone().addScaledVector(dir, this.camDist);
    this.camera.position.lerp(desired, 1 - Math.exp(-6 * dt));
    this.camera.lookAt(this.camTarget.x, this.camTarget.y + 1.5, this.camTarget.z);
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
    this.clearOutline();
    this.clearGuideOutlines();
    this.input.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
