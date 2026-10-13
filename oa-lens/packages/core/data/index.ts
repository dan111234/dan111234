// Typed wrappers around docs/reference/*.json (docs/reference/README.md).
// The JSON keeps "Infinity" for "no limit" and "" for "not applicable"; both are normalized here.
import rawCategories from '../../../docs/reference/category-tables-us.json';
import rawFees from '../../../docs/reference/fee-tables-us-2026.json';

/** Size tiers in the order they are tested (docs/04 §2-1). */
export const SIZE_TIERS = [
  'Small Standard-Size',
  'Large Standard-Size',
  'Small Bulky',
  'Large Bulky',
  'Extra Large 0 to 50lb',
  'Extra Large 50+ to 70lb',
  'Extra Large 70+ to 150lb',
  'Extra Large 150+ lb',
] as const;

export type SizeTier = (typeof SIZE_TIERS)[number];

/** Price bands of the fulfillment fee: P < $10, $10 <= P <= $50, P > $50. */
export type BandFees = readonly [number, number, number];

export interface WeightBracket {
  /** Upper bound in lb (inclusive). */
  upTo: number;
  fees: BandFees;
}

export interface BracketTable {
  /** Sorted by `upTo`. */
  brackets: WeightBracket[];
  /** Per-step surcharge above `startFrom` lb. */
  above: { startFrom: number; every: number; fee: BandFees } | null;
}

/** [Non-Peak, Peak]. */
export type PeriodTables = readonly [BracketTable, BracketTable];

export type FulfillmentTable = Record<SizeTier, PeriodTables>;

export interface TierLimits {
  longest: number;
  median: number | null;
  shortest: number | null;
  lengthGirth: number | null;
  weight: number | { media: number; nonMedia: number };
}

export type ReferralRange = { from: number; to: number; percent: number };

export type ReferralRule =
  | { kind: 'percent'; percent: number; min: number }
  | {
      kind: 'range';
      range: ReferralRange[];
      /** true = tiered (each slice of the price at its own rate), false = one rate for the whole price. */
      portion: boolean;
      /** false: from < P <= to (default). true: from <= P < to. */
      fromInclusive: boolean;
      min: number;
    }
  | { kind: 'fixed'; fixed: number };

export interface ReferralEstimateRow {
  price9: number;
  price13: number | null;
  price350: number;
  result: ReferralRule;
}

export type PlacementRegion = 'west' | 'central' | 'east';

export interface PlacementBracket {
  upTo: number;
  /** Indexed by number of inbound locations − 1 (Bulky: 1, 2, 3; Standard: 1). */
  fees: number[];
}

export type LowInventoryPeriod = '0-14' | '14-21' | '21-28';

export type UspsService = 'ground_advantage' | 'priority' | 'media_mail';

export interface UspsBracket {
  upTo: number;
  /** [Zone 4, Zone 5, Zone 8]. media_mail has one price for every zone. */
  fees: number[];
}

// ---------------------------------------------------------------------------------------------

type Json = unknown;

function num(value: Json): number | null {
  if (value === 'Infinity') return Infinity;
  if (value === '' || value == null) return null;
  const n = typeof value === 'string' ? Number(value) : (value as number);
  return Number.isFinite(n) || n === Infinity ? n : null;
}

/** "4oz" -> 0.25, "1.25" -> 1.25 (lb). */
export function parseWeightKey(key: string): number {
  return key.endsWith('oz') ? Number(key.slice(0, -2)) / 16 : Number(key);
}

function bandFees(value: Json): BandFees | null {
  if (Array.isArray(value)) return [value[0], value[1], value[2]].map((v) => num(v) ?? 0) as never;
  const n = num(value);
  return n == null ? null : [n, n, n];
}

function bracketTable(raw: Record<string, Json>): BracketTable {
  const brackets: WeightBracket[] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'above') continue;
    const fees = bandFees(value);
    if (fees) brackets.push({ upTo: parseWeightKey(key), fees });
  }
  brackets.sort((a, b) => a.upTo - b.upTo);
  const above = raw.above as { fee?: Json; startFrom?: Json; every?: Json } | undefined;
  const startFrom = num(above?.startFrom);
  const fee = bandFees(above?.fee);
  return {
    brackets,
    above: startFrom != null && fee ? { startFrom, every: num(above?.every) ?? 1, fee } : null,
  };
}

function fulfillmentTable(raw: Record<string, { fees: Record<string, Json>[] }>): FulfillmentTable {
  const out = {} as Record<SizeTier, PeriodTables>;
  for (const tier of SIZE_TIERS) {
    const entry = raw[tier];
    if (!entry) throw new Error(`Fulfillment table is missing ${tier}`);
    out[tier] = [bracketTable(entry.fees[0]!), bracketTable(entry.fees[1] ?? entry.fees[0]!)];
  }
  return out;
}

export function parseReferralRule(raw: Json): ReferralRule {
  const r = raw as {
    percent?: Json;
    min?: Json;
    range?: { from: Json; to: Json; percent: Json }[];
    portion?: boolean;
    rangeFromInclusive?: boolean;
    fixed?: Json;
  };
  if (r.fixed != null) return { kind: 'fixed', fixed: num(r.fixed) ?? 0 };
  if (r.range) {
    return {
      kind: 'range',
      range: r.range.map((x) => ({
        from: num(x.from) ?? 0,
        to: num(x.to) ?? Infinity,
        percent: num(x.percent) ?? 0,
      })),
      portion: Boolean(r.portion),
      fromInclusive: Boolean(r.rangeFromInclusive),
      min: num(r.min) ?? 0,
    };
  }
  return { kind: 'percent', percent: num(r.percent) ?? 0, min: num(r.min) ?? 0 };
}

