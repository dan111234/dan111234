import { describe, expect, it } from 'vitest';
import { extractAsinFromUrl, isValidAsin } from './asin';

describe('extractAsinFromUrl', () => {
  it.each([
    ['https://www.amazon.com/dp/B07FZ8S74R', 'B07FZ8S74R'],
    ['https://www.amazon.com/Echo-Dot-3rd-Gen/dp/B07FZ8S74R/ref=sr_1_1?th=1', 'B07FZ8S74R'],
    ['https://www.amazon.com/gp/product/B07FZ8S74R?psc=1', 'B07FZ8S74R'],
    ['https://www.amazon.com/dp/product/B07FZ8S74R/', 'B07FZ8S74R'],
    ['https://www.amazon.com/gp/aw/d/B07FZ8S74R', 'B07FZ8S74R'],
    ['https://www.amazon.com/dp/b07fz8s74r', 'B07FZ8S74R'],
    ['https://www.amazon.com/dp/0316769487', '0316769487'],
    ['https://www.amazon.com/something?asin=B07FZ8S74R', 'B07FZ8S74R'],
  ])('%s -> %s', (url, asin) => {
    expect(extractAsinFromUrl(url)).toBe(asin);
  });

  it.each([
    'https://www.amazon.com/',
    'https://www.amazon.com/s?k=echo+dot',
    'https://www.amazon.com/dp/B07FZ8S74RX',
    'https://www.amazon.com/dp/B07FZ8',
    'not a url',
  ])('returns null for %s', (url) => {
    expect(extractAsinFromUrl(url)).toBeNull();
  });
});

describe('isValidAsin', () => {
  it('accepts 10 upper-case alphanumerics only', () => {
    expect(isValidAsin('B07FZ8S74R')).toBe(true);
    expect(isValidAsin('b07fz8s74r')).toBe(false);
    expect(isValidAsin('B07FZ8S74')).toBe(false);
  });
});
