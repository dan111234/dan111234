import type { ApiResult, CatalogDTO, HealthDTO } from '@oa-lens/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { timing } from '../src/spapi/client';
import { resetLwaMemo } from '../src/spapi/lwa';
import catalogFixture from './fixtures/catalog-item.json';
import { AUTH, json, KEEPA, LWA_URL, lwaOk, makeEnv, memoryKV, mockFetch, SPAPI } from './helpers';

const app = createApp();
const EXT_ORIGIN = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';

async function call<T>(path: string, env = makeEnv(), init: RequestInit = {}) {
  const res = await app.request(path, { ...init, headers: { ...AUTH, ...init.headers } }, env);
  return { res, body: (await res.json()) as ApiResult<T> };
}

beforeEach(() => resetLwaMemo());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('auth', () => {
  it('rejects a missing key', async () => {
    const res = await app.request('/v1/health', {}, makeEnv());
    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toMatch(/^Bearer/);
    expect(await res.json()).toMatchObject({ ok: false, error: { code: 'AUTH' } });
  });

  it('rejects a wrong key', async () => {
    const res = await app.request(
      '/v1/health',
      { headers: { Authorization: 'Bearer nope' } },
      makeEnv(),
    );
    expect(res.status).toBe(401);
  });

  it('rejects everything when EXT_SHARED_KEY is not configured', async () => {
    const { res } = await call('/v1/health', makeEnv({ EXT_SHARED_KEY: undefined }));
    expect(res.status).toBe(401);
  });

  it('accepts the shared key', async () => {
    const { res, body } = await call<HealthDTO>('/v1/health');
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
  });
});

