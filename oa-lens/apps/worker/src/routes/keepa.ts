import { isValidAsin } from '@oa-lens/core';
import type { KeepaProductDTO, KeepaProductsDTO } from '@oa-lens/shared';
import { Hono } from 'hono';
import { KEEPA_QUOTA_KEY, type KeepaQuota } from '../keepa/client';
import { fetchKeepaProducts } from '../keepa/product';
import { cacheKey, TTL, withCache } from '../lib/cache';
import { ApiError } from '../lib/errors';
import { liveBody } from '../lib/respond';
import { requireMp, type MpEnv } from './spapi';

const MAX_ASINS = 100;

/** Mounted at /v1/:mp/keepa (docs/07 §4). Each ASIN is cached on its own. */
export const keepaRoutes = new Hono<MpEnv>()
  .use('*', requireMp)
  .get('/product/:asins', async (c) => {
    const mp = c.get('mp');
    const asins = [
      ...new Set(
        (c.req.param('asins') ?? '')
          .split(',')
          .map((a) => a.trim().toUpperCase())
          .filter(Boolean),
      ),
    ];
    if (asins.length === 0 || asins.length > MAX_ASINS || !asins.every(isValidAsin)) {
      throw new ApiError('BAD_REQUEST', `Give 1-${MAX_ASINS} valid ASINs`);
    }
    const offers = c.req.query('offers') === '20' ? 20 : 0;
    const fresh = c.req.query('fresh') === '1';
    const ttl = offers ? 10 * TTL.minute : TTL.hour;
    const keyFor = (asin: string) => cacheKey('keepa', mp, 'product', { asin, offers });

    const found = new Map<string, KeepaProductDTO>();
    if (!fresh) {
      for (const asin of asins) {
        const hit = await c.env.CACHE.get<{ data: KeepaProductDTO }>(await keyFor(asin), 'json');
        if (hit) found.set(asin, hit.data);
      }
    }
    const missing = asins.filter((a) => !found.has(a));
    if (missing.length) {
      const products = await fetchKeepaProducts(c.env, mp, missing, offers);
      for (const p of products) {
        found.set(p.asin, p);
        await withCache(c.env.CACHE, await keyFor(p.asin), ttl, async () => p, { fresh: true });
      }
    }
    const quota = await c.env.CACHE.get<KeepaQuota>(KEEPA_QUOTA_KEY, 'json');
    const data: KeepaProductsDTO = {
      products: asins.map((a) => found.get(a)).filter((p): p is KeepaProductDTO => p != null),
      quota,
    };
    return c.json(liveBody(data));
  });

/** GET /v1/quota (docs/07 §4). */
export const quotaRoutes = new Hono<MpEnv>().get('/', async (c) => {
  const keepa = await c.env.CACHE.get<KeepaQuota>(KEEPA_QUOTA_KEY, 'json');
  const last429 = await c.env.CACHE.get('spapi:last429At');
  return c.json(liveBody({ keepa, spapi: { last429At: last429 ? Number(last429) : null } }));
});
