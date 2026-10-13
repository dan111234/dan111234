import {
  AMAZON_SELLER_IDS,
  MARKETPLACES,
  type MarketplaceKey,
  type OfferCondition,
  type OfferDTO,
  type OffersDTO,
} from '@oa-lens/shared';
import type { Env } from '../env';
import { spapiFetch } from './client';

interface Money {
  Amount?: number;
}
interface RawCount {
  condition?: string;
  fulfillmentChannel?: string;
  OfferCount?: number;
}
interface RawPrice {
  condition?: string;
  fulfillmentChannel?: string;
  LandedPrice?: Money;
  ListingPrice?: Money;
  Shipping?: Money;
}
interface RawOffer {
  SellerId?: string;
  SubCondition?: string;
  ListingPrice?: Money;
  Shipping?: Money;
  ShippingTime?: { minimumHours?: number; maximumHours?: number };
  SellerFeedbackRating?: { FeedbackCount?: number; SellerPositiveFeedbackRating?: number };
  PrimeInformation?: { IsPrime?: boolean };
  IsBuyBoxWinner?: boolean;
  IsFulfilledByAmazon?: boolean;
}
export interface RawOffersPayload {
  ASIN?: string;
  Summary?: {
    LowestPrices?: RawPrice[];
    BuyBoxPrices?: RawPrice[];
    NumberOfOffers?: RawCount[];
    BuyBoxEligibleOffers?: RawCount[];
    ListPrice?: Money;
    CompetitivePriceThreshold?: Money;
    TotalOfferCount?: number;
  };
  Offers?: RawOffer[];
}

const cents = (n: number) => Math.round(n * 100) / 100;
const money = (m: Money | undefined) => (typeof m?.Amount === 'number' ? m.Amount : null);
const sameCondition = (a: string | undefined, condition: OfferCondition) =>
  (a ?? '').toLowerCase() === condition;

function landed(p: RawPrice): number | null {
  const l = money(p.LandedPrice);
  if (l != null) return l;
  const listing = money(p.ListingPrice);
  return listing == null ? null : cents(listing + (money(p.Shipping) ?? 0));
}

function minOf(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v != null);
  return nums.length ? Math.min(...nums) : null;
}

function count(
  list: RawCount[] | undefined,
  condition: OfferCondition,
  channel: 'Amazon' | 'Merchant',
) {
  return (list ?? [])
    .filter((c) => sameCondition(c.condition, condition) && c.fulfillmentChannel === channel)
    .reduce((sum, c) => sum + (c.OfferCount ?? 0), 0);
}

export function normalizeOffers(
  asin: string,
  condition: OfferCondition,
  payload: RawOffersPayload,
): OffersDTO {
  const s = payload.Summary ?? {};
  const lowest = (channel: 'Amazon' | 'Merchant') =>
    minOf(
      (s.LowestPrices ?? [])
        .filter((p) => sameCondition(p.condition, condition) && p.fulfillmentChannel === channel)
        .map(landed),
    );
  const offers: OfferDTO[] = (payload.Offers ?? []).map((o) => {
    const price = money(o.ListingPrice) ?? 0;
    const shipping = money(o.Shipping) ?? 0;
    const sellerId = o.SellerId ?? '';
    return {
      sellerId,
      fba: Boolean(o.IsFulfilledByAmazon),
      amazon: AMAZON_SELLER_IDS.includes(sellerId),
      price,
      shipping,
      landed: cents(price + shipping),
      buyBoxWinner: Boolean(o.IsBuyBoxWinner),
      prime: Boolean(o.PrimeInformation?.IsPrime),
      feedbackCount: o.SellerFeedbackRating?.FeedbackCount ?? null,
      feedbackPct: o.SellerFeedbackRating?.SellerPositiveFeedbackRating ?? null,
      shipMinHours: o.ShippingTime?.minimumHours ?? null,
      shipMaxHours: o.ShippingTime?.maximumHours ?? null,
      subCondition: o.SubCondition ?? null,
    };
  });
  const fba = count(s.NumberOfOffers, condition, 'Amazon');
  const fbm = count(s.NumberOfOffers, condition, 'Merchant');
  const buyBox = (s.BuyBoxPrices ?? []).find((p) => sameCondition(p.condition, condition));
  return {
    asin,
    condition,
    counts: { fba, fbm, total: fba + fbm },
    lowestFba: lowest('Amazon'),
    lowestFbm: lowest('Merchant'),
    buyBox: buyBox ? landed(buyBox) : null,
    buyBoxEligible: {
      fba: count(s.BuyBoxEligibleOffers, condition, 'Amazon'),
      fbm: count(s.BuyBoxEligibleOffers, condition, 'Merchant'),
    },
    amazon: minOf(offers.filter((o) => o.amazon).map((o) => o.landed)),
    listPrice: money(s.ListPrice),
    cpt: money(s.CompetitivePriceThreshold),
    offers,
  };
}

/** getItemOffers (docs/07 §2). */
export async function fetchOffers(
  env: Env,
  mp: MarketplaceKey,
  asin: string,
  condition: OfferCondition,
): Promise<OffersDTO> {
  const res = await spapiFetch<{ payload?: RawOffersPayload }>(env, mp, {
    path: `/products/pricing/v0/items/${asin}/offers`,
    query: {
      MarketplaceId: MARKETPLACES[mp].id,
      ItemCondition: condition === 'new' ? 'New' : 'Used',
      CustomerType: 'Consumer',
    },
  });
  return normalizeOffers(asin, condition, res.payload ?? {});
}
