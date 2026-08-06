/* Headless simulation smoke test: npm run test:sim */
import {
  addPlayer,
  canPlace,
  createWorld,
  furnaceLevel,
  placeError,
  tickWorld,
  DT,
  FURNACE_CAP,
  FURNACE_FOOTPRINT,
  RAIL_LENGTH,
  railPosAt,
  type PlayerInput,
  type QueuedIntent,
  type WorldState,
} from '../src/index';

let failures = 0;

function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`  ok  ${name}`);
  else {
    failures++;
    console.error(`FAIL  ${name} ${detail}`);
  }
}

function finite(w: WorldState): boolean {
  const nums: number[] = [w.phaseT, w.time];
  for (const p of w.players) nums.push(p.x, p.z);
  for (const c of w.carts) nums.push(c.s, c.v);
  for (const e of w.enemies) nums.push(e.x, e.z, e.hp);
  for (const v of Object.values(w.stockpile)) nums.push(v);
  return nums.every((n) => Number.isFinite(n));
}

function noNegativeStock(w: WorldState): boolean {
  return Object.values(w.stockpile).every((v) => v > -1e-6);
}

function run(w: WorldState, seconds: number, input: PlayerInput, queue: QueuedIntent[] = []) {
  const inputs = new Map<string, PlayerInput>();
  if (w.players[0]) inputs.set(w.players[0].id, input);
  const ticks = Math.round(seconds / DT);
  for (let i = 0; i < ticks; i++) {
    tickWorld(w, inputs, queue);
    if (w.gameOver) break;
  }
}

console.log('--- Scenario A: loaded cart rolls downhill to the dock');
{
  const w = createWorld();
  addPlayer(w, 'p1', 'Tester');
  const cart = w.carts[0];
  cart.s = RAIL_LENGTH * 0.35; // onto the downhill ramp; gravity should do the rest
  cart.v = 2;
  cart.load = { ironOre: 8 };
  cart.loadTotal = 8;
  run(w, 50, { mx: 0, mz: 0, hold: false });
  check('cart reached dock', cart.s > RAIL_LENGTH - 4, `s=${cart.s.toFixed(1)}/${RAIL_LENGTH.toFixed(1)}`);
}

console.log('--- Scenario B: mining fills the pack (mostly with the vein resource)');
{
  const w = createWorld();
  const p = addPlayer(w, 'p1', 'Tester');
  w.carts[0].s = RAIL_LENGTH * 0.5; // park the cart away so the pack doesn't auto-dump into it
  const node = w.nodes.find((n) => n.kind === 'iron')!;
  p.x = node.x + 1;
  p.z = node.z;
  run(w, 15, { mx: 0, mz: 0, hold: true });
  const total = p.carryTotal;
  check('pack filled', total >= 8, `carry=${JSON.stringify(p.carry)}`);
  check('majority is iron ore', (p.carry.ironOre ?? 0) >= total / 2, `carry=${JSON.stringify(p.carry)}`);

  // Long-run yield distribution: mostly primary, some stone, never 100%
  node.amount = 100000;
  node.max = 100000;
  let iron = 0;
  let stone = 0;
  let other = 0;
  for (let i = 0; i < 400; i++) {
    p.carry = {};
    p.carryTotal = 0;
    p.beatPenalty = 1;
    p.workT = 0;
    p.beatHit = false;
    run(w, 1.8, { mx: 0, mz: 0, hold: true });
    iron += p.carry.ironOre ?? 0;
    stone += p.carry.stone ?? 0;
    other += (p.carry.coal ?? 0) + (p.carry.copperOre ?? 0);
  }
  const copper = other; // iron veins cross-yield copper only
  const mined = iron + stone + copper;
  check('vein yields majority primary', iron / mined > 0.6, `iron=${iron}/${mined}`);
  check('vein yields copper cross-product', copper / mined > 0.15 && copper / mined < 0.4, `copper=${copper}/${mined}`);
  check('vein yields not 100% primary', iron < mined, `iron=${iron}/${mined}`);
}

