import { describe, expect, it } from 'vitest';
import { formatInt, formatRank } from './format';

describe('formatRank', () => {
  it('adds # and thousands separators', () => {
    expect(formatRank(45210)).toBe('#45,210');
    expect(formatRank(1)).toBe('#1');
  });

  it('returns -- for missing values', () => {
    expect(formatRank(null)).toBe('--');
    expect(formatRank(undefined)).toBe('--');
    expect(formatRank(Number.NaN)).toBe('--');
  });
});

describe('formatInt', () => {
  it('rounds to an integer', () => {
    expect(formatInt(1234.6)).toBe('1,235');
  });
});
