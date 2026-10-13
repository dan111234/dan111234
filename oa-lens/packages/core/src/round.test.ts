import { describe, expect, it } from 'vitest';
import { floor2, round2 } from './round';

describe('round2', () => {
  it('rounds half up on the decimal value despite float error', () => {
    expect(24.99 * 0.15).toBeLessThan(3.7485); // float: 3.7484999…
    expect(round2(24.99 * 0.15)).toBe(3.75);
    expect(round2(7.3100000000000005 * 1.035)).toBe(7.57);
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2)).toBe(2);
  });
});

describe('floor2', () => {
  it('truncates to two decimals', () => {
    expect(floor2(1.2959)).toBe(1.29);
    expect(floor2(2.252)).toBe(2.25);
    expect(floor2(0.3)).toBe(0.3);
  });
});
