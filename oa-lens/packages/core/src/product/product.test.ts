import type { FeesTieredDTO } from '@oa-lens/shared';
import { describe, expect, it } from 'vitest';
import { referralFeeTable } from '../../data';
import { DEFAULT_PREP_CHIPS } from '../fees/extras';
import { calculateProduct, referralRateLabel, type ProductInput } from './index';

const TODAY = new Date('2026-10-13T12:00:00Z');
const q = (ReferralFee: number, FBAFees: number) => ({
  ReferralFee,
  FBAFees,
  VariableClosingFee: 0,
  PerItemFee: 0,
  Promotion: 0,
});

function input(
  overrides: Partial<ProductInput> & Pick<ProductInput, 'dims' | 'tiered'>,
): ProductInput {
  return {
    catalogDims: overrides.dims,
    media: false,
    category: null,
    productType: null,
    hazmat: false,
    fba: { price: null, buyCost: 0 },
    fbm: { price: null, buyCost: 0 },
    fbaOptions: {
      storage: { enabled: true, months: 1 },
      placement: {
        standard: { enabled: true, region: 'west', locations: 5 },
        bulky: { enabled: true, region: 'west', locations: 5 },
      },
      lowInventory: { enabled: true, period: 'select' },
      prep: { enabled: true, chips: DEFAULT_PREP_CHIPS, on: [] },
      other: { enabled: true, amount: 0 },
      shipToFba: {
        enabled: true,
        ratePerLb: 0,
        hazmatRatePerLb: 0,
        useDimWeight: false,
        override: null,
      },
    },
    fbmOptions: {
      other: { enabled: true, amount: 0 },
      ship: {
        enabled: true,
        method: { method: 'usps', service: 'ground_advantage', zone: 5 },
        override: null,
      },
    },
    cost: {
      discount: 0,
      taxRate: 0,
      taxEnabled: true,
      roiMethod: 'buyCostOnly',
      maxCost: {
        fba: { net: 3, roi: 0, margin: 0 },
        fbm: { net: 3, roi: 0, margin: 0 },
      },
    },
    usePeak: true,
    today: TODAY,
    ...overrides,
  };
}

// Screenshots 01 and the FBA Fees popup: ECCO Soft 11 at $93.47, Peak rate ticked.
describe('B0FBP3N9RK (RevSeller screenshots 01, FBA Fees popup)', () => {
  const tiered: FeesTieredDTO = { '9': q(1.35, 6.45), '13': q(1.95, 7.3), '350': q(52.5, 7.57) };
  const r = calculateProduct(
    input({
      dims: { length: 12.4, width: 7.56, height: 4.57, weight: 1.8 },
      tiered,
      fba: { price: 93.47, buyCost: 0 },
      fbm: { price: 93.47, buyCost: 0 },
    }),
  );

  it('product box', () => {
    expect(r.tierShort).toBe('Lg Standard');
    expect(r.dimWeight).toBeCloseTo(3.08, 2);
    expect(referralRateLabel(r.referralRule, 93.47)).toBe('15%');
  });
  it('FBA Fees popup, Non-Peak and Peak', () => {
    expect(r.fba.nonPeak).toMatchObject({
      referral: 14.02,
      fulfillment: 7.57,
      closing: 0,
      storage: 0.19,
      placement: 0,
      lowInventory: 0,
      expenses: 21.78,
      net: 71.69,
    });
    expect(r.fba.peak).toMatchObject({
      fulfillment: 8.12,
      storage: 0.6,
      expenses: 22.74,
      net: 70.73,
    });
    expect(r.fba.nonPeak!.storageHint).toBe('Jan-Sep $0.19/mo Oct-Dec $0.60/mo');
  });
  it('main calculator with Peak rate', () => {
    expect(r.fba.main!.net).toBe(70.73);
    expect(r.fbm.column).toMatchObject({ shipToBuyer: 8.87, net: 70.58 });
    expect(r.fba.breakeven).toBe(9.96);
    expect(r.fbm.breakeven).toBe(10.44);
    expect(r.fba.maxCost).toEqual({ value: 67.73, rule: 'net' });
    expect(r.fbm.maxCost).toEqual({ value: 67.58, rule: 'net' });
  });
});

