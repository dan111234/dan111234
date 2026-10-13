import { isValidAsin } from '@oa-lens/core';
import { isMarketplaceKey, type MarketplaceKey } from '@oa-lens/shared';
import { Hono } from 'hono';
import type { Env } from '../env';
import { cacheKey, TTL, withCache } from '../lib/cache';
import { ApiError } from '../lib/errors';
import { okBody } from '../lib/respond';
import { fetchCatalogItem } from '../spapi/catalog';
import { fetchTieredFees } from '../spapi/fees';

type SpapiEnv = { Bindings: Env; Variables: { mp: MarketplaceKey } };

/** Mounted at /v1/:mp/spapi (docs/07 §2). */
export const spapiRoutes = new Hono<SpapiEnv>()
  .use('*', async (c, next) => {
    const mp = c.req.param('mp') ?? '';
    if (!isMarketplaceKey(mp)) throw new ApiError('BAD_REQUEST', `Unsupported marketplace: ${mp}`);
    c.set('mp', mp);
    await next();
  })
  .get('/catalog/:asin', async (c) => {
    const asin = c.req.param('asin').toUpperCase();
    if (!isValidAsin(asin)) throw new ApiError('BAD_REQUEST', `Invalid ASIN: ${asin}`);
    const mp = c.get('mp');
    const key = await cacheKey('spapi', mp, 'catalog', { asin });
    const result = await withCache(
      c.env.CACHE,
      key,
      7 * TTL.day,
      () => fetchCatalogItem(c.env, mp, asin),
      { fresh: c.req.query('fresh') === '1' },
    );
    return c.json(okBody(result));
  })
  .get('/fees/:asin/tiered', async (c) => {
    const asin = c.req.param('asin').toUpperCase();
    if (!isValidAsin(asin)) throw new ApiError('BAD_REQUEST', `Invalid ASIN: ${asin}`);
    const mp = c.get('mp');
    const key = await cacheKey('spapi', mp, 'feesTiered', { asin });
    const result = await withCache(
      c.env.CACHE,
      key,
      TTL.day,
      () => fetchTieredFees(c.env, mp, asin),
      { fresh: c.req.query('fresh') === '1' },
    );
    return c.json(okBody(result));
  });
