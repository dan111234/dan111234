import { fileURLToPath } from 'node:url';
import preact from '@preact/preset-vite';
import { loadEnv } from 'vite';
import { defineConfig } from 'wxt';

// Fixed public key so the extension ID (and the Worker's ALLOWED_ORIGINS) survives reinstalls.
// Generate one with `pnpm ext:key`; it is written to apps/extension/.env.local (git-ignored).
const env = loadEnv(
  process.env.NODE_ENV ?? 'development',
  fileURLToPath(new URL('.', import.meta.url)),
  'OAL_',
);
const extensionKey = (process.env.OAL_EXTENSION_KEY ?? env.OAL_EXTENSION_KEY)?.trim();

export default defineConfig({
  imports: false,
  manifest: {
    name: 'OA Lens',
    description: 'Amazon product panel powered by your own SP-API app and Keepa key.',
    permissions: ['storage'],
    // Default Worker hosts. Other hosts still work through the Worker's CORS headers.
    host_permissions: ['https://*.workers.dev/*', 'http://localhost/*', 'http://127.0.0.1/*'],
    ...(extensionKey ? { key: extensionKey } : {}),
  },
  // `pnpm dev:ext` only builds and watches; load .output/chrome-mv3-dev into your own Chrome.
  webExt: { disabled: true },
  zip: { artifactTemplate: 'oa-lens-{{version}}-{{browser}}.zip' },
  vite: () => ({
    plugins: [preact()],
  }),
});
