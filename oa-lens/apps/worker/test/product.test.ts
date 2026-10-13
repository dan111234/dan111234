import type { ApiResult, BuyCostDTO, OffersDTO, ProductBundleDTO } from '@oa-lens/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { normalizeEligibility, normalizePrep } from '../src/spapi/inbound';
import { resetLwaMemo } from '../src/spapi/lwa';
import { normalizeOffers, type RawOffersPayload } from '../src/spapi/offers';
import { normalizeRestrictions } from '../src/spapi/restrictions';
import catalogFixture from './fixtures/catalog-item.json';
import offersFixture from './fixtures/offers-new.json';
import { AUTH, json, LWA_URL, lwaOk, makeEnv, mockFetch, SPAPI, sqliteD1 } from './helpers';

const app = createApp();

async function call<T>(path: string, env = makeEnv(), init: RequestInit = {}) {
  const res = await app.request(path, { ...init, headers: { ...AUTH, ...init.headers } }, env);
  return { res, body: (await res.json()) as ApiResult<T> };
}

beforeEach(() => resetLwaMemo());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('normalizeOffers (B0FBP3N9RK, 2026-10-13)', () => {
  const dto = normalizeOffers('B0FBP3N9RK', 'new', offersFixture.payload as RawOffersPayload);

  it('summary matches the RevSeller offer line: Low FBA 93.47, Low FBM 133.70, BB 93.47 (5)', () => {
    expect(dto).toMatchObject({
      counts: { fba: 2, fbm: 3, total: 5 },
      lowestFba: 93.47,
      lowestFbm: 133.7,
      buyBox: 93.47,
      buyBoxEligible: { fba: 2, fbm: 3 },
      amazon: 112.79,
      listPrice: 169.95,
      cpt: null,
    });
  });
  it('offers', () => {
    expect(dto.offers).toHaveLength(5);
    expect(dto.offers[0]).toMatchObject({
      fba: true,
      amazon: false,
      landed: 93.47,
      buyBoxWinner: true,
      feedbackCount: 468268,
      feedbackPct: 100,
    });
    expect(dto.offers[1]).toMatchObject({ amazon: true, landed: 112.79 });
  });
  it('used ignores new prices', () => {
    const used = normalizeOffers('B0FBP3N9RK', 'used', offersFixture.payload as RawOffersPayload);
    expect(used).toMatchObject({
      lowestFba: null,
      lowestFbm: null,
      buyBox: null,
      counts: { total: 0 },
    });
  });
});

describe('normalizeRestrictions', () => {
  it('empty -> sell', () => {
    expect(normalizeRestrictions('new_new', { restrictions: [] })).toMatchObject({
      status: 'sell',
      reasons: [],
      transparency: false,
    });
  });
  it('approval with link', () => {
    const dto = normalizeRestrictions('new_new', {
      restrictions: [
        {
          conditionType: 'new_new',
          reasons: [
            {
              reasonCode: 'APPROVAL_REQUIRED',
              message: 'You need approval to list in this brand.',
              links: [
                {
                  resource: 'https://sellercentral.amazon.com/hz/approvalrequest',
                  title: 'Request approval',
                },
              ],
            },
          ],
        },
      ],
    });
    expect(dto.status).toBe('approval');
    expect(dto.reasons[0]!.links[0]!.url).toContain('approvalrequest');
  });
  it('not eligible wins; transparency detected', () => {
    const dto = normalizeRestrictions('new_new', {
      restrictions: [
        {
          reasons: [
            { reasonCode: 'APPROVAL_REQUIRED', message: 'approval' },
            { reasonCode: 'NOT_ELIGIBLE', message: 'This ASIN requires Transparency codes.' },
          ],
        },
      ],
    });
    expect(dto).toMatchObject({ status: 'restricted', transparency: true });
    expect(
      normalizeRestrictions('new_new', {
        restrictions: [{ reasons: [{ reasonCode: 'ASIN_NOT_FOUND' }] }],
      }).status,
    ).toBe('unknown');
  });
});

