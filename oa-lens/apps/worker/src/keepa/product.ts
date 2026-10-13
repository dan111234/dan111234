import { MARKETPLACES, type KeepaProductDTO, type MarketplaceKey } from '@oa-lens/shared';
import type { Env } from '../env';
import { ApiError } from '../lib/errors';
import { upstreamFetch } from '../lib/http';
import { saveQuota } from './client';

const KEEPA_HOST = 'https://api.keepa.com';
const KEEPA_EPOCH_MINUTES = 21564000;

export interface RawKeepaProduct {
  asin?: string;
  csv?: (number[] | null)[] | null;
  monthlySold?: number;
  listedSince?: number;
  stats?: {
    avg30?: number[];
    avg90?: number[];
    avg180?: number[];
    current?: number[];
    salesRankDrops30?: number;
    salesRankDrops90?: number;
    salesRankDrops180?: number;
    outOfStockPercentage30?: number[];
    outOfStockPercentage90?: number[];
  } | null;
}

interface RawKeepaResponse {
  products?: RawKeepaProduct[];
  tokensLeft?: number;
  refillIn?: number;
  refillRate?: number;
  error?: { type?: string; message?: string };
}

const drops = (v: number | undefined) => (typeof v === 'number' && v >= 0 ? v : null);

export function normalizeKeepaProduct(p: RawKeepaProduct, withOffers: boolean): KeepaProductDTO {
  const s = p.stats ?? {};
  return {
    asin: p.asin ?? '',
    avg30: s.avg30 ?? [],
    avg90: s.avg90 ?? [],
    avg180: s.avg180 ?? [],
    current: s.current ?? [],
    salesRankDrops30: drops(s.salesRankDrops30),
    salesRankDrops90: drops(s.salesRankDrops90),
    salesRankDrops180: drops(s.salesRankDrops180),
    outOfStockPercentage30: s.outOfStockPercentage30 ?? [],
    outOfStockPercentage90: s.outOfStockPercentage90 ?? [],
    monthlySold: typeof p.monthlySold === 'number' && p.monthlySold > 0 ? p.monthlySold : null,
    listedSince:
      typeof p.listedSince === 'number' && p.listedSince > 0
        ? (p.listedSince + KEEPA_EPOCH_MINUTES) * 60000
        : null,
    salesCsv: p.csv?.[3] ?? null,
    withOffers,
  };
}

/**
 * Keepa /product with 180-day stats and history (docs/07 §4). `offers` = 20 adds the offer list,
 * which is what fills the FBA/FBM/Buy Box averages; it costs about 6 tokens instead of 1.
 */
export async function fetchKeepaProducts(
  env: Env,
  mp: MarketplaceKey,
  asins: string[],
  offers: 0 | 20,
): Promise<KeepaProductDTO[]> {
  if (!env.KEEPA_API_KEY) throw new ApiError('AUTH', 'KEEPA_API_KEY is not set on the Worker');
  const url = new URL('/product', KEEPA_HOST);
  url.searchParams.set('key', env.KEEPA_API_KEY);
  url.searchParams.set('domain', String(MARKETPLACES[mp].keepaDomain));
  url.searchParams.set('asin', asins.join(','));
  url.searchParams.set('stats', '180');
  url.searchParams.set('history', '1');
  if (offers) url.searchParams.set('offers', String(offers));

  const res = await upstreamFetch('Keepa', url, { headers: { 'accept-encoding': 'gzip' } });
  const body = (await res.json().catch(() => ({}))) as RawKeepaResponse;
  await saveQuota(env, body);
  if (!res.ok) {
    // Never echo the URL: it contains the key.
    if (res.status === 429) {
      const wait = Math.max(1, Math.ceil((body.refillIn ?? 60000) / 1000));
      throw new ApiError('RATE_LIMIT', 'Keepa tokens used up', wait);
    }
    if ([400, 401, 402, 403].includes(res.status)) {
      throw new ApiError('AUTH', `Keepa rejected the request (${res.status})`);
    }
    throw new ApiError('UPSTREAM', `Keepa ${res.status}`);
  }
  return (body.products ?? []).map((p) => normalizeKeepaProduct(p, offers > 0));
}
