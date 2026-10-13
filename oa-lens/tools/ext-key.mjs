// Pins the extension ID (docs/01 §7). Writes the manifest `key` (an RSA *public* key, not a
// secret: Chrome puts it in every installed manifest) to apps/extension/extension-key.pub and sets
// the Worker's ALLOWED_ORIGINS to the resulting ID. No private key is kept; an unpacked extension
// does not need one.
import { createHash, generateKeyPairSync } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const keyFile = new URL('../apps/extension/extension-key.pub', import.meta.url);
const wranglerToml = new URL('../apps/worker/wrangler.toml', import.meta.url);
const force = process.argv.includes('--force');

let key = existsSync(keyFile) ? readFileSync(keyFile, 'utf8').trim() : '';
if (!key || force) {
  const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  key = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  writeFileSync(keyFile, `${key}\n`);
  console.log('Wrote apps/extension/extension-key.pub');
} else {
  console.log('Using the existing apps/extension/extension-key.pub (pass --force to replace it)');
}

// Chrome derives the ID from the SHA-256 of the DER public key: first 32 hex digits mapped 0-f -> a-p.
const id = [...createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex').slice(0, 32)]
  .map((d) => String.fromCharCode(97 + parseInt(d, 16)))
  .join('');
const origin = `chrome-extension://${id}`;

const toml = readFileSync(wranglerToml, 'utf8');
writeFileSync(
  wranglerToml,
  toml.replace(/^ALLOWED_ORIGINS = ".*"$/m, `ALLOWED_ORIGINS = "${origin}"`),
);

console.log(`Extension ID: ${id}`);
console.log(
  `Set ALLOWED_ORIGINS = "${origin}" in apps/worker/wrangler.toml (redeploy the Worker).`,
);
