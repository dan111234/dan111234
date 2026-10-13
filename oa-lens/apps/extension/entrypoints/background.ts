import type { CatalogDTO, HealthDTO } from '@oa-lens/shared';
import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import type { Request, ResponseFor } from '../lib/messages';
import { RequestQueue } from '../lib/queue';
import { ResponseCache, type CacheEntry } from '../lib/responseCache';
import { loadWorkerConfig } from '../lib/settings';
import { clientError, workerFetch } from '../lib/workerClient';

const CATALOG_TTL_MS = 10 * 60 * 1000;

// docs/01 §4: getCatalogItem — 2 at a time, 500ms apart.
const queues = {
  catalog: new RequestQueue({ concurrency: 2, intervalMs: 500 }),
};

const cache = new ResponseCache({
  async get(key) {
    const stored = await browser.storage.session.get(key);
    return stored[key] as CacheEntry | undefined;
  },
  async set(key, entry) {
    await browser.storage.session.set({ [key]: entry });
  },
});

async function handle(request: Request): Promise<ResponseFor<Request>> {
  switch (request.type) {
    case 'health': {
      const config = await loadWorkerConfig();
      return workerFetch<HealthDTO>(config, `/v1/health${request.deep ? '?deep=1' : ''}`, {
        // Deep checks call LWA, SP-API and Keepa in sequence.
        timeoutMs: 30_000,
      });
    }
    case 'catalog': {
      const config = await loadWorkerConfig();
      const asin = request.asin.toUpperCase();
      const query = request.fresh ? '?fresh=1' : '';
      return cache.getOrLoad(
        `catalog:us:${asin}`,
        CATALOG_TTL_MS,
        () =>
          queues.catalog.run(() =>
            workerFetch<CatalogDTO>(config, `/v1/us/spapi/catalog/${asin}${query}`),
          ),
        { fresh: request.fresh },
      );
    }
    case 'openOptions':
      await browser.runtime.openOptionsPage();
      return { ok: true };
  }
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    handle(message as Request)
      .then(sendResponse)
      .catch((err: unknown) => {
        sendResponse(clientError('NETWORK', err instanceof Error ? err.message : String(err)));
      });
    return true; // keep the channel open for the async response
  });
});
