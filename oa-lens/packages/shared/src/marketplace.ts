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

/**
 * Seller IDs shown as "Amazon". A2R2RITDJNW1Q6 sells Amazon's own stock in fashion categories
 * (RevSeller labels it Amazon on B0FBP3N9RK, screenshot 02).
 */
export const AMAZON_SELLER_IDS: readonly string[] = [AMAZON_SELLER_ID, 'A2R2RITDJNW1Q6'];

export function isMarketplaceKey(value: string): value is MarketplaceKey {
  return Object.hasOwn(MARKETPLACES, value);
}