describe('inbound normalizers', () => {
  it('eligibility', () => {
    expect(normalizeEligibility({ payload: { isEligibleForProgram: true } })).toEqual({
      eligible: true,
      reasons: [],
    });
    expect(
      normalizeEligibility({
        payload: { isEligibleForProgram: false, ineligibilityReasonList: ['FBA_INB_0004'] },
      }),
    ).toEqual({ eligible: false, reasons: ['FBA_INB_0004'] });
  });
  it('prep', () => {
    expect(
      normalizePrep('B0X', {
        payload: {
          ASINPrepInstructionsList: [
            { ASIN: 'B0X', PrepInstructionList: ['Polybagging', 'Labeling'] },
          ],
        },
      }),
    ).toEqual({ instructions: ['Polybagging', 'Labeling'] });
    expect(
      normalizePrep('B0X', {
        payload: { ASINPrepInstructionsList: [{ ASIN: 'B0X', PrepInstructionList: ['NoPrep'] }] },
      }),
    ).toEqual({ instructions: [] });
  });
});

describe('GET /v1/:mp/product/:asin', () => {
  const q = (price: number, referral: number, fba: number) => ({
    Status: 'Success',
    FeesEstimateIdentifier: { SellerInputIdentifier: `B0TESTCHLD-${price}` },
    FeesEstimate: {
      FeeDetailList: [
        { FeeType: 'ReferralFee', FinalFee: { Amount: referral } },
        { FeeType: 'FBAFees', FinalFee: { Amount: fba } },
      ],
    },
  });

  it('returns every part, reporting failures per part', async () => {
    const env = makeEnv({ DB: await sqliteD1() });
    const f = mockFetch({
      [LWA_URL]: lwaOk,
      [`${SPAPI}/catalog/`]: () => json(catalogFixture),
      [`${SPAPI}/products/pricing/v0/items/`]: () => json(offersFixture),
      [`${SPAPI}/products/fees/v0/feesEstimate`]: () =>
        json([q(9, 1.35, 3), q(13, 1.95, 4), q(350, 52.5, 5)]),
      [`${SPAPI}/listings/2021-08-01/restrictions`]: () => json({ restrictions: [] }),
      [`${SPAPI}/fba/inbound/v1/eligibility`]: () =>
        json(
          {
            errors: [{ code: 'Unauthorized', message: 'Access to requested resource is denied.' }],
          },
          403,
        ),
    });
    const { res, body } = await call<ProductBundleDTO>('/v1/us/product/B0TESTCHLD', env);
    expect(res.status).toBe(200);
    if (!body.ok) throw new Error('expected ok');
    const d = body.data;
    expect(d.catalog).toMatchObject({ ok: true, data: { asin: 'B0TESTCHLD' } });
    expect(d.offers).toMatchObject({ ok: true, data: { buyBox: 93.47 } });
    expect(d.feesTiered).toMatchObject({ ok: true, data: { '350': { FBAFees: 5 } } });
    expect(d.restrictions).toMatchObject({
      ok: true,
      data: [{ conditionType: 'new_new', status: 'sell' }],
    });
    expect(d.eligibility).toMatchObject({ ok: false, error: { code: 'AUTH' } });
    expect(d.buyCost).toEqual({ ok: true, data: null });
    // 403 refreshes the token once before giving up.
    expect(f.count(`${SPAPI}/fba/inbound/v1/eligibility`)).toBe(2);
  });

  it('used checks the four used condition types', async () => {
    const env = makeEnv({ DB: await sqliteD1() });
    const f = mockFetch({
      [LWA_URL]: lwaOk,
      [`${SPAPI}/catalog/`]: () => json(catalogFixture),
      [`${SPAPI}/products/pricing/v0/items/`]: () => json(offersFixture),
      [`${SPAPI}/products/fees/v0/feesEstimate`]: () => json([]),
      [`${SPAPI}/listings/2021-08-01/restrictions`]: () => json({ restrictions: [] }),
      [`${SPAPI}/fba/inbound/v1/eligibility`]: () =>
        json({ payload: { isEligibleForProgram: true } }),
    });
    const { body } = await call<ProductBundleDTO>('/v1/us/product/B0TESTCHLD?condition=used', env);
    if (!body.ok) throw new Error('expected ok');
    expect(
      body.data.restrictions.ok && body.data.restrictions.data.map((r) => r.conditionType),
    ).toEqual(['used_like_new', 'used_very_good', 'used_good', 'used_acceptable']);
    expect(body.data.feesTiered.ok).toBe(false);
    const offersReq = f.calls.find((r) => r.url.includes('/offers'))!;
    expect(new URL(offersReq.url).searchParams.get('ItemCondition')).toBe('Used');
  });

  it('rejects a bad condition', async () => {
    const { res } = await call('/v1/us/product/B0TESTCHLD?condition=refurb');
    expect(res.status).toBe(400);
  });
});