// Screenshots 04–06 and 07b: Nuwave mug at $199.99 (billed $0.11 over the local table).
describe('B0HC235K4R (RevSeller screenshots 04, 05, 06, 07b)', () => {
  const tiered: FeesTieredDTO = { '9': q(1.35, 6.89), '13': q(1.95, 7.74), '350': q(52.5, 8.01) };
  const r = calculateProduct(
    input({
      dims: { length: 10.67, width: 9.45, height: 5.67, weight: 3.85 },
      tiered,
      fba: { price: 199.99, buyCost: 0 },
      fbm: { price: 199.99, buyCost: 0 },
    }),
  );

  it('FBA Fees popup', () => {
    expect(r.fba.nonPeak).toMatchObject({
      referral: 30,
      fulfillment: 8.01,
      storage: 0.26,
      expenses: 38.27,
      net: 161.72,
    });
    expect(r.fba.peak).toMatchObject({
      fulfillment: 8.57,
      storage: 0.79,
      expenses: 39.36,
      net: 160.63,
    });
  });
  it('FBM Fees popup', () => {
    expect(r.fbm.column).toMatchObject({
      referral: 30,
      shipToBuyer: 10.33,
      expenses: 40.33,
      net: 159.66,
    });
  });
  it('breakevens (screenshot 07b)', () => {
    expect(r.fbm.breakeven).toBe(12.16);
    expect(r.fba.breakeven).toBe(10.7);
  });
});

describe('calculateProduct edge cases', () => {
  const dims = { length: 10, width: 6, height: 3, weight: 1.1 };

  it('without dims there is no FBA column and USPS FBM needs dims', () => {
    const r = calculateProduct(
      input({
        dims: null,
        tiered: null,
        fba: { price: 20, buyCost: 5 },
        fbm: { price: 20, buyCost: 5 },
      }),
    );
    expect(r.fba.main).toBeNull();
    expect(r.fbm.column).toBeNull();
    expect(r.tierShort).toBe('Unknown');
  });

  it('without quotes uses the local table and the category rule', () => {
    const r = calculateProduct(
      input({
        dims,
        tiered: null,
        category: 'Beauty',
        usePeak: false,
        fba: { price: 24.99, buyCost: 8 },
        fbm: { price: 24.99, buyCost: 8 },
      }),
    );
    expect(r.referralRule).toEqual(referralFeeTable['Beauty']);
    expect(r.fba.main).toMatchObject({ fulfillment: 5.61, fulfillmentSource: 'local' });
  });

  it('applies options: storage off, placement 1 location, prep chips, ship to FBA, tax, discount', () => {
    const base = input({
      dims,
      tiered: null,
      fba: { price: 24.99, buyCost: 10 },
      fbm: { price: 24.99, buyCost: 10 },
    });
    const r = calculateProduct({
      ...base,
      usePeak: false,
      fbaOptions: {
        ...base.fbaOptions,
        storage: { enabled: false, months: 1 },
        placement: {
          ...base.fbaOptions.placement,
          standard: { enabled: true, region: 'west', locations: 1 },
        },
        prep: { ...base.fbaOptions.prep, on: ['bag'] },
        shipToFba: { ...base.fbaOptions.shipToFba, ratePerLb: 0.5 },
        lowInventory: { enabled: true, period: '0-14' },
      },
      cost: { ...base.cost, discount: 0.1, taxRate: 0.07 },
    });
    expect(r.fba.main).toMatchObject({
      storage: 0,
      placement: 0.44,
      prep: 0.7,
      shipToFba: 0.55,
      lowInventory: 0.97,
      buyCost: 9,
      tax: 0.63,
    });
  });

  it('hazmat from eligibility uses the hazmat table and rate', () => {
    const base = input({ dims, tiered: null, fba: { price: 24.99, buyCost: 0 } });
    const r = calculateProduct({
      ...base,
      hazmat: true,
      usePeak: false,
      fbaOptions: {
        ...base.fbaOptions,
        shipToFba: { ...base.fbaOptions.shipToFba, hazmatRatePerLb: 1 },
      },
    });
    expect(r.kind).toBe('hazmat');
    expect(r.fba.main!.shipToFba).toBe(1.1);
  });

  it('FBM flat shipping works without dims; overrides win', () => {
    const base = input({ dims: null, tiered: null, fbm: { price: 30, buyCost: 0 } });
    const flat = calculateProduct({
      ...base,
      fbmOptions: {
        ...base.fbmOptions,
        ship: { enabled: true, method: { method: 'flat', rate: 5 }, override: null },
      },
    });
    expect(flat.fbm.column!.shipToBuyer).toBe(5);
    const typed = calculateProduct({
      ...base,
      fbmOptions: { ...base.fbmOptions, ship: { ...base.fbmOptions.ship, override: 7 } },
    });
    expect(typed.fbm.column!.shipToBuyer).toBe(7);
  });
});

describe('referralRateLabel', () => {
  it('shows the rate in effect', () => {
    expect(referralRateLabel(referralFeeTable['Beauty']!, 9)).toBe('8%');
    expect(referralRateLabel(referralFeeTable['Beauty']!, 20)).toBe('15%');
    expect(referralRateLabel(referralFeeTable['Beauty']!, null)).toBe('8%/15%');
    expect(referralRateLabel({ kind: 'fixed', fixed: 1 }, 5)).toBe('$1.00');
  });
});
