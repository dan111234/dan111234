import { describe, expect, it } from 'vitest';
import { referralFeeTable, type ReferralRule } from '../../data';
import { closingFee, inferReferralRule, invertReferral, referralFee } from './referral';

const beauty = referralFeeTable['Beauty']!;
const clothing = referralFeeTable['Clothing & Accessories']!;
const everything = referralFeeTable['Everything Else']!;
const jewelry = referralFeeTable['Jewelry']!;

// docs/04 §10-3.
describe('golden: referral rules', () => {
  it.each([
    [beauty, 10, 0.8],
    [beauty, 10.01, 1.5],
    [clothing, 14.99, 0.75],
    [clothing, 19.99, 2.0],
    [everything, 1.5, 0.3],
    [everything, 24.99, 3.75],
  ] as [ReferralRule, number, number][])('%o at $%d', (rule, price, fee) => {
    expect(referralFee(rule, price)).toBe(fee);
  });
});

describe('referralFee', () => {
  it('tiers portion rules slice by slice', () => {
    // Jewelry: 20% up to $250, 5% above.
    expect(referralFee(jewelry, 300)).toBe(52.5);
  });
  it('fixed fee', () => {
    expect(referralFee({ kind: 'fixed', fixed: 1 }, 50)).toBe(1);
  });
  it('honours rangeFromInclusive', () => {
    const rule: ReferralRule = {
      kind: 'range',
      range: [
        { from: 0, to: 10, percent: 8 },
        { from: 10, to: Infinity, percent: 15 },
      ],
      portion: false,
      fromInclusive: true,
      min: 0,
    };
    expect(referralFee(rule, 10)).toBe(1.5);
    expect(referralFee(rule, 9.99)).toBe(0.8);
  });
});

describe('inferReferralRule', () => {
  it('flat percent when $9 and $350 agree', () => {
    expect(inferReferralRule({ 9: 1.35, 13: 1.95, 350: 52.5 })).toEqual({
      rule: { kind: 'percent', percent: 15, min: 0.3 },
      source: 'percent',
    });
  });
  it('clothing from the estimate table', () => {
    expect(inferReferralRule({ 9: 0.45, 13: 0.65, 350: 59.5 })).toEqual({
      rule: clothing,
      source: 'estimateTable',
    });
  });
  it('uses $13 to tell Beauty (8%/$10) from Grocery-like (8%/$15)', () => {
    expect(inferReferralRule({ 9: 0.72, 13: 1.95, 350: 52.5 }).rule).toEqual(beauty);
    expect(inferReferralRule({ 9: 0.72, 13: 1.04, 350: 52.5 }).rule).toMatchObject({
      range: [
        { from: 0, to: 15, percent: 8 },
        { from: 15, to: Infinity, percent: 15 },
      ],
    });
  });
  it('falls back to Everything Else', () => {
    expect(inferReferralRule({ 9: 0.5, 350: 3 })).toEqual({ rule: everything, source: 'fallback' });
  });
  it('drops the minimum for media and grocery', () => {
    expect(inferReferralRule({ 9: 1.35, 350: 52.5 }, { category: 'Books' }).rule).toEqual({
      kind: 'percent',
      percent: 15,
      min: 0,
    });
  });
  it('mower / snow blower over $500 are 8%', () => {
    expect(
      inferReferralRule({ 9: 1.35, 350: 52.5 }, { productType: 'LAWN_MOWER', price: 600 }).rule,
    ).toEqual({ kind: 'percent', percent: 8, min: 0.3 });
  });
});

describe('closingFee', () => {
  it('prefers the API quote, then the media table', () => {
    expect(closingFee('Books', 0)).toBe(0);
    expect(closingFee('Books')).toBe(1.8);
    expect(closingFee('Toys & Games')).toBe(0);
  });
});

describe('invertReferral', () => {
  const roundTrip = (rule: ReferralRule, s: number) => {
    const p = invertReferral(rule, s);
    return p - referralFee(rule, p);
  };
  it('percent', () => {
    expect(invertReferral(everything, 13.1)).toBeCloseTo(15.4118, 4);
  });
  it('percent below the minimum adds the minimum', () => {
    expect(invertReferral(everything, 1)).toBe(1.3);
  });
  it('whole-price ranges pick the range the answer falls in', () => {
    expect(invertReferral(beauty, 9)).toBeCloseTo(9 / 0.92, 6);
    expect(invertReferral(beauty, 20)).toBeCloseTo(20 / 0.85, 6);
    expect(roundTrip(clothing, 16)).toBeCloseTo(16, 2);
  });
  it('portion ranges carry the lower slices', () => {
    // Jewelry: P − (50 + 0.05·(P − 250)) = 300 -> 0.95·P = 337.5 -> P = 355.26…
    expect(invertReferral(jewelry, 300)).toBeCloseTo(355.263, 3);
    expect(roundTrip(jewelry, 300)).toBeCloseTo(300, 2);
    expect(roundTrip(jewelry, 100)).toBeCloseTo(100, 2);
  });
  it('fixed', () => {
    expect(invertReferral({ kind: 'fixed', fixed: 2 }, 10)).toBe(12);
  });
});
