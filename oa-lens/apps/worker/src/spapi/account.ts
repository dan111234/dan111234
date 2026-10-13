import { MARKETPLACES, type MarketplaceKey } from '@oa-lens/shared';
import type { Env } from '../env';
import { ApiError } from '../lib/errors';
import { spapiFetch } from './client';

/** Any real ASIN works; an unknown one still returns 200 with ASIN_NOT_FOUND. */
export const SELLER_CHECK_ASIN = 'B07FZ8S74R';

interface ParticipationsResponse {
  payload?: {
    marketplace?: { id?: string; countryCode?: string };
    participation?: { isParticipating?: boolean };
  }[];
}

/** Sellers API: returns the country codes the seller participates in. */
export async function getParticipatingMarketplaces(env: Env): Promise<string[]> {
  const res = await spapiFetch<ParticipationsResponse>(env, 'us', {
    path: '/sellers/v1/marketplaceParticipations',
  });
  return (res.payload ?? [])
    .filter((p) => p.participation?.isParticipating !== false)
    .map((p) => p.marketplace?.countryCode ?? p.marketplace?.id ?? '')
    .filter(Boolean);
}

/**
 * Verifies SELLER_ID belongs to the authorized account by calling Listings Restrictions,
 * which rejects a sellerId that does not match the refresh token.
 */
export async function verifySellerId(env: Env, mp: MarketplaceKey): Promise<string> {
  const sellerId = env.SELLER_ID;
  if (!sellerId) throw new ApiError('AUTH', 'SELLER_ID is not set on the Worker');
  await spapiFetch(env, mp, {
    path: '/listings/2021-08-01/restrictions',
    query: {
      asin: SELLER_CHECK_ASIN,
      sellerId,
      marketplaceIds: MARKETPLACES[mp].id,
      conditionType: 'new_new',
    },
  });
  return sellerId;
}