describe('cors', () => {
  it('answers preflight without a key', async () => {
    const res = await app.request(
      '/v1/health',
      {
        method: 'OPTIONS',
        headers: {
          Origin: EXT_ORIGIN,
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'authorization',
        },
      },
      makeEnv(),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(EXT_ORIGIN);
    expect(res.headers.get('Access-Control-Allow-Headers')).toMatch(/Authorization/i);
  });

  it('only allows listed origins when ALLOWED_ORIGINS is set', async () => {
    const env = makeEnv({ ALLOWED_ORIGINS: 'chrome-extension://otherotherotherotherotherotherot' });
    const res = await app.request('/v1/health', { headers: { ...AUTH, Origin: EXT_ORIGIN } }, env);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('does not allow web origins', async () => {
    const res = await app.request(
      '/v1/health',
      { headers: { ...AUTH, Origin: 'https://evil.example' } },
      makeEnv(),
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('keeps CORS headers on error responses', async () => {
    const res = await app.request('/v1/health', { headers: { Origin: EXT_ORIGIN } }, makeEnv());
    expect(res.status).toBe(401);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(EXT_ORIGIN);
  });
});

describe('GET /v1/health', () => {
  it('reports which secrets are set without returning values', async () => {
    const { body } = await call<HealthDTO>('/v1/health', makeEnv({ KEEPA_API_KEY: '' }));
    if (!body.ok) throw new Error('expected ok');
    expect(body.data.worker).toEqual({ ok: true, version: expect.any(String) });
    expect(body.data.secrets).toEqual({
      LWA_CLIENT_ID: true,
      LWA_CLIENT_SECRET: true,
      LWA_REFRESH_TOKEN: true,
      SELLER_ID: true,
      KEEPA_API_KEY: false,
      EXT_SHARED_KEY: true,
    });
    expect(JSON.stringify(body)).not.toContain('client-secret');
    expect(body.data.spapi).toBeUndefined();
  });

  it('deep check: SP-API OK and seller ID confirmed', async () => {
    const f = mockFetch({
      [LWA_URL]: lwaOk,
      [`${SPAPI}/sellers/v1/marketplaceParticipations`]: () =>
        json({
          payload: [
            {
              marketplace: { id: 'ATVPDKIKX0DER', countryCode: 'US' },
              participation: { isParticipating: true },
            },
          ],
        }),
      [`${SPAPI}/listings/2021-08-01/restrictions`]: () => json({ restrictions: [] }),
      [`${KEEPA}/token`]: () => json({ tokensLeft: 18, refillIn: 2500, refillRate: 20 }),
    });
    const { body } = await call<HealthDTO>('/v1/health?deep=1');
    if (!body.ok) throw new Error('expected ok');
    expect(body.data.spapi).toEqual({ ok: true, marketplaces: ['US'] });
    expect(body.data.seller).toEqual({ ok: true, sellerId: 'A1SELLERTEST' });
    expect(body.data.keepa).toEqual({ ok: true, tokensLeft: 18, refillIn: 2500 });

    const restr = f.calls.find((r) => r.url.includes('/restrictions'))!;
    const url = new URL(restr.url);
    expect(url.searchParams.get('sellerId')).toBe('A1SELLERTEST');
    expect(url.searchParams.get('marketplaceIds')).toBe('ATVPDKIKX0DER');
    expect(restr.headers.get('x-amz-access-token')).toBe('Atza|access');

    const lwa = f.calls.find((r) => r.url === LWA_URL)!;
    const form = new URLSearchParams(await lwa.text());
    expect(form.get('grant_type')).toBe('refresh_token');
    expect(form.get('refresh_token')).toBe('Atzr|refresh');
  });

  it('deep check: bad refresh token fails both SP-API and seller with AUTH', async () => {
    mockFetch({
      [LWA_URL]: () =>
        json(
          { error: 'invalid_grant', error_description: 'The request has an invalid grant' },
          400,
        ),
      [`${KEEPA}/token`]: () => json({ tokensLeft: 20, refillIn: 0 }),
    });
    const { body } = await call<HealthDTO>('/v1/health?deep=1');
    if (!body.ok) throw new Error('expected ok');
    expect(body.data.spapi).toMatchObject({ ok: false, error: { code: 'AUTH' } });
    expect(body.data.spapi?.error?.message).toContain('invalid_grant');
    expect(body.data.seller).toMatchObject({ ok: false, sellerId: 'A1SELLERTEST' });
  });

  it('deep check: wrong seller ID is reported separately from SP-API', async () => {
    mockFetch({
      [LWA_URL]: lwaOk,
      [`${SPAPI}/sellers/v1/marketplaceParticipations`]: () => json({ payload: [] }),
      [`${SPAPI}/listings/2021-08-01/restrictions`]: () =>
        json(
          {
            errors: [{ code: 'Unauthorized', message: 'Access to requested resource is denied.' }],
          },
          403,
        ),
      [`${KEEPA}/token`]: () => json({ tokensLeft: 20, refillIn: 0 }),
    });
    const { body } = await call<HealthDTO>('/v1/health?deep=1');
    if (!body.ok) throw new Error('expected ok');
    expect(body.data.spapi?.ok).toBe(true);
    expect(body.data.seller).toMatchObject({ ok: false, error: { code: 'AUTH' } });
    expect(body.data.seller?.error?.message).toContain('Access to requested resource is denied');
  });

  it('deep check: unreachable upstreams name the service without leaking the Keepa key', async () => {
    const fail = () => {
      throw new TypeError('fetch failed: https://api.keepa.com/token?key=keepa-key');
    };
    mockFetch({ [LWA_URL]: fail, [`${KEEPA}/token`]: fail });
    const { body } = await call<HealthDTO>('/v1/health?deep=1');
    if (!body.ok) throw new Error('expected ok');
    expect(body.data.spapi?.error).toEqual({
      code: 'UPSTREAM',
      message: 'Cannot reach LWA (api.amazon.com)',
    });
    expect(body.data.keepa?.error?.message).toBe('Cannot reach Keepa (api.keepa.com)');
    expect(JSON.stringify(body)).not.toContain('keepa-key');
  });

  it('deep check: missing Keepa key is reported, not thrown', async () => {
    mockFetch({
      [LWA_URL]: lwaOk,
      [`${SPAPI}/sellers`]: () => json({ payload: [] }),
      [`${SPAPI}/listings`]: () => json({ restrictions: [] }),
    });
    const { body } = await call<HealthDTO>('/v1/health?deep=1', makeEnv({ KEEPA_API_KEY: '' }));
    if (!body.ok) throw new Error('expected ok');
    expect(body.data.keepa).toMatchObject({ ok: false, error: { code: 'AUTH' } });
  });
});

describe('GET /v1/:mp/spapi/catalog/:asin', () => {
  const catalogUrl = `${SPAPI}/catalog/2022-04-01/items/`;

  it('returns the normalized item and serves the second call from cache', async () => {
    const env = makeEnv();
    const f = mockFetch({ [LWA_URL]: lwaOk, [catalogUrl]: () => json(catalogFixture) });

    const first = await call<CatalogDTO>('/v1/us/spapi/catalog/b0testchld', env);
    expect(first.res.status).toBe(200);
    if (!first.body.ok) throw new Error('expected ok');
    expect(first.body.cached).toBe(false);
    expect(first.body.data).toMatchObject({
      asin: 'B0TESTCHLD',
      parentAsin: 'B0TESTPRNT',
      title: 'Acme Widget, Blue, Large',
      brand: 'Acme',
      salesRank: { rank: 45210, category: 'Home & Kitchen', source: 'displayGroup' },
    });

    const req = f.calls.find((r) => r.url.startsWith(catalogUrl))!;
    const url = new URL(req.url);
    expect(url.pathname).toBe('/catalog/2022-04-01/items/B0TESTCHLD');
    expect(url.searchParams.get('marketplaceIds')).toBe('ATVPDKIKX0DER');
    expect(url.searchParams.get('includedData')).toBe(
      'attributes,dimensions,identifiers,images,productTypes,relationships,salesRanks,summaries,classifications',
    );

    const second = await call<CatalogDTO>('/v1/us/spapi/catalog/B0TESTCHLD', env);
    if (!second.body.ok) throw new Error('expected ok');
    expect(second.body.cached).toBe(true);
    expect(second.body.fetchedAt).toBe(first.body.fetchedAt);
    expect(f.count(catalogUrl)).toBe(1);
    expect(f.count(LWA_URL)).toBe(1);
  });

  it('fresh=1 bypasses the cache', async () => {
    const env = makeEnv();
    const f = mockFetch({ [LWA_URL]: lwaOk, [catalogUrl]: () => json(catalogFixture) });
    await call('/v1/us/spapi/catalog/B0TESTCHLD', env);
    const { body } = await call('/v1/us/spapi/catalog/B0TESTCHLD?fresh=1', env);
    expect(body).toMatchObject({ ok: true, cached: false });
    expect(f.count(catalogUrl)).toBe(2);
  });

  it('reuses the LWA token across requests via KV', async () => {
    const env = makeEnv();
    const f = mockFetch({ [LWA_URL]: lwaOk, [catalogUrl]: () => json(catalogFixture) });
    await call('/v1/us/spapi/catalog/B0TESTCHLD', env);
    resetLwaMemo(); // simulate a new isolate
    await call('/v1/us/spapi/catalog/B0TESTCHL2', env);
    expect(f.count(LWA_URL)).toBe(1);
  });

  it('rejects an invalid ASIN', async () => {
    const { res, body } = await call('/v1/us/spapi/catalog/NOT-AN-ASIN');
    expect(res.status).toBe(400);
    expect(body).toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
  });

  it('rejects unsupported marketplaces', async () => {
    const { res, body } = await call('/v1/ca/spapi/catalog/B0TESTCHLD');
    expect(res.status).toBe(400);
    expect(body).toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
  });

  it('upstream auth errors carry no Bearer challenge', async () => {
    mockFetch({ [LWA_URL]: () => json({ error: 'invalid_client' }, 401) });
    const { res, body } = await call('/v1/us/spapi/catalog/B0TESTCHLD');
    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toBeNull();
    expect(body).toMatchObject({ ok: false, error: { code: 'AUTH' } });
  });

  it('maps SP-API 404 to NOT_FOUND', async () => {
    mockFetch({
      [LWA_URL]: lwaOk,
      [catalogUrl]: () =>
        json({ errors: [{ code: 'NOT_FOUND', message: 'Requested item not found' }] }, 404),
    });
    const { res, body } = await call('/v1/us/spapi/catalog/B0TESTCHLD');
    expect(res.status).toBe(404);
    expect(body).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('retries 429 with backoff and succeeds', async () => {
    const sleep = vi.spyOn(timing, 'sleep').mockResolvedValue();
    const f = mockFetch({
      [LWA_URL]: lwaOk,
      [catalogUrl]: [() => json({ errors: [] }, 429), () => json(catalogFixture)],
    });
    const { body } = await call('/v1/us/spapi/catalog/B0TESTCHLD');
    expect(body.ok).toBe(true);
    expect(f.count(catalogUrl)).toBe(2);
    expect(sleep.mock.calls).toEqual([[500]]);
  });

  it('gives up after 3 retries with RATE_LIMIT and retryAfter', async () => {
    const sleep = vi.spyOn(timing, 'sleep').mockResolvedValue();
    const kv = memoryKV();
    const env = makeEnv({ CACHE: kv });
    const f = mockFetch({
      [LWA_URL]: lwaOk,
      [catalogUrl]: () =>
        json({ errors: [{ code: 'QuotaExceeded', message: 'You exceeded your quota' }] }, 429, {
          'x-amzn-RateLimit-Limit': '0.5',
        }),
    });
    const { res, body } = await call('/v1/us/spapi/catalog/B0TESTCHLD', env);
    expect(sleep.mock.calls).toEqual([[500], [1000], [2000]]);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('2');
    expect(body).toMatchObject({ ok: false, error: { code: 'RATE_LIMIT', retryAfter: 2 } });
    expect(f.count(catalogUrl)).toBe(4);
    expect(kv.store.has('spapi:last429At')).toBe(true);
  });

  it('refreshes the token once on 403', async () => {
    const f = mockFetch({
      [LWA_URL]: lwaOk,
      [catalogUrl]: [
        () => json({ errors: [{ code: 'Unauthorized', message: 'expired' }] }, 403),
        () => json(catalogFixture),
      ],
    });
    const { body } = await call('/v1/us/spapi/catalog/B0TESTCHLD');
    expect(body.ok).toBe(true);
    expect(f.count(LWA_URL)).toBe(2);
  });
});

describe('unknown routes', () => {
  it('returns NOT_FOUND', async () => {
    const { res, body } = await call('/v1/nope');
    expect(res.status).toBe(404);
    expect(body).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });
});

describe('GET /privacy', () => {
  it('is public HTML', async () => {
    const res = await app.request('/privacy', {}, makeEnv());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('OA Lens privacy policy');
  });
});