console.log('--- Scenario C: anvil break + tend the forge');
{
  const w = createWorld();
  const p = addPlayer(w, 'p1', 'Tester');
  w.stockpile.ironOre = 10;
  w.stockpile.coal = 10;
  const anvil = w.buildings.find((b) => b.type === 'anvil')!;
  p.x = anvil.x + 1;
  p.z = anvil.z;
  run(w, 25, { mx: 0, mz: 0, hold: true });
  check('crushed iron produced', w.stockpile.crushedIron + w.stockpile.ironIngot >= 3, JSON.stringify(w.stockpile));
  const forge = w.buildings.find((b) => b.type === 'forge')!;
  p.x = forge.x + 1;
  p.z = forge.z;
  // Forge now requires hold-E tend pulses (timing mini-game); misses still advance work.
  run(w, 50, { mx: 0, mz: 0, hold: true });
  check('iron ingots smelted', w.stockpile.ironIngot >= 2, `ingots=${w.stockpile.ironIngot}`);
}

console.log('--- Scenario D: refined tower kills runners without spending stock');
{
  const w = createWorld();
  const p = addPlayer(w, 'p1', 'Tester');
  w.stockpile.ironIngot = 20;
  const queue: QueuedIntent[] = [
    { sid: 'p1', intent: { type: 'build', kind: 'towerArrow', tier: 'refined', x: 6, z: 14 } },
  ];
  run(w, 1, { mx: 0, mz: 0, hold: false }, queue);
  const tower = w.buildings.find((b) => b.type === 'towerArrow');
  check('tower placed', !!tower);
  const stockAfterBuild = { ...w.stockpile };
  for (let i = 0; i < 3; i++) {
    w.enemies.push({
      id: `e${w.nextId++}`, kind: 'runner', x: 6 + i, z: 28, hp: 22, maxHp: 22,
      targetId: null, atkT: 0, speed: 3.4, dmg: 4, atkPeriod: 0.9,
    });
  }
  run(w, 45, { mx: 0, mz: 0, hold: false });
  check('runners died to tower fire', w.enemies.length === 0, `left=${w.enemies.length}`);
  check(
    'towers fire for free',
    Object.keys(stockAfterBuild).every(
      (k) => w.stockpile[k as keyof typeof w.stockpile] >= stockAfterBuild[k as keyof typeof stockAfterBuild],
    ),
    JSON.stringify({ before: stockAfterBuild, after: w.stockpile }),
  );
}

console.log('--- Scenario Q: cart starts at the dock; walk-over dumps the pack');
{
  const w = createWorld();
  const p = addPlayer(w, 'p1', 'Tester');
  const cart = w.carts[0];
  check('cart starts at dock', cart.s > RAIL_LENGTH - 1, `s=${cart.s.toFixed(1)}`);
  const pos = railPosAt(cart.s);
  p.x = pos.x;
  p.z = pos.z;
  p.carry = { ironOre: 5 };
  p.carryTotal = 5;
  run(w, 0.3, { mx: 0, mz: 0, hold: false });
  check('walk-over dumped pack into cart', p.carryTotal === 0 && cart.loadTotal === 5, `carry=${p.carryTotal} load=${cart.loadTotal}`);
}

console.log('--- Scenario R: pickaxe auto-swings near enemies');
{
  const w = createWorld();
  const p = addPlayer(w, 'p1', 'Tester');
  w.enemies.push({
    id: `e${w.nextId++}`, kind: 'runner', x: p.x + 1.5, z: p.z, hp: 20, maxHp: 20,
    targetId: null, atkT: 0, speed: 0, dmg: 0, atkPeriod: 9,
  });
  run(w, 3, { mx: 0, mz: 0, hold: false });
  check('auto melee killed the runner', w.enemies.length === 0, `left=${w.enemies.length}`);
  check('pickaxe swung on its own', p.swung > 0, `swung=${p.swung}`);
}

