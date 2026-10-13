// Cached SP-API loaders shared by the single-resource routes and the product bundle (docs/07 §2).
import type { MarketplaceKey, OfferCondition } from '@oa-lens/shared';
import type { Env } from '../env';
import { cacheKey, TTL, withCache, type CachedResult } from '../lib/cache';
import { fetchCatalogItem } from './catalog';
import { fetchTieredFees } from './fees';
import { fetchEligibility, fetchPrep } from './inbound';
import { fetchOffers } from './offers';
import { fetchRestrictions } from './restrictions';

interface Opts {
  fresh?: boolean;
}

async function cached<T>(
  env: Env,
  mp: MarketplaceKey,
  op: string,
  params: Record<string, string>,
  ttl: number,
  load: () => Promise<T>,
  opts: Opts,
): Promise<CachedResult<T>> {
  const key = await cacheKey('spapi', mp, op, params);
  return withCache(env.CACHE, key, ttl, load, { fresh: opts.fresh });
}

export const loaders = {
  catalog: (env: Env, mp: MarketplaceKey, asin: string, opts: Opts = {}) =>
    cached(env, mp, 'catalog', { asin }, 7 * TTL.day, () => fetchCatalogItem(env, mp, asin), opts),
  offers: (
    env: Env,
    mp: MarketplaceKey,
    asin: string,
    condition: OfferCondition,
    opts: Opts = {},
  ) =>
    cached(
      env,
      mp,
      'offers',
      { asin, condition },
      3 * TTL.minute,
      () => fetchOffers(env, mp, asin, condition),
      opts,
    ),
  feesTiered: (env: Env, mp: MarketplaceKey, asin: string, opts: Opts = {}) =>
    cached(env, mp, 'feesTiered', { asin }, TTL.day, () => fetchTieredFees(env, mp, asin), opts),
  restriction: (
    env: Env,
    mp: MarketplaceKey,
    asin: string,
    conditionType: string,
    opts: Opts = {},
  ) =>
    cached(
      env,
      mp,
      'restrictions',
      { asin, conditionType },
      12 * TTL.hour,
      () => fetchRestrictions(env, mp, asin, conditionType),
      opts,
    ),
  eligibility: (env: Env, mp: MarketplaceKey, asin: string, opts: Opts = {}) =>
    cached(env, mp, 'eligibility', { asin }, TTL.day, () => fetchEligibility(env, mp, asin), opts),
  prep: (env: Env, mp: MarketplaceKey, asin: string, opts: Opts = {}) =>
    cached(env, mp, 'prep', { asin }, 7 * TTL.day, () => fetchPrep(env, mp, asin), opts),
};
