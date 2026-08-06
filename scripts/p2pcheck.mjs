/* Smoke-test PeerJS host → guest join via two browser pages. */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer';

const BROWSER_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];
const executablePath = BROWSER_CANDIDATES.find((p) => existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const build = spawnSync('npm', ['run', 'build'], { shell: true, stdio: 'inherit', cwd: process.cwd() });
if (build.status !== 0) {
  console.error('Build failed');
  process.exit(1);
}

const preview = spawn('npm', ['run', 'preview', '-w', 'client', '--', '--port', '4173', '--strictPort'], {
  shell: true,
  stdio: 'pipe',
});

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok  ${name}`);
  else {
    failures++;
    console.error(`FAIL  ${name} ${detail}`);
  }
};

try {
  await sleep(6000);
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--window-size=1200,800', '--use-fake-ui-for-media-stream'],
  });

  const host = await browser.newPage();
  const guest = await browser.newPage();
  host.on('pageerror', (e) => console.log('[host pageerror]', e.message));
  host.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') console.log('[host console]', m.text());
  });
  guest.on('pageerror', (e) => console.log('[guest pageerror]', e.message));

  await host.goto('http://localhost:4173', { waitUntil: 'networkidle0', timeout: 30000 });
  await guest.goto('http://localhost:4173', { waitUntil: 'networkidle0', timeout: 30000 });

  const clicked = await host.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Host'));
    b?.click();
    return !!b;
  });
  check('clicked Host Co-op', clicked);

  // Wait for room code in HUD (or an error back on the menu)
  let code = null;
  let err = null;
  for (let i = 0; i < 60 && !code && !err; i++) {
    await sleep(250);
    ({ code, err } = await host.evaluate(() => ({
      code: document.querySelector('.room-code')?.textContent?.replace(/\D/g, '') ?? null,
      err: document.querySelector('.error')?.textContent ?? null,
    })));
  }
  if (err) console.log('  host error:', err);
  check('host got 4-digit code', !!code && code.length === 4, String(code));
  console.log(`  room ${code}`);

  if (code) {
    await guest.click('.join-row input');
    await guest.keyboard.type(code);
    await sleep(200);
    await guest.evaluate(() => {
      [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Join')?.click();
    });

    let joined = false;
    for (let i = 0; i < 48 && !joined; i++) {
      await sleep(250);
      joined = await guest.evaluate(() => !!document.querySelector('.res-rail'));
    }
    check('guest entered game', joined);

    const hostAlive = await host.evaluate(() => !!document.querySelector('.res-rail'));
    check('host still in game', hostAlive);
    const guestCode = await guest.evaluate(
      () => document.querySelector('.room-code')?.textContent?.replace(/\D/g, '') ?? '',
    );
    check('guest shows same room code', guestCode === code, `guest=${guestCode}`);
  }

  await browser.close();
} catch (err) {
  failures++;
  console.error('FAIL  p2pcheck crashed:', err);
} finally {
  spawn('taskkill', ['/pid', String(preview.pid), '/T', '/F'], { shell: true });
  await sleep(600);
}

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nP2P check passed.');
process.exit(0);
