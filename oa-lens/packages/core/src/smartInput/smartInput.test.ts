import { describe, expect, it } from 'vitest';
import { evaluateSmartInput } from './index';

describe('evaluateSmartInput', () => {
  it.each([
    ['24.99', 24.99],
    ['24.99*0.9', 22.491],
    ['$1,299.00', 1299],
    ['(10 + 5) / 3', 5],
    ['2^3^2', 512],
    ['-5 + 10', 5],
    ['50%', 0.5],
    ['100-10%', 90],
    ['100+10%', 110],
    ['200*10%', 20],
    ['.5 * 4', 2],
  ])('%s = %d', (text, value) => {
    expect(evaluateSmartInput(text)).toBeCloseTo(value, 9);
  });

  it.each(['', 'abc', '1 +', '(1', '1)', 'alert(1)', '1/0', 'constructor', '1..2'])(
    'rejects %s',
    (text) => {
      expect(evaluateSmartInput(text)).toBeNull();
    },
  );
});
