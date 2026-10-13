import preact from '@preact/preset-vite';
import { defineConfig } from 'wxt';

// Fixed public key so the extension ID (and the Worker's ALLOWED_ORIGINS) survives reinstalls.
// Generate one with `pnpm ext:key`; it is written to apps/extension/.env.local (git-ignored).
const extensionKey = process.env.OAL_EXTENSION_KEY?.trim();

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
  vite: () => ({
    plugins: [preact()],
  }),
});
