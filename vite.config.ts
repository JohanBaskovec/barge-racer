import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  base: './',
  // Shown on the title screen.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: {
    chunkSizeWarningLimit: 2000,
    // Phaser rarely changes: keep it in its own chunk so returning players keep it cached.
    rollupOptions: { output: { manualChunks: { phaser: ['phaser'] } } },
  },
  test: { include: ['tests/**/*.test.ts'] },
  // In development the multiplayer server runs separately (npm run dev:server, on port 8787).
  server: { proxy: { '/api': { target: 'http://127.0.0.1:8787', ws: true } } },
});
