import { vi } from 'vitest';
import type { Env } from '../src/env';

export const SHARED_KEY = 'test-shared-key-0123456789';
export const AUTH = { Authorization: `Bearer ${SHARED_KEY}` };

export function memoryKV() {
  const store = new Map<string, string>();
  const kv = {
    store,
    async get(key: string, type?: string) {
      const v = store.get(key);
      if (v === undefined) return null;
      return type === 'json' ? JSON.parse(v) : v;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
  };
  return kv as unknown as KVNamespace & { store: Map<string, string> };
}

export function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as D1Database,
    CACHE: memoryKV(),
    ALLOWED_ORIGINS: '',
    LWA_CLIENT_ID: 'amzn1.application-oa2-client.test',
    LWA_CLIENT_SECRET: 'client-secret',
    LWA_REFRESH_TOKEN: 'Atzr|refresh',
    SELLER_ID: 'A1SELLERTEST',
    KEEPA_API_KEY: 'keepa-key',
    EXT_SHARED_KEY: SHARED_KEY,
    ...overrides,
  };
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

type Handler = (req: Request) => Response | Promise<Response>;

/** Routes fetch() by URL prefix. Unmatched requests fail the test loudly. */
export function mockFetch(routes: Record<string, Handler | Handler[]>) {
  const calls: Request[] = [];
  const queues = new Map(
    Object.entries(routes).map(([k, v]) => [k, Array.isArray(v) ? [...v] : v] as const),
  );
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    calls.push(req);
    for (const [prefix, handler] of queues) {
      if (!req.url.startsWith(prefix)) continue;
      if (Array.isArray(handler)) {
        const next = handler.length > 1 ? handler.shift()! : handler[0]!;
        return next(req);
      }
      return handler(req);
    }
    throw new Error(`Unexpected fetch: ${req.method} ${req.url}`);
  });
  vi.stubGlobal('fetch', fn);
  return {
    fn,
    calls,
    count: (prefix: string) => calls.filter((r) => r.url.startsWith(prefix)).length,
  };
}

export const LWA_URL = 'https://api.amazon.com/auth/o2/token';
export const SPAPI = 'https://sellingpartnerapi-na.amazon.com';
export const KEEPA = 'https://api.keepa.com';

export const lwaOk: Handler = () =>
  json({ access_token: 'Atza|access', token_type: 'bearer', expires_in: 3600 });
