import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 2000,
    // Phaser rarely changes: keep it in its own chunk so returning players keep it cached.
    rollupOptions: { output: { manualChunks: { phaser: ['phaser'] } } },
  },
  test: { include: ['tests/**/*.test.ts'] },
});
