import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/core', 'apps/worker', 'apps/extension'],
    // `pnpm test:coverage`: docs/08 P1 requires 90% on packages/core.
    coverage: {
      provider: 'v8',
      include: ['packages/core/src/**', 'packages/core/data/**'],
      exclude: ['**/*.test.ts'],
      thresholds: { statements: 90, lines: 90 },
    },
  },
});