function mapValues<T, U>(obj: Record<string, T>, fn: (v: T) => U): Record<string, U> {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, fn(v)]));
}

function placementBrackets(raw: Record<string, Json[]>): PlacementBracket[] {
  return Object.entries(raw)
    .map(([key, fees]) => ({ upTo: parseWeightKey(key), fees: fees.map((f) => num(f) ?? 0) }))
    .sort((a, b) => a.upTo - b.upTo);
}

function uspsBrackets(raw: Record<string, Json>): UspsBracket[] {
  return Object.entries(raw)
    .map(([key, v]) => ({
      upTo: Number(key),
      fees: Array.isArray(v) ? v.map((f) => num(f) ?? 0) : [num(v) ?? 0],
    }))
    .sort((a, b) => a.upTo - b.upTo);
}

/** A fee table by key; callers cast it to the shape they read. */
function table(key: string): never {
  const value = (rawFees as Record<string, unknown>)[key];
  if (value === undefined) throw new Error(`fee-tables-us-2026.json is missing ${key}`);
  return value as never;
}

export const sizeTierTable: Record<SizeTier, TierLimits> = Object.fromEntries(
  SIZE_TIERS.map((tier) => {
    const t = (table('sizeTierTable') as Record<string, Record<string, Json>>)[tier]!;
    const w = t.weight as Json;
    return [
      tier,
      {
        longest: num(t.longest) ?? Infinity,
        median: num(t.medium),
        shortest: num(t.shortest),
        lengthGirth: num(t.lengthGirth),
        weight:
          typeof w === 'object' && w !== null
            ? {
                media: num((w as Record<string, Json>).Media) ?? 0,
                nonMedia: num((w as Record<string, Json>).nonMedia) ?? 0,
              }
            : (num(w) ?? Infinity),
      } satisfies TierLimits,
    ];
  }),
) as Record<SizeTier, TierLimits>;

export const fulfillmentFeeTable = fulfillmentTable(table('fulfillmentFeeTable'));
export const fulfillmentFeeClothingTable = fulfillmentTable(table('fulfillmentFeeClothingTable'));
export const fulfillmentFeeHazmatTable = fulfillmentTable(table('fulfillmentFeeHazmatTable'));

export const referralFeeTable: Record<string, ReferralRule> = mapValues(
  table('referralFeeTable') as Record<string, Json>,
  parseReferralRule,
);

export const referralFeesEstimateTable: ReferralEstimateRow[] = (
  table('referralFeesEstimateTable') as Record<string, Json>[]
).map((row) => ({
  price9: num(row.price9) ?? 0,
  price13: num(row.price13),
  price350: num(row.price350) ?? 0,
  result: parseReferralRule(row.result),
}));

export const closingFeeTable: Record<string, number> = mapValues(
  table('closingFeeTable') as Record<string, Json>,
  (v) => num(v) ?? 0,
);

const storageRaw = (table: Record<string, Json[]>) =>
  mapValues(table, (v) => [num(v[0]) ?? 0, num(v[1]) ?? 0] as const);

/** Tier -> [Jan–Sep, Oct–Dec] $ per cubic foot per month. */
export const storageFeeTable = storageRaw(table('storageFeeTable'));
export const storageFeeHazmatTable = storageRaw(table('storageFeeHazmatTable'));

export const packagingWeightTable: Record<string, number> = mapValues(
  table('packagingWeightTable') as Record<string, Json>,
  (v) => num(v) ?? 0,
);
export const packagingWeightTableMFN: Record<string, number> = mapValues(
  table('packagingWeightTableMFN') as Record<string, Json>,
  (v) => num(v) ?? 0,
);

export const inboundPlacementTable: Partial<
  Record<SizeTier, Record<PlacementRegion, PlacementBracket[]>>
> = mapValues(
  table('inboundPlacementTable') as Record<string, Record<string, Record<string, Json[]>>>,
  (regions) => mapValues(regions, placementBrackets) as Record<PlacementRegion, PlacementBracket[]>,
);

type LowInvRow = Record<LowInventoryPeriod, number>;
export const lowInventoryTable: Partial<Record<SizeTier, LowInvRow | LowInvRow[]>> = table(
  'lowInventoryTable',
) as never;

export const uspsPriceTable: Record<UspsService, UspsBracket[]> = mapValues(
  table('uspsPriceTable') as Record<string, Record<string, Json>>,
  uspsBrackets,
) as Record<UspsService, UspsBracket[]>;

export const fbaExtrasFeeTable: Record<string, number> = table('fbaExtrasFeeTable');

export const overmaxFeeTable: Partial<Record<SizeTier, number>> = table('overmaxFeeTable');

export const ltsfTable: Record<string, { foot: number; unit?: number }> = table('ltsfTable');

/** websiteDisplayGroup -> rank category display name. */
export const categoryIdToNameTable: Record<string, string> =
  rawCategories.categoryIdToNameTable as Record<string, string>;

/** Category display name -> estimated product count (for Top %). */
export const totalProductsTable: Record<string, number> = rawCategories.totalProductsTable;