describe('single SP-API routes', () => {
  it('offers, restrictions, prep', async () => {
    const env = makeEnv();
    mockFetch({
      [LWA_URL]: lwaOk,
      [`${SPAPI}/products/pricing/v0/items/`]: () => json(offersFixture),
      [`${SPAPI}/listings/2021-08-01/restrictions`]: () => json({ restrictions: [] }),
      [`${SPAPI}/fba/inbound/v0/prepInstructions`]: () =>
        json({
          payload: {
            ASINPrepInstructionsList: [{ ASIN: 'B0TESTCHLD', PrepInstructionList: ['Labeling'] }],
          },
        }),
    });
    const offers = await call<OffersDTO>('/v1/us/spapi/offers/B0TESTCHLD', env);
    expect(offers.body).toMatchObject({ ok: true, data: { lowestFba: 93.47 } });
    const r = await call('/v1/us/spapi/restrictions/B0TESTCHLD?condition=used_good', env);
    expect(r.body).toMatchObject({
      ok: true,
      data: { conditionType: 'used_good', status: 'sell' },
    });
    const bad = await call('/v1/us/spapi/restrictions/B0TESTCHLD?condition=refurb', env);
    expect(bad.res.status).toBe(400);
    const prep = await call('/v1/us/spapi/prep/B0TESTCHLD', env);
    expect(prep.body).toMatchObject({ ok: true, data: { instructions: ['Labeling'] } });
  });
});

describe('/v1/userdata/buycost', () => {
  it('saves, reads per condition and deletes', async () => {
    const env = makeEnv({ DB: await sqliteD1() });
    const put = await call<BuyCostDTO>('/v1/userdata/buycost/b0testchld', env, {
      method: 'PUT',
      body: JSON.stringify({ fba: 12.5, fbm: '11', condition: 'new' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(put.body).toMatchObject({ ok: true, data: { asin: 'B0TESTCHLD', fba: 12.5, fbm: 11 } });

    const got = await call<BuyCostDTO>('/v1/userdata/buycost/B0TESTCHLD', env);
    expect(got.body).toMatchObject({ ok: true, data: { fba: 12.5, fbm: 11, condition: 'new' } });
    const used = await call('/v1/userdata/buycost/B0TESTCHLD?condition=used', env);
    expect(used.body).toMatchObject({ ok: true, data: null });

    await call('/v1/userdata/buycost/B0TESTCHLD', env, { method: 'DELETE' });
    const gone = await call('/v1/userdata/buycost/B0TESTCHLD', env);
    expect(gone.body).toMatchObject({ ok: true, data: null });
  });

  it('rejects negative costs', async () => {
    const env = makeEnv({ DB: await sqliteD1() });
    const { res } = await call('/v1/userdata/buycost/B0TESTCHLD', env, {
      method: 'PUT',
      body: JSON.stringify({ fba: -1 }),
    });
    expect(res.status).toBe(400);
  });
});
