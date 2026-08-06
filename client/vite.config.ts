import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Set by `npm run deploy` so asset URLs work under github.io/<repo>/. */
const base = process.env.VITE_BASE || '/';
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  version: string;
};

export default defineConfig({
  base,
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('../shared/src', import.meta.url)),
    },
  },
  optimizeDeps: {
    include: ['peerjs'],
  },
  server: {
    fs: { allow: ['..'] },
  },
});