console.log('--- Scenario G: monsters attack gates, never walls');
{
  const w = createWorld();
  addPlayer(w, 'p1', 'Tester');
  for (let i = 0; i < 6; i++) {
    w.enemies.push({
      id: `e${w.nextId++}`, kind: 'runner', x: 4 + i * 3, z: 34, hp: 500, maxHp: 500,
      targetId: null, atkT: 0, speed: 3.4, dmg: 4, atkPeriod: 0.9,
    });
  }
  run(w, 30, { mx: 0, mz: 0, hold: false });
  const walls = w.buildings.filter((b) => b.type === 'wall');
  const gates = w.buildings.filter((b) => b.type === 'gate');
  check('two gates exist', gates.length === 2);
  check('walls untouched', walls.every((b) => b.hp === b.maxHp), JSON.stringify(walls.map((b) => b.hp)));
  check('a gate took damage', gates.some((b) => b.hp < b.maxHp), JSON.stringify(gates.map((b) => b.hp)));
}

console.log('--- Scenario H: stone gun consumes stone only');
{
  const w = createWorld();
  const p = addPlayer(w, 'p1', 'Tester');
  w.stockpile.stone = 3;
  w.stockpile.ironOre = 0;
  w.stockpile.copperOre = 0;
  // 20 dmg/shot → three shots to drop a 55-HP runner, emptying the stone pouch.
  w.enemies.push({
    id: `e${w.nextId++}`, kind: 'runner', x: p.x + 4, z: p.z, hp: 55, maxHp: 55,
    targetId: null, atkT: 0, speed: 0, dmg: 0, atkPeriod: 9,
  });
  const inputs = new Map<string, PlayerInput>([['p1', { mx: 0, mz: 0, hold: false }]]);
  for (let i = 0; i < 200 && w.enemies.length > 0; i++) {
    tickWorld(w, inputs, [{ sid: 'p1', intent: { type: 'shoot' } }]);
  }
  check('gun killed the runner', w.enemies.length === 0);
  check('gun consumed stone', w.stockpile.stone === 0, `stone=${w.stockpile.stone}`);

  // Raw ore is never ammo — only stone.
  w.stockpile.stone = 0;
  w.stockpile.ironOre = 5;
  w.enemies.push({
    id: `e${w.nextId++}`, kind: 'runner', x: p.x + 4, z: p.z, hp: 25, maxHp: 25,
    targetId: null, atkT: 0, speed: 0, dmg: 0, atkPeriod: 9,
  });
  const shotsBefore = p.shots;
  for (let i = 0; i < 60; i++) {
    tickWorld(w, inputs, [{ sid: 'p1', intent: { type: 'shoot' } }]);
  }
  check('no shots without stone', p.shots === shotsBefore, `shots=${p.shots}`);
  check('ore untouched as ammo', w.stockpile.ironOre === 5, `ore=${w.stockpile.ironOre}`);
}

console.log('--- Scenario I: crude tower costs stone, not raw ore');
{
  const w = createWorld();
  addPlayer(w, 'p1', 'Tester');
  w.stockpile.stone = 0;
  w.stockpile.ironOre = 14;
  w.stockpile.copperOre = 0;
  const queue: QueuedIntent[] = [
    { sid: 'p1', intent: { type: 'build', kind: 'towerArrow', tier: 'crude', x: 6, z: 14 } },
  ];
  run(w, 1, { mx: 0, mz: 0, hold: false }, queue);
  check('crude tower rejected without stone', !w.buildings.some((b) => b.type === 'towerArrow'));

  w.stockpile.stone = 14;
  const queue2: QueuedIntent[] = [
    { sid: 'p1', intent: { type: 'build', kind: 'towerArrow', tier: 'crude', x: 6, z: 14 } },
  ];
  run(w, 1, { mx: 0, mz: 0, hold: false }, queue2);
  check('crude tower built from stone', w.buildings.some((b) => b.type === 'towerArrow'));
  check('stone paid', w.stockpile.stone === 0, `stone=${w.stockpile.stone}`);
  check('ore unused for tower', w.stockpile.ironOre === 14, `ore=${w.stockpile.ironOre}`);
}

