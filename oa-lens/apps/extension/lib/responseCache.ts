import type { ClientResult } from './workerClient';

export interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

/** Second cache layer that survives service-worker restarts (chrome.storage.session). */
export interface PersistentStore {
  get(key: string): Promise<CacheEntry | undefined>;
  set(key: string, entry: CacheEntry): Promise<void>;
}

/**
 * Memory + persistent cache for Worker responses with in-flight de-duplication.
 * Only successful results are cached.
 */
export class ResponseCache {
  private readonly memory = new Map<string, CacheEntry>();
  private readonly inflight = new Map<string, Promise<ClientResult<unknown>>>();

  constructor(private readonly store?: PersistentStore) {}

  async getOrLoad<T>(
    key: string,
    ttlMs: number,
    load: () => Promise<ClientResult<T>>,
    options: { fresh?: boolean } = {},
  ): Promise<ClientResult<T>> {
    if (!options.fresh) {
      const mem = this.memory.get(key);
      if (mem && mem.expiresAt > Date.now()) return mem.value as ClientResult<T>;
      // Checked synchronously so concurrent callers share one request.
      const running = this.inflight.get(key);
      if (running) return running as Promise<ClientResult<T>>;
    }

    const promise = (async (): Promise<ClientResult<T>> => {
      if (!options.fresh) {
        const stored = await this.store?.get(key).catch(() => undefined);
        if (stored && stored.expiresAt > Date.now()) {
          this.memory.set(key, stored);
          return stored.value as ClientResult<T>;
        }
      }
      const result = await load();
      if (result.ok) {
        const entry: CacheEntry = { value: result, expiresAt: Date.now() + ttlMs };
        this.memory.set(key, entry);
        await this.store?.set(key, entry).catch(() => undefined);
      }
      return result;
    })();

    this.inflight.set(key, promise);
    try {
      return await promise;
    } finally {
      if (this.inflight.get(key) === promise) this.inflight.delete(key);
    }
  }
}
