import type {
  BuyCostDTO,
  CatalogDTO,
  HealthDTO,
  KeepaProductsDTO,
  OfferCondition,
  PrepDTO,
  ProductBundleDTO,
} from '@oa-lens/shared';
import { browser } from 'wxt/browser';
import { clientError, type ClientResult } from './workerClient';

// Content scripts and extension pages talk to the Worker only through the background
// (CLAUDE.md rule 3); this is the message contract.
export type Request =
  | { type: 'health'; deep: boolean }
  | { type: 'catalog'; asin: string; fresh?: boolean }
  | { type: 'product'; asin: string; condition: OfferCondition; fresh?: boolean }
  | { type: 'prep'; asin: string }
  /** `offers` adds FBA/FBM/Buy Box averages (about 6 tokens instead of 1). `auto` = not clicked. */
  | { type: 'keepa'; asin: string; offers: boolean; auto: boolean }
  | {
      type: 'saveBuyCost';
      asin: string;
      condition: OfferCondition;
      fba: number | null;
      fbm: number | null;
    }
  | { type: 'openOptions' };

export interface ResponseMap {
  health: ClientResult<HealthDTO>;
  catalog: ClientResult<CatalogDTO>;
  product: ClientResult<ProductBundleDTO>;
  prep: ClientResult<PrepDTO>;
  keepa: ClientResult<KeepaProductsDTO>;
  saveBuyCost: ClientResult<BuyCostDTO>;
  openOptions: { ok: true };
}

export type ResponseFor<R extends Request> = ResponseMap[R['type']];

export async function send<R extends Request>(request: R): Promise<ResponseFor<R>> {
  try {
    const response = (await browser.runtime.sendMessage(request)) as ResponseFor<R> | undefined;
    if (response) return response;
  } catch {
    // Background unavailable (extension reloaded while the page stayed open).
  }
  return clientError(
    'NETWORK',
    'The extension background is not responding. Reload the page.',
  ) as ResponseFor<R>;
}