console.log('--- Scenario J: depleted vein respawns elsewhere');
{
  const w = createWorld();
  const p = addPlayer(w, 'p1', 'Tester');
  const node = w.nodes.find((n) => n.kind === 'iron')!;
  const before = w.nodes.length;
  node.amount = 2;
  p.x = node.x + 1;
  p.z = node.z;
  run(w, 6, { mx: 0, mz: 0, hold: true });
  check('old vein removed', !w.nodes.includes(node));
  check('a fresh vein spawned', w.nodes.length === before, `nodes=${w.nodes.length}`);
}

console.log('--- Scenario E: idle world cycles day/night and eventually falls');
{
  const w = createWorld();
  addPlayer(w, 'p1', 'Tester');
  const inputs = new Map<string, PlayerInput>([['p1', { mx: 0, mz: 0, hold: false }]]);
  let sawNight = false;
  let sawEnemies = false;
  const maxTicks = Math.round(1600 / DT);
  for (let i = 0; i < maxTicks && !w.gameOver; i++) {
    tickWorld(w, inputs, []);
    if (w.phase === 'night') sawNight = true;
    if (w.enemies.length > 0) sawEnemies = true;
    if (i % 200 === 0) {
      if (!finite(w)) {
        check('world stayed finite', false, `at tick ${i}`);
        break;
      }
      if (!noNegativeStock(w)) {
        check('stockpile never negative', false, JSON.stringify(w.stockpile));
        break;
      }
    }
  }
  check('night happened', sawNight);
  check('enemies spawned', sawEnemies);
  check('undefended base eventually falls', w.gameOver, `time=${w.time.toFixed(0)}s`);
  check('world finite at end', finite(w));
}

console.log('--- Scenario F: rail geometry sane');
{
  const start = railPosAt(0);
  const end = railPosAt(RAIL_LENGTH);
  check('rail starts high (mine)', start.y > 6, `y=${start.y.toFixed(2)}`);
  check('rail ends low (dock)', end.y < 1.5, `y=${end.y.toFixed(2)}`);
  check('rail length plausible', RAIL_LENGTH > 70 && RAIL_LENGTH < 180, `${RAIL_LENGTH.toFixed(1)}m`);
}

console.log('--- Scenario K: carts leave room for the ore cart at the mine buffer');
{
  const w = createWorld();
  addPlayer(w, 'p1', 'Tester');
  const cart = w.carts[0];
  cart.s = 5;
  cart.v = -8;
  run(w, 4, { mx: 0, mz: 0, hold: false });
  check('passenger cart stops at spacing', cart.s >= 2.6, `s=${cart.s.toFixed(2)}`);
  check('soft bounce settled', Math.abs(cart.v) < 1.0, `v=${cart.v.toFixed(2)}`);
}

