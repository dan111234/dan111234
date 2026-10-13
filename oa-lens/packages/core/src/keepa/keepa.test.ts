import { describe, expect, it } from 'vitest';
import {
  countThreePercentDrops,
  KEEPA_CSV,
  keepaAverage,
  keepaTimeToMs,
  msToKeepaTime,
  outOfStockPercent,
  parseKeepaCsv,
  rankDrops,
} from './index';

describe('Keepa time', () => {
  it('converts Keepa minutes to Unix ms and back', () => {
    expect(keepaTimeToMs(0)).toBe(Date.UTC(2011, 0, 1));
    const ms = Date.UTC(2026, 9, 13, 12, 0);
    expect(keepaTimeToMs(msToKeepaTime(ms))).toBe(ms);
  });
});

describe('parseKeepaCsv', () => {
  it('price pairs in dollars, -1 as null', () => {
    expect(parseKeepaCsv(KEEPA_CSV.NEW, [100, 2499, 200, -1])).toEqual([
      { t: keepaTimeToMs(100), v: 24.99 },
      { t: keepaTimeToMs(200), v: null },
    ]);
  });
  it('shipping triples add shipping', () => {
    expect(parseKeepaCsv(KEEPA_CSV.BUY_BOX_SHIPPING, [100, 2000, 499, 200, 1500, -1])).toEqual([
      { t: keepaTimeToMs(100), v: 24.99 },
      { t: keepaTimeToMs(200), v: 15 },
    ]);
  });
  it('rank stays raw', () => {
    expect(parseKeepaCsv(KEEPA_CSV.SALES, [100, 45210])).toEqual([
      { t: keepaTimeToMs(100), v: 45210 },
    ]);
    expect(parseKeepaCsv(KEEPA_CSV.SALES, null)).toEqual([]);
  });
});

describe('stats', () => {
  const stats = {
    avg30: [2999, 2500, -1, 45000],
    avg90: [3100, 2600, 1800, 50000],
    salesRankDrops30: 8,
    salesRankDrops90: -1,
    outOfStockPercentage30: [40, 2],
  };
  it('averages', () => {
    expect(keepaAverage(stats, 30, KEEPA_CSV.AMAZON)).toBe(29.99);
    expect(keepaAverage(stats, 30, KEEPA_CSV.USED)).toBeNull();
    expect(keepaAverage(stats, 90, KEEPA_CSV.SALES)).toBe(50000);
    expect(keepaAverage(stats, 180, KEEPA_CSV.NEW)).toBeNull();
    expect(keepaAverage(null, 30, 0)).toBeNull();
  });
  it('standard drops', () => {
    expect(rankDrops({ method: 'standard', range: 30, stats })).toBe(8);
    expect(rankDrops({ method: 'standard', range: 90, stats })).toBeNull();
  });
  it('out of stock', () => {
    expect(outOfStockPercent(stats, 30, 'amazon')).toBe(40);
    expect(outOfStockPercent(stats, 30, '3p')).toBe(2);
    expect(outOfStockPercent(stats, 90, '3p')).toBeNull();
  });
});

describe('3% drops', () => {
  const now = Date.UTC(2026, 9, 13);
  const day = 86400000;
  const k = (daysAgo: number) => msToKeepaTime(now - daysAgo * day);
  // 100 days ago 10000 -> 95 days 9000 (drop) -> 40 days 9500 -> 20 days 9200 (drop, 3.26%)
  // -> 10 days 9000 (2.2%, no) -> 5 days -1 (skip) -> 2 days 5000 (drop)
  const csv = [
    k(100),
    10000,
    k(95),
    9000,
    k(40),
    9500,
    k(20),
    9200,
    k(10),
    9000,
    k(5),
    -1,
    k(2),
    5000,
  ];
  it('counts > 3% improvements inside the window', () => {
    expect(countThreePercentDrops(parseKeepaCsv(3, csv), 30, now)).toBe(2);
    expect(rankDrops({ method: 'threePercentDrop', range: 180, salesCsv: csv, now })).toBe(3);
    expect(rankDrops({ method: 'threePercentDrop', range: 30, salesCsv: null, now })).toBeNull();
  });
});
