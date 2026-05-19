import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/types/**'],
      thresholds: {
        'src/utils/**': { lines: 80 },
        'src/services/**': { lines: 60 },
        'src/bot/**': { lines: 50 },
      },
    },
    testTimeout: 15000,
  },
});
