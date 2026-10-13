import { fileURLToPath } from 'node:url';
import { defineProject } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineProject({
  // Provides an in-memory `browser` (fake-browser) and WXT's aliases.
  plugins: [WxtVitest({ root: fileURLToPath(new URL('.', import.meta.url)) })],
  test: {
    name: 'extension',
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
  },
});
