import { MARKETPLACES, type MarketplaceKey } from '@oa-lens/shared';
import type { Env } from '../env';
import { upstreamFetch } from '../lib/http';
import { ApiError, codeForStatus } from '../lib/errors';
import { getAccessToken } from './lwa';

/** docs/01 §4: exponential backoff on 429/503, at most 3 retries. */
export const BACKOFF_MS = [500, 1000, 2000] as const;
const RETRY_STATUSES = new Set([429, 503]);

export interface SpapiRequest {
  method?: 'GET' | 'POST';
  path: string;
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface SpapiErrorBody {
  errors?: { code?: string; message?: string; details?: string }[];
}

/** Indirection so tests can skip the real delays. */
export const timing = {
  sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
};

function buildUrl(host: string, req: SpapiRequest): string {
  const url = new URL(req.path, host);
  for (const [key, value] of Object.entries(req.query ?? {})) {
    if (value === undefined) continue;
    url.searchParams.set(key, Array.isArray(value) ? value.join(',') : value);
  }
  return url.toString();
}

function retryAfterSeconds(res: Response): number {
  const header = Number(res.headers.get('Retry-After'));
  if (Number.isFinite(header) && header > 0) return Math.ceil(header);
  const rate = Number(res.headers.get('x-amzn-RateLimit-Limit'));
  if (Number.isFinite(rate) && rate > 0) return Math.max(1, Math.ceil(1 / rate));
  return 2;
}

async function errorFrom(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => ({}))) as SpapiErrorBody;
  const first = body.errors?.[0];
  const detail = first ? `${first.code ?? 'Error'}: ${first.message ?? ''}`.trim() : res.statusText;
  const code = codeForStatus(res.status);
  const message = `SP-API ${res.status}${detail ? ` - ${detail}` : ''}`;
  return code === 'RATE_LIMIT'
    ? new ApiError(code, message, retryAfterSeconds(res))
    : new ApiError(code, message);
}

/**
 * Calls SP-API with the cached LWA token (no SigV4 needed, docs/07 §2). Retries 429/503 with
 * backoff and refreshes the token once on 403 in case it expired early.
 */
export async function spapiFetch<T>(env: Env, mp: MarketplaceKey, req: SpapiRequest): Promise<T> {
  const url = buildUrl(MARKETPLACES[mp].spapiHost, req);
  let token = await getAccessToken(env);
  let refreshed = false;
  let retries = 0;

  for (;;) {
    const res = await upstreamFetch('SP-API', url, {
      method: req.method ?? 'GET',
      headers: {
        'x-amz-access-token': token,
        accept: 'application/json',
        'user-agent': 'OA-Lens/0.1 (Language=TypeScript; Platform=Cloudflare-Workers)',
        ...(req.body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: req.body === undefined ? undefined : JSON.stringify(req.body),
    });

    if (res.ok) return (await res.json()) as T;

    if (res.status === 403 && !refreshed) {
      refreshed = true;
      token = await getAccessToken(env, { fresh: true });
      continue;
    }

    if (RETRY_STATUSES.has(res.status)) {
      if (res.status === 429) {
        await env.CACHE.put('spapi:last429At', String(Date.now())).catch(() => undefined);
      }
      const delay = BACKOFF_MS[retries++];
      if (delay !== undefined) {
        await timing.sleep(delay);
        continue;
      }
    }

    throw await errorFrom(res);
  }
}
