import { describe, expect, it } from 'vitest';
import { cacheKey, withCache } from '../src/lib/cache';
import { memoryKV } from './helpers';

describe('cacheKey', () => {
  it('has the documented shape and ignores parameter order', async () => {
    const a = await cacheKey('spapi', 'us', 'fees', { asin: 'B0X', price: 9 });
    const b = await cacheKey('spapi', 'us', 'fees', { price: 9, asin: 'B0X' });
    expect(a).toBe(b);
    expect(a).toMatch(/^spapi:us:fees:[0-9a-f]{16}$/);
  });

  it('differs when parameters differ', async () => {
    const a = await cacheKey('spapi', 'us', 'catalog', { asin: 'B0A' });
    const b = await cacheKey('spapi', 'us', 'catalog', { asin: 'B0B' });
    expect(a).not.toBe(b);
  });
});

describe('withCache', () => {
  it('loads once and then serves from KV', async () => {
    const kv = memoryKV();
    let loads = 0;
    const load = async () => ({ n: ++loads });
    const first = await withCache(kv, 'k', 60, load);
    const second = await withCache(kv, 'k', 60, load);
    expect(first).toMatchObject({ data: { n: 1 }, cached: false });
    expect(second).toMatchObject({ data: { n: 1 }, cached: true });
    expect(loads).toBe(1);
  });

  it('does not cache failures', async () => {
    const kv = memoryKV();
    await expect(
      withCache(kv, 'k', 60, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(kv.store.size).toBe(0);
  });
});
