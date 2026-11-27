import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 2000,
    // Phaser rarely changes: keep it in its own chunk so returning players keep it cached.
    rollupOptions: { output: { manualChunks: { phaser: ['phaser'] } } },
  },
  test: { include: ['tests/**/*.test.ts'] },
  // In development the multiplayer server runs separately (npm run dev:server, on port 8787).
  server: { proxy: { '/api': { target: 'http://127.0.0.1:8787', ws: true } } },
});
