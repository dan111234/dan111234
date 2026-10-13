import type { BuyCostDTO, CatalogDTO, HealthDTO, PrepDTO, ProductBundleDTO } from '@oa-lens/shared';
import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import type { Request, ResponseFor } from '../lib/messages';
import { RequestQueue } from '../lib/queue';
import { ResponseCache, type CacheEntry } from '../lib/responseCache';
import { loadWorkerConfig } from '../lib/settings';
import { clientError, workerFetch } from '../lib/workerClient';

const CATALOG_TTL_MS = 10 * 60 * 1000;
/** Offers inside the bundle change quickly; the Worker caches them for 3 minutes. */
const PRODUCT_TTL_MS = 2 * 60 * 1000;
const PREP_TTL_MS = 60 * 60 * 1000;

// docs/01 §4: getCatalogItem — 2 at a time, 500ms apart.
const queues = {
  catalog: new RequestQueue({ concurrency: 2, intervalMs: 500 }),
  // The bundle calls getItemOffers (0.5/s) and getMyFeesEstimates (0.5/s) on cache misses.
  product: new RequestQueue({ concurrency: 1, intervalMs: 1000 }),
  userdata: new RequestQueue({ concurrency: 2, intervalMs: 0 }),
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
    case 'product': {
      const config = await loadWorkerConfig();
      const asin = request.asin.toUpperCase();
      const query = `?condition=${request.condition}${request.fresh ? '&fresh=1' : ''}`;
      return cache.getOrLoad(
        `product:us:${asin}:${request.condition}`,
        PRODUCT_TTL_MS,
        () =>
          queues.product.run(() =>
            workerFetch<ProductBundleDTO>(config, `/v1/us/product/${asin}${query}`, {
              timeoutMs: 30_000,
            }),
          ),
        { fresh: request.fresh },
      );
    }
    case 'prep': {
      const config = await loadWorkerConfig();
      const asin = request.asin.toUpperCase();
      return cache.getOrLoad(`prep:us:${asin}`, PREP_TTL_MS, () =>
        workerFetch<PrepDTO>(config, `/v1/us/spapi/prep/${asin}`),
      );
    }
    case 'saveBuyCost': {
      const config = await loadWorkerConfig();
      const asin = request.asin.toUpperCase();
      const result = await queues.userdata.run(() =>
        workerFetch<BuyCostDTO>(config, `/v1/userdata/buycost/${asin}`, {
          method: 'PUT',
          body: { fba: request.fba, fbm: request.fbm, condition: request.condition },
        }),
      );
      // The cached bundle still holds the old cost.
      if (result.ok) cache.delete(`product:us:${asin}:${request.condition}`);
      return result;
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
