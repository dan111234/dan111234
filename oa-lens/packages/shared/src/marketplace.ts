export const MARKETPLACES = {
  us: {
    id: 'ATVPDKIKX0DER',
    domain: 'www.amazon.com',
    spapiHost: 'https://sellingpartnerapi-na.amazon.com',
    keepaDomain: 1,
  },
} as const;

export type MarketplaceKey = keyof typeof MARKETPLACES;

/** Seller ID Amazon uses for its own retail offers. */
export const AMAZON_SELLER_ID = 'ATVPDKIKX0DER';

export function isMarketplaceKey(value: string): value is MarketplaceKey {
  return Object.hasOwn(MARKETPLACES, value);
}
