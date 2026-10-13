import {
  MARKETPLACES,
  type FeeQuote,
  type FeesTieredDTO,
  type MarketplaceKey,
} from '@oa-lens/shared';
import type { Env } from '../env';
import { ApiError } from '../lib/errors';
import { spapiFetch } from './client';

/** One quote per fulfillment price band: < $10, $10–$50, > $50 (docs/04 §2-4). */
export const TIERED_PRICES = [9, 13, 350] as const;

interface Money {
  Amount?: number;
}
interface FeeDetail {
  FeeType?: string;
  FeeAmount?: Money;
  FinalFee?: Money;
  FeePromotion?: Money;
}
export interface RawFeesEstimateResult {
  Status?: string;
  FeesEstimateIdentifier?: {
    SellerInputIdentifier?: string;
    PriceToEstimateFees?: { ListingPrice?: Money };
  };
  FeesEstimate?: { FeeDetailList?: FeeDetail[] };
  Error?: { Code?: string; Message?: string };
}

const amount = (m: Money | undefined) => m?.Amount ?? 0;

/** FinalFee per fee type (promotions already applied). */
export function normalizeFeeQuote(result: RawFeesEstimateResult): FeeQuote {
  const quote: FeeQuote = {
    ReferralFee: 0,
    FBAFees: 0,
    VariableClosingFee: 0,
    PerItemFee: 0,
    Promotion: 0,
  };
  for (const fee of result.FeesEstimate?.FeeDetailList ?? []) {
    const final = fee.FinalFee ?? fee.FeeAmount;
    switch (fee.FeeType) {
      case 'ReferralFee':
      case 'FBAFees':
      case 'VariableClosingFee':
      case 'PerItemFee':
        quote[fee.FeeType] = amount(final);
        quote.Promotion += amount(fee.FeePromotion);
        break;
    }
  }
  quote.Promotion = Math.round(quote.Promotion * 100) / 100;
  return quote;
}

/** getMyFeesEstimates request body for FBA quotes of one ASIN at the given prices. */
export function tieredRequestBody(mp: MarketplaceKey, asin: string, prices: readonly number[]) {
  return prices.map((price) => ({
    FeesEstimateRequest: {
      MarketplaceId: MARKETPLACES[mp].id,
      IsAmazonFulfilled: true,
      PriceToEstimateFees: { ListingPrice: { CurrencyCode: 'USD', Amount: price } },
      Identifier: `${asin}-${price}`,
    },
    IdType: 'ASIN',
    IdValue: asin,
  }));
}

export function normalizeTieredFees(asin: string, results: RawFeesEstimateResult[]): FeesTieredDTO {
  const out: Partial<Record<string, FeeQuote>> = {};
  for (const price of TIERED_PRICES) {
    const result = results.find(
      (r) => r.FeesEstimateIdentifier?.SellerInputIdentifier === `${asin}-${price}`,
    );
    if (!result || result.Status !== 'Success') {
      const message = result?.Error?.Message ?? 'no estimate returned';
      const code = result?.Error?.Code === 'InvalidParameterValue' ? 'NOT_FOUND' : 'UPSTREAM';
      throw new ApiError(code, `Fees estimate for ${asin} at $${price}: ${message}`);
    }
    out[String(price)] = normalizeFeeQuote(result);
  }
  return out as unknown as FeesTieredDTO;
}

/** FBA fee quotes at $9, $13 and $350 in one batch call (docs/07 §2 fees/tiered). */
export async function fetchTieredFees(
  env: Env,
  mp: MarketplaceKey,
  asin: string,
): Promise<FeesTieredDTO> {
  const results = await spapiFetch<RawFeesEstimateResult[]>(env, mp, {
    method: 'POST',
    path: '/products/fees/v0/feesEstimate',
    body: tieredRequestBody(mp, asin, TIERED_PRICES),
  });
  return normalizeTieredFees(asin, Array.isArray(results) ? results : []);
}