console.log('--- Scenario L: beat hit clears penalty; miss applies it');
{
  const w = createWorld();
  const p = addPlayer(w, 'p1', 'Tester');
  w.carts[0].s = 40;
  const node = w.nodes.find((n) => n.kind === 'iron')!;
  node.amount = 50;
  p.x = node.x + 1;
  p.z = node.z;
  // Hold E into the beat window, then click beat.
  const inputs = new Map([['p1', { mx: 0, mz: 0, hold: true }]]);
  for (let i = 0; i < 16; i++) tickWorld(w, inputs, []); // ~0.8s into swing
  check('entered beat window', p.workT / 1.0 > 0.7, `workT=${p.workT.toFixed(2)}`);
  tickWorld(w, inputs, [{ sid: 'p1', intent: { type: 'beat' } }]);
  check('beat registered', p.beatHit === true);
  // Finish the swing
  for (let i = 0; i < 20 && p.beatHit; i++) tickWorld(w, inputs, []);
  check('good hit cleared penalty', p.beatPenalty === 1, `penalty=${p.beatPenalty}`);

  // Slightly early (in the forgiveness strip before the lit window) still banks.
  p.beatHit = false;
  p.workT = 0.64; // grace runs 1 - 0.28 - 0.12 = 0.60 up to the lit window at 0.72
  p.beatPenalty = 1;
  tickWorld(w, inputs, [{ sid: 'p1', intent: { type: 'beat' } }]);
  check('slightly early still counts', !!p.beatHit, `workT=${p.workT.toFixed(2)} hit=${p.beatHit}`);

  // Miss a full swing (no beat click)
  p.beatHit = false;
  p.workT = 0;
  for (let i = 0; i < 30; i++) tickWorld(w, inputs, []);
  check('miss applied penalty', p.beatPenalty > 1.2, `penalty=${p.beatPenalty}`);
}

console.log('--- Scenario M: stations run the recipe you picked, and only that one');
{
  const w = createWorld();
  const p = addPlayer(w, 'p1', 'Tester');
  w.carts[0].s = 40;
  w.stockpile.ironOre = 10;
  w.stockpile.copperOre = 10;
  const anvil = w.buildings.find((b) => b.type === 'anvil')!;
  p.x = anvil.x + 1;
  p.z = anvil.z;

  // Default is iron; switch the anvil over to copper and confirm it sticks.
  run(w, 1, { mx: 0, mz: 0, hold: false }, [
    { sid: 'p1', intent: { type: 'setRecipe', station: 'anvil', res: 'crushedCopper' } },
  ]);
  check('anvil recipe switched', anvil.recipe === 'crushedCopper', `recipe=${anvil.recipe}`);
  run(w, 20, { mx: 0, mz: 0, hold: true });
  check('crushed copper produced', w.stockpile.crushedCopper > 0, `copper=${w.stockpile.crushedCopper}`);
  check('iron ore left alone', w.stockpile.ironOre === 10, `ironOre=${w.stockpile.ironOre}`);
  check('no crushed iron leaked', w.stockpile.crushedIron === 0, `iron=${w.stockpile.crushedIron}`);

  // Same story at the forge, with both inputs sitting in the yard.
  const forge = w.buildings.find((b) => b.type === 'forge')!;
  w.stockpile.crushedIron = 8;
  w.stockpile.crushedCopper = 8;
  w.stockpile.coal = 20;
  p.x = forge.x + 1;
  p.z = forge.z;
  run(w, 1, { mx: 0, mz: 0, hold: false }, [
    { sid: 'p1', intent: { type: 'setRecipe', station: 'forge', res: 'copperIngot' } },
  ]);
  run(w, 30, { mx: 0, mz: 0, hold: true });
  check('copper ingots smelted', w.stockpile.copperIngot > 0, `copper=${w.stockpile.copperIngot}`);
  check('forge never fell back to iron', w.stockpile.ironIngot === 0, `iron=${w.stockpile.ironIngot}`);
}

