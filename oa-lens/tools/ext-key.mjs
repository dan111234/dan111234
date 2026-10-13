// Pins the extension ID (docs/01 §7): writes a manifest `key` to apps/extension/.env.local
// (git-ignored) and prints the resulting ID for the Worker's ALLOWED_ORIGINS.
// Only the public key is needed for an unpacked extension, so no private key is kept.
import { createHash, generateKeyPairSync } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const envFile = new URL('../apps/extension/.env.local', import.meta.url);
const force = process.argv.includes('--force');

const existing = existsSync(envFile) ? readFileSync(envFile, 'utf8') : '';
let key = /^OAL_EXTENSION_KEY=(.+)$/m.exec(existing)?.[1]?.trim();

if (!key || force) {
  const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  key = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  const rest = existing.replace(/^OAL_EXTENSION_KEY=.*\n?/m, '');
  writeFileSync(envFile, `${rest}OAL_EXTENSION_KEY=${key}\n`);
  console.log('Wrote OAL_EXTENSION_KEY to apps/extension/.env.local');
} else {
  console.log('Using the existing OAL_EXTENSION_KEY (pass --force to replace it)');
}

// Chrome derives the ID from the SHA-256 of the DER public key: first 32 hex digits mapped 0-f -> a-p.
const id = [...createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex').slice(0, 32)]
  .map((d) => String.fromCharCode(97 + parseInt(d, 16)))
  .join('');

console.log(`\nExtension ID: ${id}`);
console.log(`\nSet this in apps/worker/wrangler.toml [vars] and redeploy:`);
console.log(`ALLOWED_ORIGINS = "chrome-extension://${id}"`);
