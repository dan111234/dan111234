// Keepa data helpers (docs/04 §7). Prices in Keepa are integer cents; -1 means "no data".

/** Keepa csv indexes we use. */
export const KEEPA_CSV = {
  AMAZON: 0,
  NEW: 1,
  USED: 2,
  SALES: 3,
  LISTPRICE: 4,
  NEW_FBM_SHIPPING: 7,
  NEW_FBA: 10,
  COUNT_NEW: 11,
  COUNT_USED: 12,
  RATING: 16,
  COUNT_REVIEWS: 17,
  BUY_BOX_SHIPPING: 18,
  USED_NEW_SHIPPING: 19,
  BUY_BOX_USED_SHIPPING: 32,
} as const;

/** Types whose csv entries are [time, price, shipping] triples. */
const SHIPPING_TYPES = new Set([7, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 32]);
const PRICE_TYPES = new Set([
  0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 32,
]);

const KEEPA_EPOCH_MINUTES = 21564000;

/** Keepa minutes -> Unix ms. */
export function keepaTimeToMs(keepaMinutes: number): number {
  return (keepaMinutes + KEEPA_EPOCH_MINUTES) * 60000;
}

export function msToKeepaTime(ms: number): number {
  return Math.floor(ms / 60000) - KEEPA_EPOCH_MINUTES;
}

export interface KeepaPoint {
  /** Unix ms. */
  t: number;
  /** Dollars for price types, raw value otherwise. null = no offer / no data. */
  v: number | null;
}

/** Parses one csv history; shipping types add shipping to the price. */
export function parseKeepaCsv(type: number, csv: number[] | null | undefined): KeepaPoint[] {
  if (!csv) return [];
  const step = SHIPPING_TYPES.has(type) ? 3 : 2;
  const isPrice = PRICE_TYPES.has(type);
  const points: KeepaPoint[] = [];
  for (let i = 0; i + step - 1 < csv.length; i += step) {
    const raw = csv[i + 1]!;
    let v: number | null = raw < 0 ? null : raw;
    if (v != null && step === 3) v += Math.max(0, csv[i + 2]!);
    if (v != null && isPrice) v /= 100;
    points.push({ t: keepaTimeToMs(csv[i]!), v });
  }
  return points;
}

export interface KeepaStats {
  avg30?: number[];
  avg90?: number[];
  avg180?: number[];
  current?: number[];
  salesRankDrops30?: number;
  salesRankDrops90?: number;
  salesRankDrops180?: number;
  outOfStockPercentage30?: number[];
  outOfStockPercentage90?: number[];
}

export type KeepaRange = 30 | 90 | 180;

/** Average for a csv index over 30/90/180 days. Prices in dollars; null when Keepa has none. */
export function keepaAverage(
  stats: KeepaStats | null | undefined,
  range: KeepaRange,
  index: number,
): number | null {
  const raw = stats?.[`avg${range}`]?.[index];
  if (raw == null || raw < 0) return null;
  return PRICE_TYPES.has(index) ? raw / 100 : raw;
}

export type DropMethod = 'standard' | 'threePercentDrop';

/** Rank drops counted in the last `days` days from the SALES history: rank improved by > 3%. */
export function countThreePercentDrops(
  salesHistory: KeepaPoint[],
  days: number,
  now = Date.now(),
): number {
  const from = now - days * 86400000;
  let count = 0;
  let prev: number | null = null;
  for (const p of salesHistory) {
    if (p.v == null || p.v <= 0) continue;
    if (prev != null && p.t >= from && prev / p.v > 1.03) count++;
    prev = p.v;
  }
  return count;
}

export function rankDrops(input: {
  method: DropMethod;
  range: KeepaRange;
  stats?: KeepaStats | null;
  /** csv[3], required for threePercentDrop. */
  salesCsv?: number[] | null;
  now?: number;
}): number | null {
  if (input.method === 'standard') {
    const v = input.stats?.[`salesRankDrops${input.range}`];
    return v == null || v < 0 ? null : v;
  }
  if (!input.salesCsv) return null;
  return countThreePercentDrops(
    parseKeepaCsv(KEEPA_CSV.SALES, input.salesCsv),
    input.range,
    input.now,
  );
}

/** Out-of-stock % for Amazon (who=0) or 3P New (who=1). */
export function outOfStockPercent(
  stats: KeepaStats | null | undefined,
  range: 30 | 90,
  who: 'amazon' | '3p',
): number | null {
  const v = stats?.[`outOfStockPercentage${range}`]?.[who === 'amazon' ? 0 : 1];
  return v == null || v < 0 ? null : v;
}
