import { describe, expect, it } from 'vitest';
import {
  dimWeight,
  isMediaDisplayGroup,
  overmaxFee,
  sizeTier,
  sortDims,
  tierFullName,
  tierShortName,
} from './sizeTier';
import { displayWeight, outboundWeight } from './weight';

const d = (length: number, width: number, height: number, weight: number) => ({
  length,
  width,
  height,
  weight,
});

describe('sortDims', () => {
  it('orders sides and computes length + girth', () => {
    expect(sortDims({ length: 3, width: 10, height: 6 })).toEqual({
      longest: 10,
      median: 6,
      shortest: 3,
      lengthGirth: 28,
    });
  });
});

describe('dimWeight', () => {
  it('divides the volume by 139', () => {
    expect(dimWeight(d(10, 6, 3, 0))).toBeCloseTo(1.295, 3);
  });
  it('bills at least 2 in width and height for bulky items', () => {
    expect(dimWeight(d(40, 1, 1, 0), true)).toBeCloseTo((40 * 2 * 2) / 139, 6);
  });
});

describe('sizeTier', () => {
  it.each([
    [d(8, 5, 0.5, 0.3), 'Small Standard-Size'],
    [d(15, 12, 0.75, 1), 'Small Standard-Size'],
    [d(15, 12, 0.76, 0.5), 'Large Standard-Size'],
    [d(10, 6, 3, 1.1), 'Large Standard-Size'],
    [d(18, 14, 8, 20), 'Large Standard-Size'],
    [d(18.54, 11.26, 4.37, 0.28), 'Small Bulky'],
    [d(21.5, 21.5, 3.5, 6.35), 'Small Bulky'],
    [d(49.25, 25, 2.5, 31.35), 'Large Bulky'],
    [d(68, 6.88, 3, 17.52), 'Extra Large 0 to 50lb'],
    [d(30, 20, 10, 60), 'Extra Large 50+ to 70lb'],
    [d(30, 20, 20, 100), 'Extra Large 70+ to 150lb'],
    [d(30, 20, 20, 200), 'Extra Large 150+ lb'],
  ])('%o -> %s', (dims, tier) => {
    expect(sizeTier(dims)).toBe(tier);
  });

  it('moves to Extra Large when the dimensional weight passes 50 lb', () => {
    // 36 × 27 × 19 / 139 = 132.9 lb dimensional weight.
    expect(sizeTier(d(36, 27, 19, 10))).toBe('Extra Large 70+ to 150lb');
  });
});

describe('labels', () => {
  it('short names', () => {
    expect(tierShortName('Small Standard-Size')).toBe('Sm Std');
    expect(tierShortName('Large Standard-Size')).toBe('Lg Std');
    expect(tierShortName('Small Bulky')).toBe('Sm Bulky');
    expect(tierShortName('Large Bulky')).toBe('Lg Bulky');
    expect(tierShortName('Extra Large 0 to 50lb')).toBe('XL 0 to 50lb');
    expect(tierShortName(null)).toBe('Unknown');
  });
  it('full names for the packaging tables', () => {
    expect(tierFullName('Large Standard-Size')).toBe('Large Standard-Size Non-Media');
    expect(tierFullName('Small Standard-Size', true)).toBe('Small Standard-Size Media');
    expect(tierFullName('Small Bulky')).toBe('Small Bulky');
  });
  it('media display groups', () => {
    expect(isMediaDisplayGroup('book_display_on_website')).toBe(true);
    expect(isMediaDisplayGroup('shoes_display_on_website')).toBe(false);
    expect(isMediaDisplayGroup(null)).toBe(false);
  });
});

describe('outboundWeight', () => {
  it('Small Standard uses the unit weight', () => {
    expect(outboundWeight('Small Standard-Size', d(8, 5, 0.5, 0.3))).toBe(0.3);
  });
  it('Large Standard uses the larger of unit and dimensional weight', () => {
    expect(outboundWeight('Large Standard-Size', d(10, 6, 3, 1.1))).toBeCloseTo(1.295, 3);
    expect(outboundWeight('Large Standard-Size', d(10, 6, 3, 2))).toBe(2);
  });
  it('Extra Large 150+ uses the unit weight only', () => {
    expect(outboundWeight('Extra Large 150+ lb', d(100, 50, 50, 160))).toBe(160);
  });
});

describe('displayWeight', () => {
  it('ounces under 1 lb, whole pounds rounded up above', () => {
    expect(displayWeight(0.3)).toEqual({ value: 5, unit: 'oz' });
    expect(displayWeight(1.295)).toEqual({ value: 2, unit: 'lb' });
    expect(displayWeight(3)).toEqual({ value: 3, unit: 'lb' });
  });
});

describe('overmaxFee', () => {
  it('applies to Extra Large items over 96 in or 130 in length + girth', () => {
    expect(overmaxFee('Extra Large 0 to 50lb', d(100, 10, 10, 30))).toBe(17);
    expect(overmaxFee('Extra Large 0 to 50lb', d(68, 6.88, 3, 17.52))).toBe(0);
    expect(overmaxFee('Large Bulky', d(59, 33, 33, 40))).toBe(0);
  });
});
