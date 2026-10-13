import { describe, expect, it } from 'vitest';
import { closeFbaOfferCount, daysSince, formatTopPercent, topPercent } from './metrics';

describe('Top %', () => {
  it('rank over category size', () => {
    expect(topPercent(213296, 'Clothing, Shoes & Jewelry')).toBeCloseTo(0.0776, 4);
    expect(topPercent(1, 'Nope')).toBeNull();
    expect(topPercent(null, 'Books')).toBeNull();
  });
  it('formats like RevSeller', () => {
    expect(formatTopPercent(0.0776)).toBe('0.08%');
    expect(formatTopPercent(0.001)).toBe('0.01%');
    expect(formatTopPercent(4.991)).toBe('4.99%');
    expect(formatTopPercent(5.2)).toBe('6%');
    expect(formatTopPercent(null)).toBe('--');
  });
});

describe('closeFbaOfferCount', () => {
  it('counts other FBA offers within x% of the lowest', () => {
    expect(closeFbaOfferCount([10, 10.2, 10.3, 10.31, 12], 3)).toBe(2);
    expect(closeFbaOfferCount([93.47, 112.79], 3)).toBe(0);
    expect(closeFbaOfferCount([], 3)).toBe(0);
  });
});

describe('daysSince', () => {
  it('whole days', () => {
    const now = Date.UTC(2026, 9, 13);
    expect(daysSince('2025-06-03T00:00:00Z', now)).toBe(497);
    expect(daysSince(null, now)).toBeNull();
    expect(daysSince('garbage', now)).toBeNull();
  });
});
