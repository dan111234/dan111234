import { describe, expect, it } from 'vitest';
import { referralFeeTable } from '../../data';
import {
  breakevenCost,
  breakevenPrice,
  computeProfit,
  formatPercent,
  maxBuyCost,
  maxCost,
  minSellPrice,
  orderTotals,
  parseTargetList,
  targetsTable,
  type CostModel,
} from './index';

// docs/04 §10-1: P 24.99, C 8.00, Referral 15%, Fulfillment 4.50, Storage 0.10, Ship to FBA 0.50.
const golden: CostModel = {
  referralRule: referralFeeTable['Everything Else']!,
  closingFee: 0,
  fulfillment: () => 4.5,
  fixedFees: 0.1 + 0.5,
  inbound: 0.5,
  other: 0,
  buyCost: 8,
};
const P = 24.99;

describe('golden: profit (docs/04 §10-1)', () => {
  const r = computeProfit(golden, P);

  it('referral, fees, net', () => {
    expect(r.referral).toBe(3.75);
    expect(r.fees).toBe(8.85);
    expect(r.net).toBe(8.14);
  });
  it('ROI and margin', () => {
    expect(r.roi! * 100).toBeCloseTo(101.75, 2);
    expect(formatPercent(r.roi, 0)).toBe('102%');
    expect(formatPercent(r.roi, 2)).toBe('101.75%');
    expect(r.margin! * 100).toBeCloseTo(32.57, 2);
    expect(formatPercent(r.margin, 0)).toBe('33%');
  });
  it('Max Buy and breakevens', () => {
    expect(maxBuyCost(golden, P, { metric: 'net', value: 3 })).toBe(13.14);
    expect(breakevenCost(golden, P)).toBe(16.14);
    // 13.10 / 0.85 = 15.4118. docs/04 §10-1 says 15.41; RevSeller rounds min sell prices up
    // (screenshots 01/06/07b), so 15.42.
    expect(breakevenPrice(golden, P)).toBe(15.42);
    expect(maxBuyCost(golden, P, { metric: 'margin', value: 0.2 })).toBe(11.14);
  });
  it('Min Sell for ROI 50% checks out', () => {
    const price = minSellPrice(golden, { metric: 'roi', value: 0.5 }, P)!;
    expect(price).toBe(20.12);
    const check = computeProfit(golden, price);
    expect(check.referral).toBe(3.02);
    expect(check.fees).toBe(8.12);
    expect(check.net).toBe(4);
  });
  it('7% sales tax', () => {
    const taxed = computeProfit({ ...golden, taxRate: 0.07 }, P);
    expect(taxed.tax).toBe(0.56);
    expect(taxed.net).toBe(7.58);
    expect(taxed.roi! * 100).toBeCloseTo(88.55, 2);
  });
});

describe('ROI methods', () => {
  const withOther = { ...golden, other: 1 };
  it('denominators', () => {
    expect(computeProfit({ ...withOther, roiMethod: 'buyCostOnly' }, P).roi).toBeCloseTo(
      7.14 / 8,
      6,
    );
    expect(computeProfit({ ...withOther, roiMethod: 'buyCost_Other_Inbound' }, P).roi).toBeCloseTo(
      7.14 / 9.5,
      6,
    );
    expect(computeProfit({ ...withOther, roiMethod: 'allFees' }, P).roi).toBeCloseTo(
      7.14 / 17.85,
      6,
    );
  });
  it('Max Buy for ROI meets the target in every method', () => {
    for (const roiMethod of ['buyCostOnly', 'buyCost_Other_Inbound', 'allFees'] as const) {
      const m = { ...withOther, roiMethod };
      const cost = maxBuyCost(m, P, { metric: 'roi', value: 0.3 })!;
      expect(computeProfit(m, P, cost).roi!).toBeCloseTo(0.3, 2);
    }
  });
  it('Min Sell for ROI is not calculated with allFees', () => {
    expect(
      minSellPrice({ ...golden, roiMethod: 'allFees' }, { metric: 'roi', value: 0.5 }, P),
    ).toBeNull();
  });
  it('ROI is null without a buy cost', () => {
    expect(computeProfit({ ...golden, buyCost: 0 }, P).roi).toBeNull();
  });
});

describe('discount and tax', () => {
  it('Max Buy is the pre-discount cost', () => {
    const m = { ...golden, discount: 0.2 };
    const cost = maxBuyCost(m, P, { metric: 'net', value: 3 })!;
    expect(cost).toBe(16.42); // 13.14 / 0.8 = 16.425, rounded down
    expect(computeProfit(m, P, cost).net).toBeCloseTo(3, 1);
  });
  it('Max Buy includes tax', () => {
    const m = { ...golden, taxRate: 0.07 };
    expect(maxBuyCost(m, P, { metric: 'net', value: 3 })).toBe(12.28);
  });
});

describe('Min Sell', () => {
  it('re-solves when the answer changes the fulfillment price band', () => {
    // $3.00 fulfillment under $10, $4.50 from $10.
    const m: CostModel = { ...golden, buyCost: 2, fulfillment: (p) => (p < 10 ? 3 : 4.5) };
    const price = minSellPrice(m, { metric: 'net', value: 0 }, 24.99)!;
    expect(computeProfit(m, price).net).toBeGreaterThanOrEqual(-0.01);
    expect(price).toBeLessThan(10);
  });
  it('margin target converges', () => {
    const price = minSellPrice(golden, { metric: 'margin', value: 0.3 }, P)!;
    expect(computeProfit(golden, price).margin!).toBeCloseTo(0.3, 2);
  });
  it('margin of 100% is impossible', () => {
    expect(minSellPrice(golden, { metric: 'margin', value: 1 }, P)).toBeNull();
  });
});

describe('Max Cost rules', () => {
  it('takes the smallest enabled rule', () => {
    expect(maxCost(golden, P, { net: 3, roi: 0, margin: 0 })).toEqual({
      value: 13.14,
      rule: 'net',
    });
    expect(maxCost(golden, P, { net: 3, roi: 0, margin: 20 })).toEqual({
      value: 11.14,
      rule: 'margin',
    });
    expect(maxCost(golden, P, { net: 0, roi: 0, margin: 0 })).toBeNull();
  });
  it('returns null when no cost can meet the target', () => {
    expect(maxBuyCost(golden, P, { metric: 'net', value: 50 })).toBeNull();
  });
});

describe('Targets', () => {
  it('parses lists and adds the breakeven row', () => {
    expect(parseTargetList('1, 2,3')).toEqual([0, 1, 2, 3]);
    expect(parseTargetList('0,10,20')).toEqual([0, 10, 20]);
  });
  it('rows meet their target', () => {
    const rows = targetsTable(golden, P, 'net', [0, 2]);
    expect(rows[0]).toEqual({ target: 0, minSell: 15.42, maxBuy: 16.14 });
    expect(computeProfit(golden, rows[1]!.minSell!).net).toBeCloseTo(2, 1);
    const roi = targetsTable(golden, P, 'roi', [50]);
    expect(roi[0]!.minSell).toBe(20.12);
  });
});

describe('orderTotals', () => {
  it('splits the total cost per unit', () => {
    expect(orderTotals(golden, P, 10, 80)).toEqual({ unitCost: 8, sales: 249.9, net: 81.4 });
    expect(orderTotals(golden, P, 0, 80)).toBeNull();
  });
});
