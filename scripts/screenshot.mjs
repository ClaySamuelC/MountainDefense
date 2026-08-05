/* Visual smoke test: launches vite preview, screenshots day and night scenes. */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer';

const BROWSER_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];

const executablePath = BROWSER_CANDIDATES.find((p) => existsSync(p));
if (!executablePath) {
  console.error('No system browser found for screenshots.');
  process.exit(2);
}

mkdirSync('shots', { recursive: true });

const preview = spawn('npm', ['run', 'preview', '-w', 'client', '--', '--port', '4173', '--strictPort'], {
  shell: true,
  stdio: 'pipe',
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  await sleep(3500);
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--window-size=1600,900', '--use-angle=default'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('[page error]', m.text());
  });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));

  await page.goto('http://localhost:4173', { waitUntil: 'networkidle0' });
  await sleep(800);
  await page.screenshot({ path: 'shots/menu.png' });

  // Start solo
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    btns.find((b) => b.textContent.includes('Solo'))?.click();
  });
  await sleep(3500);
  await page.screenshot({ path: 'shots/day.png' });

  // Zoom out a little and look around: give resources, open build menu
  await page.evaluate(() => {
    window.__dbg?.give('ironIngot', 20);
    window.__dbg?.give('steelIngot', 10);
  });
  await page.keyboard.press('KeyB');
  await sleep(600);
  await page.screenshot({ path: 'shots/build.png' });
  await page.keyboard.press('Escape');

  // Ride toward the mine: teleport player to mountain to see mine area
  await page.evaluate(() => window.__dbg?.teleport(-30, -28));
  await sleep(1800);
  await page.screenshot({ path: 'shots/mine.png' });

  // Night scene
  await page.evaluate(() => {
    window.__dbg?.teleport(10, 10);
    window.__dbg?.night();
  });
  await sleep(6000);
  await page.screenshot({ path: 'shots/night.png' });

  // Tech panel
  await page.keyboard.press('KeyT');
  await sleep(500);
  await page.screenshot({ path: 'shots/tech.png' });

  await browser.close();
  console.log('Screenshots written to shots/');
} finally {
  preview.kill('SIGTERM');
  // Windows: ensure the child tree dies
  spawn('taskkill', ['/pid', String(preview.pid), '/T', '/F'], { shell: true });
  await sleep(500);
}
process.exit(0);
