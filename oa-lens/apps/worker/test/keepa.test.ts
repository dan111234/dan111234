import type { ApiResult, KeepaProductsDTO } from '@oa-lens/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { normalizeHazmat, normalizeKeepaProduct, type RawKeepaProduct } from '../src/keepa/product';
import fixture from './fixtures/keepa-product.json';
import { AUTH, json, KEEPA, makeEnv, mockFetch } from './helpers';

const app = createApp();

async function call<T>(path: string, env = makeEnv()) {
  const res = await app.request(path, { headers: AUTH }, env);
  return { res, body: (await res.json()) as ApiResult<T> };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('normalizeKeepaProduct (B0FBP3N9RK with offers=20)', () => {
  const p = normalizeKeepaProduct(fixture.products[0] as RawKeepaProduct, true);
  it('keeps the stats the widget reads', () => {
    expect(p.asin).toBe('B0FBP3N9RK');
    expect(p.salesRankDrops30).toBe(8);
    expect(p.salesRankDrops90).toBe(25);
    expect(p.salesRankDrops180).toBe(41);
    expect(p.avg90[3]).toBe(209532);
    expect(p.avg90[10]).toBe(10327);
    expect(p.withOffers).toBe(true);
    expect(p.salesCsv?.length).toBeGreaterThan(10);
  });
  it('converts listedSince to Unix ms (2025-06-02)', () => {
    expect(new Date(p.listedSince!).toISOString().slice(0, 10)).toBe('2025-06-02');
  });
  it('-1 drops and missing fields become null', () => {
    const bare = normalizeKeepaProduct({ asin: 'B0X', stats: { salesRankDrops30: -1 } }, false);
    expect(bare).toMatchObject({
      salesRankDrops30: null,
      monthlySold: null,
      listedSince: null,
      salesCsv: null,
    });
  });
});

describe('normalizeHazmat', () => {
  // B0HC235K4R (Nuwave heated mug), Keepa 2026-10-14; RevSeller shows a yellow Haz badge.
  const mug = [
    { aspect: 'proper_shipping_name', value: 'LITHIUM ION BATTERIES CONTAINED IN EQUIPMENT' },
    { aspect: 'united_nations_regulatory_id', value: 'UN3481' },
    { aspect: 'regulatory_packing_group', value: 'II' },
    { aspect: 'exception', value: 'AE_SmallLithiumIonBatteryInEquipment' },
    { aspect: 'exception', value: 'US_SmallLithiumIonBatteryInEquipment' },
    { aspect: 'transportation_regulatory_class', value: '9' },
  ];
  it('reads UN id, class, name and US exceptions', () => {
    expect(normalizeHazmat(mug)).toEqual({
      unId: 'UN3481',
      className: '9',
      shippingName: 'LITHIUM ION BATTERIES CONTAINED IN EQUIPMENT',
      packingGroup: 'II',
      usExceptions: ['US_SmallLithiumIonBatteryInEquipment'],
    });
  });
  it('empty or exception-only lists are not hazmat', () => {
    expect(normalizeHazmat([])).toBeNull();
    expect(normalizeHazmat(undefined)).toBeNull();
    expect(normalizeHazmat([{ aspect: 'exception', value: 'US_X' }])).toBeNull();
  });
});

describe('GET /v1/:mp/keepa/product/:asins', () => {
  it('fetches once, caches per ASIN and reports the quota; never leaks the key', async () => {
    const env = makeEnv();
    const f = mockFetch({ [`${KEEPA}/product`]: () => json(fixture) });
    const first = await call<KeepaProductsDTO>('/v1/us/keepa/product/b0fbp3n9rk?offers=20', env);
    expect(first.res.status).toBe(200);
    if (!first.body.ok) throw new Error('expected ok');
    expect(first.body.data.products[0]!.salesRankDrops90).toBe(25);
    expect(first.body.data.quota).toMatchObject({ tokensLeft: 1191, refillIn: 2970 });
    const url = new URL(f.calls[0]!.url);
    expect(url.searchParams.get('offers')).toBe('20');
    expect(url.searchParams.get('stats')).toBe('180');
    expect(url.searchParams.get('history')).toBe('1');
    expect(JSON.stringify(first.body)).not.toContain('keepa-key');

    await call('/v1/us/keepa/product/B0FBP3N9RK?offers=20', env);
    expect(f.count(`${KEEPA}/product`)).toBe(1);
    // Without offers is a different cache entry.
    await call('/v1/us/keepa/product/B0FBP3N9RK', env);
    expect(f.count(`${KEEPA}/product`)).toBe(2);
  });

  it('maps 429 to RATE_LIMIT with the refill wait', async () => {
    mockFetch({ [`${KEEPA}/product`]: () => json({ tokensLeft: -5, refillIn: 12000 }, 429) });
    const { res, body } = await call('/v1/us/keepa/product/B0FBP3N9RK');
    expect(res.status).toBe(429);
    expect(body).toMatchObject({ ok: false, error: { code: 'RATE_LIMIT', retryAfter: 12 } });
  });

  it('rejects bad ASIN lists', async () => {
    expect((await call('/v1/us/keepa/product/nope')).res.status).toBe(400);
  });

  it('GET /v1/quota', async () => {
    const env = makeEnv();
    mockFetch({ [`${KEEPA}/product`]: () => json(fixture) });
    await call('/v1/us/keepa/product/B0FBP3N9RK', env);
    const { body } = await call<{ keepa: { tokensLeft: number } }>('/v1/quota', env);
    expect(body).toMatchObject({ ok: true, data: { keepa: { tokensLeft: 1191 } } });
  });
});
