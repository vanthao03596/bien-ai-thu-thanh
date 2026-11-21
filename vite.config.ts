import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: './',
  server: { port: 5173, open: false },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    // the engine is one big module that rarely changes; keep it in its own cacheable chunk
    chunkSizeWarningLimit: 1500,
    rolldownOptions: {
      output: {
        codeSplitting: { groups: [{ name: 'phaser', test: /node_modules[\\/]phaser[\\/]/ }] },
      },
    },
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
})
