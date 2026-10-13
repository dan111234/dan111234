import { describe, expect, it } from 'vitest';
import {
  cubicFeet,
  DEFAULT_PREP_CHIPS,
  lowInventoryFee,
  placementFee,
  placementOptions,
  prepChipsFee,
  shipToFbaFee,
  storageFee,
} from './extras';
import { mfnShippingFee, uspsPrice, uspsWeight } from './mfnShipping';
import { roundCatalogDims } from './sizeTier';

const d = (length: number, width: number, height: number, weight: number) => ({
  length,
  width,
  height,
  weight,
});

describe('storageFee', () => {
  // docs/04 §10-2 storage columns.
  it.each([
    [d(10, 6, 3, 1.1), 'Large Standard-Size', 0.08, 0.25],
    [d(8, 5, 0.5, 0.3), 'Small Standard-Size', 0.01, 0.03],
    [d(14, 10, 6, 4.2), 'Large Standard-Size', 0.38, 1.17],
    [d(6, 4, 0.5, 0.2), 'Small Standard-Size', 0.01, 0.02],
  ] as const)('golden %o', (dims, tier, jan, oct) => {
    expect(storageFee({ tier, dims, months: 1, period: 'nonPeak' }).total).toBe(jan);
    expect(storageFee({ tier, dims, months: 1, period: 'peak' }).total).toBe(oct);
  });

  it('matches the RevSeller popup for B0FBP3N9RK (catalog dims rounded for display)', () => {
    const dims = roundCatalogDims(d(12.4016, 7.5591, 4.5669, 1.8078));
    expect(dims).toEqual(d(12.4, 7.56, 4.57, 1.8));
    const fee = (period: 'nonPeak' | 'peak') =>
      storageFee({
        tier: 'Large Standard-Size',
        dims,
        months: 1,
        period,
      });
    expect(fee('nonPeak').total).toBe(0.19);
    expect(fee('peak').total).toBe(0.6);
    expect(fee('nonPeak').hint).toBe('Jan-Sep $0.19/mo Oct-Dec $0.60/mo');
  });

  it('sums months, wrapping from December to January', () => {
    const dims = d(12, 12, 12, 1); // 1 cu ft: $0.78 Jan–Sep, $2.40 Oct–Dec
    expect(cubicFeet(dims)).toBe(1);
    expect(
      storageFee({ tier: 'Large Standard-Size', dims, months: 3, period: 'nonPeak' }).total,
    ).toBe(2.34);
    expect(storageFee({ tier: 'Large Standard-Size', dims, months: 4, period: 'peak' }).total).toBe(
      7.98,
    );
    expect(
      storageFee({ tier: 'Large Standard-Size', dims, months: 1, period: 'nonPeak', hazmat: true })
        .total,
    ).toBe(0.99);
  });
});

describe('placementFee', () => {
  const lg = d(10, 6, 3, 1.1);
  it('options per tier', () => {
    expect(placementOptions('Large Standard-Size')).toEqual([1, 5]);
    expect(placementOptions('Small Bulky')).toEqual([1, 2, 3, 5]);
    expect(placementOptions('Extra Large 0 to 50lb')).toBeNull();
  });
  it('Standard pays only with one location', () => {
    expect(
      placementFee({ tier: 'Large Standard-Size', dims: lg, region: 'west', locations: 1 }),
    ).toBe(0.44);
    expect(
      placementFee({ tier: 'Large Standard-Size', dims: lg, region: 'east', locations: 1 }),
    ).toBe(0.26);
    expect(
      placementFee({ tier: 'Large Standard-Size', dims: lg, region: 'west', locations: 5 }),
    ).toBe(0);
  });
  it('Small Standard uses the unit weight', () => {
    expect(
      placementFee({
        tier: 'Small Standard-Size',
        dims: d(8, 5, 0.5, 0.3),
        region: 'central',
        locations: 1,
      }),
    ).toBe(0.22);
  });
  it('Bulky by location count', () => {
    const dims = d(21.5, 21.5, 3.5, 6.35); // dim weight 11.64 lb -> "12" bracket
    expect(placementFee({ tier: 'Small Bulky', dims, region: 'west', locations: 1 })).toBe(2.02);
    expect(placementFee({ tier: 'Small Bulky', dims, region: 'west', locations: 3 })).toBe(0.65);
  });
  it('Extra Large is N/A', () => {
    expect(
      placementFee({
        tier: 'Extra Large 0 to 50lb',
        dims: d(68, 7, 3, 17),
        region: 'west',
        locations: 1,
      }),
    ).toBeNull();
  });
});

