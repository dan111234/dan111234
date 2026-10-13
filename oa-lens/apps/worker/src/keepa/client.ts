import type { Env } from '../env';
import { upstreamFetch } from '../lib/http';
import { ApiError } from '../lib/errors';

const KEEPA_HOST = 'https://api.keepa.com';
export const KEEPA_QUOTA_KEY = 'keepa:quota';

export interface KeepaQuota {
  tokensLeft: number;
  refillIn: number;
  refillRate?: number;
  updatedAt: number;
}

/** Stores token status from any Keepa response (docs/07 §4). */
export async function saveQuota(
  env: Env,
  body: { tokensLeft?: number; refillIn?: number; refillRate?: number },
): Promise<KeepaQuota | null> {
  if (typeof body.tokensLeft !== 'number') return null;
  const quota: KeepaQuota = {
    tokensLeft: body.tokensLeft,
    refillIn: body.refillIn ?? 0,
    refillRate: body.refillRate,
    updatedAt: Date.now(),
  };
  await env.CACHE.put(KEEPA_QUOTA_KEY, JSON.stringify(quota));
  return quota;
}

/** Keepa `/token` reports the token status without consuming tokens. */
export async function getKeepaTokenStatus(env: Env): Promise<KeepaQuota> {
  if (!env.KEEPA_API_KEY) throw new ApiError('AUTH', 'KEEPA_API_KEY is not set on the Worker');
  const url = new URL('/token', KEEPA_HOST);
  url.searchParams.set('key', env.KEEPA_API_KEY);
  const res = await upstreamFetch('Keepa', url);
  if (!res.ok) {
    // Never echo the URL: it contains the key.
    if (res.status === 400 || res.status === 401 || res.status === 402 || res.status === 403) {
      throw new ApiError('AUTH', `Keepa rejected the API key (${res.status})`);
    }
    if (res.status === 429) throw new ApiError('RATE_LIMIT', 'Keepa token limit reached', 60);
    throw new ApiError('UPSTREAM', `Keepa ${res.status}`);
  }
  const quota = await saveQuota(env, (await res.json()) as { tokensLeft?: number });
  if (!quota) throw new ApiError('UPSTREAM', 'Keepa response had no tokensLeft');
  return quota;
}
