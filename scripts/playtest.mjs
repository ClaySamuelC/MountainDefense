/* End-to-end playtest: solo loop via keyboard input, then a 2-player online session. */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer';

const BROWSER_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];
const executablePath = BROWSER_CANDIDATES.find((p) => existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok  ${name}`);
  else {
    failures++;
    console.error(`FAIL  ${name} ${detail}`);
  }
};

const preview = spawn('npm', ['run', 'preview', '-w', 'client', '--', '--port', '4173', '--strictPort'], { shell: true, stdio: 'pipe' });
const server = spawn('npx', ['tsx', 'src/index.ts'], { shell: true, stdio: 'pipe', cwd: 'server' });
server.stdout.on('data', (d) => process.stdout.write(`[server] ${d}`));

let browser;
try {
  await sleep(4000);
  browser = await puppeteer.launch({ executablePath, headless: true, args: ['--window-size=1400,900'] });

  // ---------------- Solo loop ----------------
  console.log('--- Solo gameplay loop');
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto('http://localhost:4173', { waitUntil: 'networkidle0' });
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Solo'))?.click();
  });
  await sleep(1500);

  const world = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__dbg.world())));
  let w = await world();
  check('solo world running', w.players.length === 1 && w.tick > 10);

  // Mine: teleport next to an iron node and hold E
  await page.evaluate(() => {
    const w = window.__dbg.world();
    const node = w.nodes.find((n) => n.kind === 'iron');
    window.__dbg.teleport(node.x + 1.2, node.z);
  });
  await page.keyboard.down('KeyE');
  await sleep(5000);
  await page.keyboard.up('KeyE');
  w = await world();
  check('mined ore via keyboard', (w.players[0].carry.ironOre ?? 0) >= 3, JSON.stringify(w.players[0].carry));

  // Deposit at the yard
  await page.evaluate(() => window.__dbg.teleport(1.8, 3.6));
  const oreBefore = w.stockpile.ironOre;
  await page.keyboard.down('KeyE');
  await sleep(2000);
  await page.keyboard.up('KeyE');
  w = await world();
  check('deposited ore at yard', w.stockpile.ironOre > oreBefore, `${oreBefore} -> ${w.stockpile.ironOre}`);

  // Build a refined tower via UI + mouse
  await page.evaluate(() => window.__dbg.give('ironIngot', 10));
  await page.evaluate(() => window.__dbg.teleport(8, 12));
  await sleep(400);
  await page.keyboard.press('KeyB');
  await sleep(400);
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Arrow Tower'))?.click();
  });
  await page.mouse.move(700, 480);
  await sleep(600);
  await page.mouse.click(700, 480);
  await sleep(600);
  w = await world();
  check('tower placed via UI', w.buildings.some((b) => b.type === 'towerArrow'),
    `towers=${w.buildings.filter((b) => b.type.startsWith('tower')).length}`);

  // Ride the cart: teleport near mine end, press F, push with W
  await page.evaluate(() => {
    const w = window.__dbg.world();
    window.__dbg.teleport(-32.5, -27.5);
  });
  await sleep(300);
  await page.keyboard.press('KeyF');
  await sleep(300);
  w = await world();
  check('mounted cart', w.players[0].riding !== null);
  const sBefore = w.carts[0].s;
  await page.keyboard.down('KeyS'); // push along track (screen-down = toward dock here)
  await sleep(2500);
  await page.keyboard.up('KeyS');
  w = await world();
  const moved = Math.abs(w.carts[0].s - sBefore);
  check('cart moved when pushed', moved > 1, `ds=${moved.toFixed(2)}`);

  // Night survives with tower
  await page.evaluate(() => window.__dbg.night());
  await sleep(9000);
  w = await world();
  check('night wave engaged', w.phase === 'night' && (w.enemies.length > 0 || w.spawnQueue.length > 0),
    `enemies=${w.enemies.length} queued=${w.spawnQueue.length}`);

  // ---------------- Online co-op ----------------
  console.log('--- Online co-op (host + join)');
  const host = await browser.newPage();
  await host.setViewport({ width: 1200, height: 800 });
  host.on('pageerror', (e) => console.log('[host pageerror]', e.message));
  await host.goto('http://localhost:4173', { waitUntil: 'networkidle0' });
  await host.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Host'))?.click();
  });
  await sleep(3000);
  const code = await host.evaluate(() => document.querySelector('.room-code')?.textContent?.replace('room', '').trim() ?? null);
  check('host got room code', !!code, String(code));

  if (code) {
    const joiner = await browser.newPage();
    await joiner.setViewport({ width: 1200, height: 800 });
    joiner.on('pageerror', (e) => console.log('[join pageerror]', e.message));
    await joiner.goto('http://localhost:4173', { waitUntil: 'networkidle0' });
    await joiner.type('input', code);
    await joiner.evaluate(() => {
      [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Join')?.click();
    });
    await sleep(3500);
    const joined = await joiner.evaluate(() => !!document.querySelector('.res-row'));
    check('joiner receives world snapshots', joined);
    await joiner.screenshot({ path: 'shots/coop.png' });
  }

  await browser.close();
} catch (err) {
  failures++;
  console.error('FAIL  playtest crashed:', err);
  if (browser) await browser.close().catch(() => {});
} finally {
  for (const proc of [preview, server]) {
    spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { shell: true });
  }
  await sleep(800);
}

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nPlaytest passed.');
process.exit(0);