describe('lowInventoryFee', () => {
  it('Large Standard splits at 3 lb outbound', () => {
    expect(
      lowInventoryFee({ tier: 'Large Standard-Size', dims: d(10, 6, 3, 1.1), period: '0-14' }),
    ).toBe(0.97);
    expect(
      lowInventoryFee({ tier: 'Large Standard-Size', dims: d(14, 10, 6, 4.2), period: '0-14' }),
    ).toBe(1.11);
  });
  it('select and 28+ are free; Extra Large and grocery are N/A', () => {
    const dims = d(10, 6, 3, 1.1);
    expect(lowInventoryFee({ tier: 'Large Standard-Size', dims, period: 'select' })).toBe(0);
    expect(lowInventoryFee({ tier: 'Large Standard-Size', dims, period: '28+' })).toBe(0);
    expect(
      lowInventoryFee({ tier: 'Large Standard-Size', dims, period: '0-14', grocery: true }),
    ).toBeNull();
    expect(lowInventoryFee({ tier: 'Extra Large 0 to 50lb', dims, period: '0-14' })).toBeNull();
    expect(lowInventoryFee({ tier: 'Small Bulky', dims, period: '21-28' })).toBe(0.51);
  });
});

describe('shipToFbaFee / prep chips', () => {
  it('weight × rate, optionally dimensional', () => {
    const dims = d(10, 6, 3, 1.1);
    expect(shipToFbaFee({ tier: 'Large Standard-Size', dims, ratePerLb: 0.5 })).toBe(0.55);
    expect(
      shipToFbaFee({ tier: 'Large Standard-Size', dims, ratePerLb: 0.5, useDimWeight: true }),
    ).toBe(0.65);
  });
  it('sums enabled chips', () => {
    expect(prepChipsFee(DEFAULT_PREP_CHIPS, ['bag', 'label'])).toBe(1.25);
    expect(prepChipsFee(DEFAULT_PREP_CHIPS, [])).toBe(0);
  });
});

describe('FBM shipping', () => {
  it('USPS weight adds MFN packaging and uses /166 dimensional weight over 1 cu ft', () => {
    expect(uspsWeight(d(10, 6, 3, 1.1), 'Large Standard-Size')).toBeCloseTo(1.35, 6);
    expect(uspsWeight(d(20, 12, 10, 2), 'Large Standard-Size')).toBeCloseTo(2400 / 166, 6);
  });
  it('USPS brackets: ounces under 1 lb, whole pounds above, capped at 70', () => {
    expect(uspsPrice('ground_advantage', 5, 0.4)).toBe(uspsPrice('ground_advantage', 5, 0.5));
    expect(uspsPrice('ground_advantage', 5, 1.35)).toBe(uspsPrice('ground_advantage', 5, 2));
    expect(uspsPrice('priority', 4, 80)).toBe(uspsPrice('priority', 4, 70));
    expect(uspsPrice('media_mail', 8, 1)).toBe(4.47);
  });
  it('methods', () => {
    const dims = d(10, 6, 3, 1.1);
    const tier = 'Large Standard-Size' as const;
    expect(mfnShippingFee({ dims, tier, method: { method: 'flat', rate: 5 } })).toBe(5);
    expect(mfnShippingFee({ dims, tier, method: { method: 'pound', pricePerLb: 2 } })).toBe(2.2);
    const usps = { method: 'usps', service: 'ground_advantage', zone: 5 } as const;
    expect(mfnShippingFee({ dims, tier, method: usps })).toBe(uspsPrice('ground_advantage', 5, 2));
    expect(mfnShippingFee({ dims, tier, method: usps, media: true })).toBe(
      uspsPrice('media_mail', 5, 2),
    );
    expect(
      mfnShippingFee({ dims, tier, method: { ...usps, priorityForHazmat: true }, hazmat: true }),
    ).toBe(uspsPrice('priority', 5, 2));
  });
});
