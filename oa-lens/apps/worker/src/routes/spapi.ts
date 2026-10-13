import { isValidAsin } from '@oa-lens/core';
import { isMarketplaceKey, type MarketplaceKey, type OfferCondition } from '@oa-lens/shared';
import { Hono, type Context } from 'hono';
import type { Env } from '../env';
import { ApiError } from '../lib/errors';
import { okBody } from '../lib/respond';
import { loaders } from '../spapi/loaders';
import { NEW_CONDITIONS, USED_CONDITIONS } from '../spapi/restrictions';

export type MpEnv = { Bindings: Env; Variables: { mp: MarketplaceKey } };

export const requireMp = async (c: Context<MpEnv>, next: () => Promise<void>) => {
  const mp = c.req.param('mp') ?? '';
  if (!isMarketplaceKey(mp)) throw new ApiError('BAD_REQUEST', `Unsupported marketplace: ${mp}`);
  c.set('mp', mp);
  await next();
};

export function asinParam(c: Context): string {
  const asin = (c.req.param('asin') ?? '').toUpperCase();
  if (!isValidAsin(asin)) throw new ApiError('BAD_REQUEST', `Invalid ASIN: ${asin}`);
  return asin;
}

export function conditionParam(c: Context): OfferCondition {
  const raw = (c.req.query('condition') ?? 'new').toLowerCase();
  if (raw === 'new' || raw === 'used') return raw;
  throw new ApiError('BAD_REQUEST', `Unsupported condition: ${raw}`);
}

const fresh = (c: Context) => ({ fresh: c.req.query('fresh') === '1' });

const ALL_CONDITION_TYPES = new Set<string>([...NEW_CONDITIONS, ...USED_CONDITIONS]);

/** Mounted at /v1/:mp/spapi (docs/07 §2). */
export const spapiRoutes = new Hono<MpEnv>()
  .use('*', requireMp)
  .get('/catalog/:asin', async (c) =>
    c.json(okBody(await loaders.catalog(c.env, c.get('mp'), asinParam(c), fresh(c)))),
  )
  .get('/fees/:asin/tiered', async (c) =>
    c.json(okBody(await loaders.feesTiered(c.env, c.get('mp'), asinParam(c), fresh(c)))),
  )
  .get('/offers/:asin', async (c) =>
    c.json(
      okBody(await loaders.offers(c.env, c.get('mp'), asinParam(c), conditionParam(c), fresh(c))),
    ),
  )
  .get('/restrictions/:asin', async (c) => {
    const conditionType = c.req.query('condition') ?? 'new_new';
    if (!ALL_CONDITION_TYPES.has(conditionType)) {
      throw new ApiError('BAD_REQUEST', `Unsupported condition type: ${conditionType}`);
    }
    return c.json(
      okBody(await loaders.restriction(c.env, c.get('mp'), asinParam(c), conditionType, fresh(c))),
    );
  })
  .get('/eligibility/:asin', async (c) =>
    c.json(okBody(await loaders.eligibility(c.env, c.get('mp'), asinParam(c), fresh(c)))),
  )
  .get('/prep/:asin', async (c) =>
    c.json(okBody(await loaders.prep(c.env, c.get('mp'), asinParam(c), fresh(c)))),
  );