console.log('--- Scenario N: a smelt always yields its ingot; inputs are never eaten for nothing');
{
  const w = createWorld();
  const p = addPlayer(w, 'p1', 'Tester');
  w.carts[0].s = 40;
  const forge = w.buildings.find((b) => b.type === 'forge')!;
  w.stockpile.crushedIron = 6;
  w.stockpile.coal = 6;
  w.stockpile.ironOre = 0;
  w.stockpile.copperOre = 0;
  p.x = forge.x + 1;
  p.z = forge.z;
  run(w, 40, { mx: 0, mz: 0, hold: true });
  const ingots = w.stockpile.ironIngot;
  check('ingots came out', ingots > 0, `ingots=${ingots}`);
  check(
    'crushed iron spent matches ingots made',
    6 - w.stockpile.crushedIron === ingots,
    `spent=${6 - w.stockpile.crushedIron} ingots=${ingots}`,
  );
  check(
    'coal spent matches ingots made',
    6 - w.stockpile.coal === ingots,
    `spent=${6 - w.stockpile.coal} ingots=${ingots}`,
  );

  // Walking away mid-melt must not swallow the inputs.
  w.stockpile.crushedIron = 3;
  w.stockpile.coal = 3;
  const before = { iron: 3, coal: 3, out: w.stockpile.ironIngot };
  run(w, 1.2, { mx: 0, mz: 0, hold: true }); // part-way into a melt
  p.x = forge.x + 30; // walk off
  run(w, 5, { mx: 0, mz: 0, hold: false });
  const made = w.stockpile.ironIngot - before.out;
  check(
    'abandoned melt did not consume inputs it never paid out',
    before.iron - w.stockpile.crushedIron === made && before.coal - w.stockpile.coal === made,
    `iron=${w.stockpile.crushedIron} coal=${w.stockpile.coal} made=${made}`,
  );
}

console.log('--- Scenario O: the forge cannot make steel any more');
{
  const w = createWorld();
  const p = addPlayer(w, 'p1', 'Tester');
  w.carts[0].s = 40;
  w.techs.steel.unlocked = true;
  const forge = w.buildings.find((b) => b.type === 'forge')!;
  w.stockpile.crushedIron = 0;
  w.stockpile.crushedCopper = 0;
  w.stockpile.ironIngot = 10;
  w.stockpile.coal = 10;
  p.x = forge.x + 1;
  p.z = forge.z;
  run(w, 30, { mx: 0, mz: 0, hold: true });
  check('no steel from the forge', w.stockpile.steelIngot === 0, `steel=${w.stockpile.steelIngot}`);
  check('iron ingots untouched', w.stockpile.ironIngot === 10, `iron=${w.stockpile.ironIngot}`);
}

console.log('--- Scenario P: blast furnace is built, charged by hand, then runs on its own');
{
  const w = createWorld();
  const p = addPlayer(w, 'p1', 'Tester');
  w.carts[0].s = 40;
  w.techs.steel.unlocked = true;
  w.stockpile.stone = 60;
  w.stockpile.ironIngot = 30;
  w.stockpile.coal = 30;

  const spot = { x: 26, z: 3 };
  check(
    'furnace site is legal',
    placeError(w, spot.x, spot.z, FURNACE_FOOTPRINT, 'blastFurnace') === null,
    `${placeError(w, spot.x, spot.z, FURNACE_FOOTPRINT, 'blastFurnace')}`,
  );
  run(w, 1, { mx: 0, mz: 0, hold: false }, [
    { sid: 'p1', intent: { type: 'build', kind: 'blastFurnace', tier: 'crude', x: spot.x, z: spot.z } },
  ]);
  const furnace = w.buildings.find((b) => b.type === 'blastFurnace');
  check('furnace placed', !!furnace);
  if (furnace) {
    check('only one furnace allowed', !canPlace(w, spot.x + 8, spot.z, FURNACE_FOOTPRINT, 'blastFurnace'));

    // Hand-load it: hold E alongside the furnace.
    p.x = furnace.x + 2;
    p.z = furnace.z + 1;
    const ironBefore = w.stockpile.ironIngot;
    run(w, 2, { mx: 0, mz: 0, hold: true });
    check('charges loaded by hand', furnace.charges > 0, `charges=${furnace.charges}`);
    check('loading spent iron ingots', w.stockpile.ironIngot < ironBefore, `iron=${w.stockpile.ironIngot}`);
    check('charges capped', furnace.charges <= FURNACE_CAP, `charges=${furnace.charges}`);

    // Walk away — it should keep burning without anyone attending it.
    p.x = 0;
    p.z = 0;
    const lvl1 = furnaceLevel(1).time;
    run(w, lvl1 * 1.2, { mx: 0, mz: 0, hold: false });
    check('steel poured unattended', w.stockpile.steelIngot >= 1, `steel=${w.stockpile.steelIngot}`);
    check(
      'level 1 output is a trickle',
      w.stockpile.steelIngot <= 2,
      `steel=${w.stockpile.steelIngot} in ${(lvl1 * 1.2).toFixed(0)}s`,
    );

    // Upgrading the draught speeds it up.
    p.x = furnace.x + 2;
    p.z = furnace.z + 1;
    w.stockpile.ironIngot = 40;
    w.stockpile.stone = 40;
    w.stockpile.copperIngot = 20;
    run(w, 1, { mx: 0, mz: 0, hold: false }, [{ sid: 'p1', intent: { type: 'upgradeFurnace' } }]);
    check('furnace upgraded', furnace.level === 2, `level=${furnace.level}`);
    check('upgrade is faster', furnaceLevel(2).time < lvl1, `${furnaceLevel(2).time}s vs ${lvl1}s`);
  }
}

