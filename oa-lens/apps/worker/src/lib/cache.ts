export const TTL = {
  minute: 60,
  hour: 60 * 60,
  day: 24 * 60 * 60,
} as const;

export interface CachedValue<T> {
  data: T;
  fetchedAt: number;
}

export interface CachedResult<T> extends CachedValue<T> {
  cached: boolean;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * `{source}:{mp}:{op}:{hash of sorted params}` (docs/07 §6). The hash is truncated to 16 hex
 * chars; collisions are irrelevant at single-user volume.
 */
export async function cacheKey(
  source: string,
  mp: string,
  op: string,
  params: Record<string, string | number | boolean | undefined>,
): Promise<string> {
  const sorted = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${String(v)}`)
    .join('&');
  return `${source}:${mp}:${op}:${(await sha256Hex(sorted)).slice(0, 16)}`;
}

/**
 * Read-through KV cache. `fresh` skips the read but still writes the new value.
 * KV requires expirationTtl >= 60 seconds.
 */
export async function withCache<T>(
  kv: KVNamespace,
  key: string,
  ttlSeconds: number,
  load: () => Promise<T>,
  options: { fresh?: boolean } = {},
): Promise<CachedResult<T>> {
  if (!options.fresh) {
    const hit = await kv.get<CachedValue<T>>(key, 'json');
    if (hit) return { ...hit, cached: true };
  }
  const value: CachedValue<T> = { data: await load(), fetchedAt: Date.now() };
  await kv.put(key, JSON.stringify(value), { expirationTtl: Math.max(60, ttlSeconds) });
  return { ...value, cached: false };
}
