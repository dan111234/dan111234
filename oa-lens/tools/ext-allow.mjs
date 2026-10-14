// pnpm ext:allow <extension-id>
// Adds a Chrome Web Store extension ID to the Worker's ALLOWED_ORIGINS (CORS) next to the
// unpacked development ID. Redeploy the Worker afterwards (pnpm deploy:worker).
import { readFileSync, writeFileSync } from 'node:fs';

const id = (process.argv[2] ?? '').trim();
if (!/^[a-p]{32}$/.test(id)) {
  console.error(
    'Usage: pnpm ext:allow <32-letter extension ID from the Chrome Web Store dashboard>',
  );
  process.exit(2);
}
const file = new URL('../apps/worker/wrangler.toml', import.meta.url);
const toml = readFileSync(file, 'utf8');
const match = /^ALLOWED_ORIGINS = "(.*)"$/m.exec(toml);
if (!match) {
  console.error('ALLOWED_ORIGINS not found in apps/worker/wrangler.toml');
  process.exit(1);
}
const origins = match[1]
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const origin = `chrome-extension://${id}`;
if (origins.includes(origin)) {
  console.log(`${origin} is already allowed`);
} else {
  origins.push(origin);
  writeFileSync(file, toml.replace(match[0], `ALLOWED_ORIGINS = "${origins.join(',')}"`));
  console.log(`Allowed ${origin}. Now run: pnpm deploy:worker`);
}
