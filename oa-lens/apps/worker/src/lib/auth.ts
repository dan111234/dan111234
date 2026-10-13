import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../env';
import { ApiError } from './errors';
import { failBody } from './respond';

// RFC 6750 challenge. The extension uses it to tell "wrong shared key" apart from upstream
// SP-API auth errors, which are also 401/AUTH.
const CHALLENGE = { 'WWW-Authenticate': 'Bearer realm="oa-lens"' };

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  // Compare against itself when lengths differ so timing does not reveal the length match.
  const other = x.length === y.length ? y : x;
  let diff = x.length ^ y.length;
  for (let i = 0; i < x.length; i++) diff |= x[i]! ^ other[i]!;
  return diff === 0;
}

/** Requires `Authorization: Bearer <EXT_SHARED_KEY>` (docs/01 §7). */
export const bearerAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const expected = c.env.EXT_SHARED_KEY;
  if (!expected) {
    return c.json(
      failBody(new ApiError('AUTH', 'EXT_SHARED_KEY is not set on the Worker')),
      401,
      CHALLENGE,
    );
  }
  const header = c.req.header('Authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match?.[1] || !timingSafeEqual(match[1].trim(), expected)) {
    return c.json(failBody(new ApiError('AUTH', 'Invalid or missing shared key')), 401, CHALLENGE);
  }
  await next();
};

/** CORS origin check: explicit allow-list when configured, otherwise any extension origin. */
export function allowedOrigin(origin: string, allowList: string | undefined): string | null {
  const list = (allowList ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length > 0) return list.includes(origin) ? origin : null;
  return origin.startsWith('chrome-extension://') ? origin : null;
}
