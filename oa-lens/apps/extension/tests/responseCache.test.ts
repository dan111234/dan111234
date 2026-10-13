import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResponseCache, type CacheEntry } from '../lib/responseCache';
import type { ClientResult } from '../lib/workerClient';

const ok = (n: number): ClientResult<number> => ({
  ok: true,
  data: n,
  cached: false,
  fetchedAt: 0,
});
const fail: ClientResult<number> = { ok: false, error: { code: 'NETWORK', message: 'down' } };

afterEach(() => vi.useRealTimers());

describe('ResponseCache', () => {
  it('shares one in-flight request between concurrent callers', async () => {
    const cache = new ResponseCache();
    const load = vi.fn(async () => ok(1));
    const [a, b] = await Promise.all([
      cache.getOrLoad('k', 1000, load),
      cache.getOrLoad('k', 1000, load),
    ]);
    expect(a).toEqual(ok(1));
    expect(b).toEqual(ok(1));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('serves from memory until the TTL passes', async () => {
    vi.useFakeTimers();
    const cache = new ResponseCache();
    let n = 0;
    const load = async () => ok(++n);
    await cache.getOrLoad('k', 1000, load);
    expect(await cache.getOrLoad('k', 1000, load)).toEqual(ok(1));
    vi.advanceTimersByTime(1001);
    expect(await cache.getOrLoad('k', 1000, load)).toEqual(ok(2));
  });

  it('does not cache failures', async () => {
    const cache = new ResponseCache();
    const load = vi
      .fn<() => Promise<ClientResult<number>>>()
      .mockResolvedValueOnce(fail)
      .mockResolvedValueOnce(ok(2));
    expect(await cache.getOrLoad('k', 1000, load)).toEqual(fail);
    expect(await cache.getOrLoad('k', 1000, load)).toEqual(ok(2));
  });

  it('fresh skips the cache', async () => {
    const cache = new ResponseCache();
    let n = 0;
    const load = async () => ok(++n);
    await cache.getOrLoad('k', 1000, load);
    expect(await cache.getOrLoad('k', 1000, load, { fresh: true })).toEqual(ok(2));
  });

  it('falls back to the persistent store after a restart', async () => {
    const backing = new Map<string, CacheEntry>();
    const store = {
      get: async (k: string) => backing.get(k),
      set: async (k: string, e: CacheEntry) => void backing.set(k, e),
    };
    await new ResponseCache(store).getOrLoad('k', 60_000, async () => ok(7));
    const load = vi.fn(async () => ok(8));
    expect(await new ResponseCache(store).getOrLoad('k', 60_000, load)).toEqual(ok(7));
    expect(load).not.toHaveBeenCalled();
  });
});
