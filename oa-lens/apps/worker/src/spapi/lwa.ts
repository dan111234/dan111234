import type { Env } from '../env';
import { upstreamFetch } from '../lib/http';
import { ApiError } from '../lib/errors';

const LWA_TOKEN_URL = 'https://api.amazon.com/auth/o2/token';
const KV_KEY = 'lwa:access_token';
/** docs/07 §2: cache 55 minutes (tokens live 60). */
const CACHE_SECONDS = 55 * 60;

interface CachedToken {
  token: string;
  expiresAt: number;
}

// Per-isolate copy so warm requests skip the KV read.
let memo: CachedToken | null = null;

/** Test hook: forget the in-memory token. */
export function resetLwaMemo(): void {
  memo = null;
}

export async function getAccessToken(env: Env, options: { fresh?: boolean } = {}): Promise<string> {
  const now = Date.now();
  if (!options.fresh) {
    if (memo && memo.expiresAt > now) return memo.token;
    const stored = await env.CACHE.get<CachedToken>(KV_KEY, 'json');
    if (stored && stored.expiresAt > now) {
      memo = stored;
      return stored.token;
    }
  }

  const { LWA_CLIENT_ID, LWA_CLIENT_SECRET, LWA_REFRESH_TOKEN } = env;
  if (!LWA_CLIENT_ID || !LWA_CLIENT_SECRET || !LWA_REFRESH_TOKEN) {
    throw new ApiError(
      'AUTH',
      'LWA_CLIENT_ID, LWA_CLIENT_SECRET and LWA_REFRESH_TOKEN must be set',
    );
  }

  const res = await upstreamFetch('LWA', LWA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: LWA_REFRESH_TOKEN,
      client_id: LWA_CLIENT_ID,
      client_secret: LWA_CLIENT_SECRET,
    }),
  });

  if (!res.ok) {
    // LWA error bodies are {error, error_description}; neither contains the secrets we sent.
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      error_description?: string;
    };
    const detail = [body.error, body.error_description].filter(Boolean).join(': ');
    if (res.status >= 500)
      throw new ApiError('UPSTREAM', `LWA token request failed (${res.status})`);
    throw new ApiError(
      'AUTH',
      `LWA token request rejected (${res.status}${detail ? `, ${detail}` : ''})`,
    );
  }

  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new ApiError('UPSTREAM', 'LWA response had no access_token');

  const lifetime = Math.min(CACHE_SECONDS, Math.max(60, (body.expires_in ?? 3600) - 300));
  const entry: CachedToken = { token: body.access_token, expiresAt: now + lifetime * 1000 };
  memo = entry;
  await env.CACHE.put(KV_KEY, JSON.stringify(entry), { expirationTtl: lifetime });
  return entry.token;
}
