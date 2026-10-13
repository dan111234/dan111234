import type { KeepaProductDTO } from '@oa-lens/shared';
import { describe, expect, it } from 'vitest';
import {
  formatCell,
  formatMonthlySold,
  parseRowList,
  salesValue,
  tableRows,
} from '../lib/keepaView';

// B0FBP3N9RK with offers=20, 2026-10-13 (screenshot 02 shows the same ranges a few hours earlier).
const pad = (a: Record<number, number>) => Array.from({ length: 36 }, (_, i) => a[i] ?? -1);
const keepa: KeepaProductDTO = {
  asin: 'B0FBP3N9RK',
  avg30: pad({ 0: 10623, 1: 9900, 3: 185510, 10: 10243, 18: 9900 }),
  avg90: pad({ 0: 11137, 1: 10076, 3: 209532, 10: 10327, 18: 10080 }),
  avg180: pad({ 0: 12726, 1: 12195, 3: 236646, 10: 13121, 18: 12197 }),
  current: [],
  salesRankDrops30: 8,
  salesRankDrops90: 25,
  salesRankDrops180: 41,
  outOfStockPercentage30: [0, 0],
  outOfStockPercentage90: [0, 0],
  monthlySold: null,
  listedSince: null,
  salesCsv: null,
  withOffers: true,
};
const ALL = parseRowList(
  'sales,salesDrop,avgRank,outOfStockRateAmz,outOfStockRate3p,avgPriceFBA,avgPriceBB,avgPriceNew,avgPrice3p,avgPriceUsed',
);

describe('tableRows', () => {
  it('matches the RevSeller 30/90/180 table layout', () => {
    const rows = tableRows({ rows: ALL, keepa, sales: '--', dropMethod: 'standard' });
    const show = rows.map((r) => [r.label, ...r.values.map((v) => formatCell(r.kind, v))]);
    expect(show).toEqual([
      ['Sales', '--', '--', '--'],
      ['Rank - Drops', '8', '25', '41'],
      ['Rank', '185,510', '209,532', '236,646'],
      ['OOS - Amz', '0%', '0%', ''],
      ['OOS - 3p', '0%', '0%', ''],
      ['FBA', '$102.43', '$103.27', '$131.21'],
      ['Buy Box', '$99.00', '$100.80', '$121.97'],
      ['Amz', '$106.23', '$111.37', '$127.26'],
      ['3p', '$99.00', '$100.76', '$121.95'],
    ]);
  });
  it('FBA and Buy Box wait for the offers request', () => {
    const rows = tableRows({
      rows: ALL,
      keepa: { ...keepa, withOffers: false },
      sales: '--',
      dropMethod: 'standard',
    });
    expect(rows.find((r) => r.key === 'avgPriceFBA')!.values).toEqual([null, null, null]);
    expect(rows.find((r) => r.key === 'avgPrice3p')!.values[1]).toBe(100.76);
  });
  it('honours the row order and drops unknown keys', () => {
    expect(parseRowList('avgRank, bogus ,sales')).toEqual(['avgRank', 'sales']);
  });
  it('without Keepa data shows dashes', () => {
    const rows = tableRows({
      rows: ['salesDrop', 'avgRank'],
      keepa: null,
      sales: '1K+',
      dropMethod: 'standard',
    });
    expect(rows.map((r) => r.values)).toEqual([
      [null, null, null],
      [null, null, null],
    ]);
  });
});

describe('sales', () => {
  it('page badge first, then Keepa monthlySold', () => {
    expect(
      salesValue({ value: '50+', period: 'past month' }, { ...keepa, monthlySold: 2000 }),
    ).toBe('50+');
    expect(salesValue(null, { ...keepa, monthlySold: 2000 })).toBe('2K+');
    expect(salesValue(null, null)).toBe('--');
    expect(formatMonthlySold(100)).toBe('100+');
  });
});