console.log('--- Scenario S: fallen gates rebuild over a minute; towers upgrade on site');
{
  const w = createWorld();
  const p = addPlayer(w, 'p1', 'Tester');
  const gate = w.buildings.find((b) => b.type === 'gate')!;
  gate.hp = 0;
  w.stockpile.stone = 40;
  p.x = gate.x;
  p.z = gate.z - 1;
  run(w, 30, { mx: 0, mz: 0, hold: true });
  check('rebuild mid-progress', gate.hp <= 0 && gate.buildProgress > 0.4, `prog=${gate.buildProgress.toFixed(2)}`);
  run(w, 35, { mx: 0, mz: 0, hold: true });
  check('gate rebuilt after ~1 min', gate.hp === gate.maxHp, `hp=${gate.hp} prog=${gate.buildProgress}`);

  w.stockpile.ironIngot = 20;
  w.stockpile.stone = 20;
  run(w, 1, { mx: 0, mz: 0, hold: false }, [
    { sid: 'p1', intent: { type: 'build', kind: 'towerArrow', tier: 'refined', x: 10, z: 14 } },
  ]);
  const tower = w.buildings.find((b) => b.type === 'towerArrow' && b.tier === 'refined')!;
  check('tower for upgrade placed', !!tower);
  const dmg0 = tower ? (tower.level === 1) : false;
  run(w, 1, { mx: 0, mz: 0, hold: false }, [
    { sid: 'p1', intent: { type: 'upgradeTower', buildingId: tower.id } },
  ]);
  check('tower upgraded on site', tower.level === 2, `level=${tower.level}`);
  check('upgrade raised max HP', tower.maxHp > 200, `maxHp=${tower.maxHp}`);
  void dmg0;
}

console.log('--- Scenario T: day-time gate repair is available');
{
  const w = createWorld();
  const p = addPlayer(w, 'p1', 'Tester');
  w.phase = 'day';
  const gate = w.buildings.find((b) => b.type === 'gate')!;
  gate.hp = gate.maxHp * 0.4;
  w.stockpile.stone = 30;
  p.x = gate.x;
  p.z = gate.z - 1;
  const before = gate.hp;
  run(w, 3, { mx: 0, mz: 0, hold: true });
  check('gate repaired during day', gate.hp > before, `hp ${before} → ${gate.hp}`);
}

console.log('--- Scenario U: research works without a tech hub; player spawns in the open');
{
  const w = createWorld();
  const p = addPlayer(w, 'p1', 'Tester');
  check('no tech hub building', !w.buildings.some((b) => b.type === 'techhub'));
  check('player not on the forge', Math.hypot(p.x - 13, p.z - 8) > 2.5, `spawn=${p.x},${p.z}`);
  w.stockpile.ironIngot = 10;
  tickWorld(w, new Map(), [{ sid: 'p1', intent: { type: 'research', tech: 'sharpPick' } }]);
  check('research started from anywhere', w.research === 'sharpPick', `research=${w.research}`);
}

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nAll sim smoke tests passed.');
