/**
 * Build the client for GitHub Pages and publish `client/dist` to the `gh-pages` branch.
 *
 * Usage:  npm run deploy
 *
 * Expects the GitHub remote to already exist (origin). First-time setup creates the
 * Pages site at https://<user>.github.io/<repo>/ — Solo and PeerJS co-op both work
 * from the static client (no dedicated game server).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ghpages from 'gh-pages';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'client', 'dist');

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    ...opts,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function git(args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', shell: true });
  if (r.status !== 0) {
    throw new Error(r.stderr?.trim() || `git ${args.join(' ')} failed`);
  }
  return (r.stdout || '').trim();
}

function repoSlugFromRemote(url) {
  // git@github.com:user/repo.git  or  https://github.com/user/repo.git
  const m = url.match(/github\.com[:/](.+?)(?:\.git)?$/i);
  return m ? m[1].replace(/\\/g, '/') : null;
}

if (!existsSync(join(root, '.git'))) {
  console.error('Not a git repository. Run git init and add a GitHub remote first.');
  process.exit(1);
}

let remote;
try {
  remote = git(['remote', 'get-url', 'origin']);
} catch {
  console.error('No `origin` remote. Create a GitHub repo and: git remote add origin <url>');
  process.exit(1);
}

const slug = repoSlugFromRemote(remote);
if (!slug) {
  console.error(`Could not parse a GitHub repo from origin: ${remote}`);
  process.exit(1);
}
const repoName = slug.split('/').pop();
const base = `/${repoName}/`;

console.log(`Building for GitHub Pages at ${base} …`);
run('npm', ['run', 'build'], { env: { ...process.env, VITE_BASE: base } });

if (!existsSync(join(dist, 'index.html'))) {
  console.error('Build did not produce client/dist/index.html');
  process.exit(1);
}

// Confirm the built HTML uses the pages base (catches a missing VITE_BASE).
const html = readFileSync(join(dist, 'index.html'), 'utf8');
if (!html.includes(base) && base !== '/') {
  console.error(`Built index.html is missing base path ${base}. Aborting deploy.`);
  process.exit(1);
}

const siteUrl = `https://${slug.split('/')[0]}.github.io/${repoName}/`;
console.log(`Publishing ${dist} → gh-pages …`);

await new Promise((resolvePromise, reject) => {
  ghpages.publish(
    dist,
    {
      dotfiles: true,
      message: `deploy: ${new Date().toISOString()}`,
      history: false,
    },
    (err) => (err ? reject(err) : resolvePromise()),
  );
});

console.log(`\nLive at: ${siteUrl}`);
console.log('(First publish can take a minute while GitHub Pages wakes up.)');
