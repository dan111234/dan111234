import type { FeesTieredDTO } from '@oa-lens/shared';
import { describe, expect, it } from 'vitest';
import { detectFulfillmentKind, resolveFulfillmentFee } from './blend';
import fixture from './fixtures/spapi-quotes-2026-10-13.json';
import { localFulfillmentFee, periodForDate, priceBand, type FeePeriod } from './fulfillment';
import { inferReferralRule } from './referral';
import { roundCatalogDims, sizeTier } from './sizeTier';

const BEFORE_SURCHARGE = new Date('2026-03-01T12:00:00Z');
const AFTER_SURCHARGE = new Date('2026-10-13T12:00:00Z');

const d = (length: number, width: number, height: number, weight: number) => ({
  length,
  width,
  height,
  weight,
});

describe('priceBand', () => {
  it('splits at $10 and $50', () => {
    expect(priceBand(9.99)).toBe(0);
    expect(priceBand(10)).toBe(1);
    expect(priceBand(50)).toBe(1);
    expect(priceBand(50.01)).toBe(2);
  });
});

describe('periodForDate', () => {
  it('Peak is Oct 15 – Jan 14', () => {
    expect(periodForDate(new Date('2026-10-14T12:00:00Z'))).toBe('nonPeak');
    expect(periodForDate(new Date('2026-10-15T12:00:00Z'))).toBe('peak');
    expect(periodForDate(new Date('2026-12-31T12:00:00Z'))).toBe('peak');
    expect(periodForDate(new Date('2027-01-14T12:00:00Z'))).toBe('peak');
    expect(periodForDate(new Date('2027-01-15T12:00:00Z'))).toBe('nonPeak');
  });
});

// docs/04 §10-2.
describe('golden: local fulfillment table', () => {
  const rows: [ReturnType<typeof d>, number, number, number, number, number][] = [
    // dims, price, Non-Peak, Peak, Non-Peak ×1.035, Peak ×1.035
    [d(10, 6, 3, 1.1), 24.99, 5.42, 5.73, 5.61, 5.93],
    [d(8, 5, 0.5, 0.3), 12.99, 3.45, 3.65, 3.57, 3.78],
    [d(14, 10, 6, 4.2), 39.99, 8.01, 8.55, 8.29, 8.85],
    [d(6, 4, 0.5, 0.2), 8.99, 2.49, 2.68, 2.58, 2.77],
  ];
  it.each(rows)('%o at $%d', (dims, price, np, pk, npS, pkS) => {
    const tier = sizeTier(dims)!;
    const fee = (period: FeePeriod, date: Date) =>
      localFulfillmentFee({ tier, dims, price, period, date });
    expect(fee('nonPeak', BEFORE_SURCHARGE)).toBe(np);
    expect(fee('peak', BEFORE_SURCHARGE)).toBe(pk);
    expect(fee('nonPeak', AFTER_SURCHARGE)).toBe(npS);
    expect(fee('peak', AFTER_SURCHARGE)).toBe(pkS);
  });

  it('matches the RevSeller FBA Fees popup for B0FBP3N9RK at $93.47', () => {
    // 1.80 lb, 12.40 × 7.56 × 4.57 in: Non-Peak 7.57, Peak 8.12.
    const dims = d(12.4016, 7.5591, 4.5669, 1.8078);
    const tier = sizeTier(dims)!;
    expect(tier).toBe('Large Standard-Size');
    const fee = (period: FeePeriod) =>
      localFulfillmentFee({ tier, dims, price: 93.47, period, date: AFTER_SURCHARGE });
    expect(fee('nonPeak')).toBe(7.57);
    expect(fee('peak')).toBe(8.12);
  });

  it('adds the per-step surcharge above the last bracket', () => {
    // Small Bulky: $7.55 + $0.38/lb above the first lb; 10 lb -> 9 steps.
    const dims = d(30, 10, 3, 10);
    expect(
      localFulfillmentFee({
        tier: 'Small Bulky',
        dims,
        price: 30,
        period: 'nonPeak',
        date: BEFORE_SURCHARGE,
      }),
    ).toBe(10.97);
  });
});

/** ASINs whose catalog dims give a different weight bracket than Amazon billed (see README). */
const MEASURED_DIFFERENTLY = ['B0D22SLTFX', 'B0DQFCVFH5', 'B0D2S47TDZ', 'B0G27LRQQD'];

describe('local tables vs SP-API quotes (2026-10-13)', () => {
  for (const item of fixture.items) {
    it(`${item.asin} ${item.productType}`, () => {
      const tiered = item.quotes as unknown as FeesTieredDTO;
      const dims = roundCatalogDims(item.dims);
      const tier = sizeTier(dims)!;
      const { rule } = inferReferralRule({
        9: tiered['9'].ReferralFee,
        13: tiered['13'].ReferralFee,
        350: tiered['350'].ReferralFee,
      });
      const detection = detectFulfillmentKind({
        tier,
        dims,
        tiered,
        rule,
        today: AFTER_SURCHARGE,
      });
      expect(detection.matchesApi).toBe(!MEASURED_DIFFERENTLY.includes(item.asin));
    });
  }
});

describe('resolveFulfillmentFee', () => {
  const dims = d(12.4016, 7.5591, 4.5669, 1.8078);
  const tiered = {
    '9': { ReferralFee: 1.35, FBAFees: 6.45, VariableClosingFee: 0, PerItemFee: 0, Promotion: 0 },
    '13': { ReferralFee: 1.95, FBAFees: 7.3, VariableClosingFee: 0, PerItemFee: 0, Promotion: 0 },
    '350': { ReferralFee: 52.5, FBAFees: 7.6, VariableClosingFee: 0, PerItemFee: 0, Promotion: 0 },
  } satisfies FeesTieredDTO;
  const base = {
    tier: 'Large Standard-Size' as const,
    dims,
    catalogDims: dims,
    price: 93.47,
    kind: 'standard' as const,
    tiered,
    today: AFTER_SURCHARGE,
  };

  it("uses the API quote for today's period with catalog dims, noting a local difference", () => {
    expect(resolveFulfillmentFee({ ...base, period: 'nonPeak' })).toEqual({
      fee: 7.6,
      source: 'api',
      localDiff: 7.57,
    });
    expect(resolveFulfillmentFee({ ...base, period: 'nonPeak', price: 12 })).toEqual({
      fee: 7.3,
      source: 'api',
    });
  });

  it('uses the local table for the other period', () => {
    expect(resolveFulfillmentFee({ ...base, period: 'peak' })).toEqual({
      fee: 8.12,
      source: 'local',
    });
  });

  it('uses the local table when the dims were edited', () => {
    const edited = { ...dims, weight: 5 };
    expect(resolveFulfillmentFee({ ...base, dims: edited, period: 'nonPeak' }).source).toBe(
      'local',
    );
  });

  it('uses the local table without quotes', () => {
    expect(resolveFulfillmentFee({ ...base, tiered: null, period: 'nonPeak' })).toEqual({
      fee: 7.57,
      source: 'local',
    });
  });
});
