import type { ApiResult, FeesTieredDTO } from '@oa-lens/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { normalizeFeeQuote, type RawFeesEstimateResult } from '../src/spapi/fees';
import { resetLwaMemo } from '../src/spapi/lwa';
import { AUTH, json, LWA_URL, lwaOk, makeEnv, mockFetch, SPAPI } from './helpers';

const app = createApp();
const FEES_URL = `${SPAPI}/products/fees/v0/feesEstimate`;

const money = (Amount: number) => ({ CurrencyCode: 'USD', Amount });
const detail = (FeeType: string, amount: number, promo = 0) => ({
  FeeType,
  FeeAmount: money(amount),
  FinalFee: money(amount - promo),
  FeePromotion: money(promo),
});

/** Shape of a real getMyFeesEstimates result (B0FBP3N9RK, 2026-10-13). */
function estimate(asin: string, price: number, referral: number, fba: number, promo = 0) {
  return {
    Status: 'Success',
    FeesEstimateIdentifier: {
      MarketplaceId: 'ATVPDKIKX0DER',
      IdType: 'ASIN',
      SellerInputIdentifier: `${asin}-${price}`,
      IsAmazonFulfilled: true,
      IdValue: asin,
      PriceToEstimateFees: { ListingPrice: money(price) },
    },
    FeesEstimate: {
      TimeOfFeesEstimation: '2026-10-13T07:07:22.000Z',
      TotalFeesEstimate: money(referral + fba - promo),
      FeeDetailList: [
        detail('ReferralFee', referral),
        detail('VariableClosingFee', 0),
        detail('PerItemFee', 0),
        {
          ...detail('FBAFees', fba, promo),
          IncludedFeeDetailList: [detail('FBAPickAndPack', fba, promo)],
        },
      ],
    },
  };
}

async function call<T>(path: string, env = makeEnv()) {
  const res = await app.request(path, { headers: AUTH }, env);
  return { res, body: (await res.json()) as ApiResult<T> };
}

beforeEach(() => resetLwaMemo());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('normalizeFeeQuote', () => {
  it('reads FinalFee and sums promotions', () => {
    const raw = estimate('B0FBP3N9RK', 13, 1.95, 7.3, 0.5) as RawFeesEstimateResult;
    expect(normalizeFeeQuote(raw)).toEqual({
      ReferralFee: 1.95,
      FBAFees: 6.8,
      VariableClosingFee: 0,
      PerItemFee: 0,
      Promotion: 0.5,
    });
  });
});

describe('GET /v1/:mp/spapi/fees/:asin/tiered', () => {
  const ok = () =>
    json([
      estimate('B0FBP3N9RK', 9, 1.35, 6.45),
      estimate('B0FBP3N9RK', 13, 1.95, 7.3),
      estimate('B0FBP3N9RK', 350, 52.5, 7.57),
    ]);

  it('asks for FBA quotes at $9, $13 and $350 in one call and caches the result', async () => {
    const env = makeEnv();
    const f = mockFetch({ [LWA_URL]: lwaOk, [FEES_URL]: ok });
    const { res, body } = await call<FeesTieredDTO>('/v1/us/spapi/fees/b0fbp3n9rk/tiered', env);
    expect(res.status).toBe(200);
    if (!body.ok) throw new Error('expected ok');
    expect(body.data['9']).toMatchObject({ ReferralFee: 1.35, FBAFees: 6.45 });
    expect(body.data['13']).toMatchObject({ ReferralFee: 1.95, FBAFees: 7.3 });
    expect(body.data['350']).toMatchObject({ ReferralFee: 52.5, FBAFees: 7.57 });

    const req = f.calls.find((r) => r.url === FEES_URL)!;
    expect(req.method).toBe('POST');
    const sent = (await req.json()) as {
      IdValue: string;
      FeesEstimateRequest: {
        IsAmazonFulfilled: boolean;
        PriceToEstimateFees: { ListingPrice: { Amount: number } };
      };
    }[];
    expect(sent.map((s) => s.FeesEstimateRequest.PriceToEstimateFees.ListingPrice.Amount)).toEqual([
      9, 13, 350,
    ]);
    expect(
      sent.every((s) => s.IdValue === 'B0FBP3N9RK' && s.FeesEstimateRequest.IsAmazonFulfilled),
    ).toBe(true);

    const again = await call<FeesTieredDTO>('/v1/us/spapi/fees/B0FBP3N9RK/tiered', env);
    expect(again.body).toMatchObject({ ok: true, cached: true });
    expect(f.count(FEES_URL)).toBe(1);
  });

  it('fails when one of the estimates failed', async () => {
    mockFetch({
      [LWA_URL]: lwaOk,
      [FEES_URL]: () =>
        json([
          estimate('B0FBP3N9RK', 9, 1.35, 6.45),
          {
            Status: 'ClientError',
            FeesEstimateIdentifier: { SellerInputIdentifier: 'B0FBP3N9RK-13' },
            Error: { Code: 'InvalidParameterValue', Message: 'ASIN not found' },
          },
          estimate('B0FBP3N9RK', 350, 52.5, 7.57),
        ]),
    });
    const { res, body } = await call('/v1/us/spapi/fees/B0FBP3N9RK/tiered');
    expect(res.status).toBe(404);
    expect(body).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('rejects a bad ASIN', async () => {
    const { res } = await call('/v1/us/spapi/fees/nope/tiered');
    expect(res.status).toBe(400);
  });
});
