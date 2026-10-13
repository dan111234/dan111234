// Keepa numbers for the metric row and the 30/90/180 table (docs/02 §B-2, §B-3; docs/04 §7).
import {
  KEEPA_CSV,
  keepaAverage,
  rankDrops,
  type DropMethod,
  type KeepaRange,
} from '@oa-lens/core';
import { KEEPA_TABLE_ROWS, type KeepaProductDTO, type KeepaTableRow } from '@oa-lens/shared';
import type { BoughtPastMonth } from './amazonDom';

const RANGES: KeepaRange[] = [30, 90, 180];

/** 1500 -> "1K+", 50 -> "50+" (Keepa monthlySold is a rounded lower bound). */
export function formatMonthlySold(n: number | null): string | null {
  if (n == null || n <= 0) return null;
  if (n >= 1000) return `${Math.floor(n / 1000)}K+`;
  return `${n}+`;
}

/** Page badge first, then Keepa monthlySold (docs/06 30d Sales). */
export function salesValue(bought: BoughtPastMonth | null, keepa: KeepaProductDTO | null): string {
  return bought?.value ?? formatMonthlySold(keepa?.monthlySold ?? null) ?? '--';
}

const PRICE_INDEX: Partial<Record<KeepaTableRow, number>> = {
  avgPriceFBA: KEEPA_CSV.NEW_FBA,
  avgPriceBB: KEEPA_CSV.BUY_BOX_SHIPPING,
  avgPriceNew: KEEPA_CSV.AMAZON,
  avgPrice3p: KEEPA_CSV.NEW,
  avgPriceUsed: KEEPA_CSV.USED,
};

/** Short labels as RevSeller shows them in the table (screenshot 02). */
export const TABLE_LABELS: Record<KeepaTableRow, string> = {
  sales: 'Sales',
  salesDrop: 'Rank - Drops',
  avgRank: 'Rank',
  outOfStockRateAmz: 'OOS - Amz',
  outOfStockRate3p: 'OOS - 3p',
  avgPriceFBA: 'FBA',
  avgPriceBB: 'Buy Box',
  avgPriceNew: 'Amz',
  avgPrice3p: '3p',
  avgPriceUsed: 'Used',
};

export type CellKind = 'price' | 'count' | 'rank' | 'percent' | 'text';

export interface TableRow {
  key: KeepaTableRow;
  label: string;
  kind: CellKind;
  /** [30, 90, 180]; null = no data, undefined = not applicable (blank). */
  values: (number | string | null | undefined)[];
  /** Price rows need Keepa offers (FBA/Buy Box) and show a loading state until they arrive. */
  needsOffers: boolean;
}

export function parseRowList(list: string): KeepaTableRow[] {
  const known = new Set<string>(KEEPA_TABLE_ROWS);
  return list
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is KeepaTableRow => known.has(s));
}

export function tableRows(input: {
  rows: KeepaTableRow[];
  keepa: KeepaProductDTO | null;
  sales: string;
  dropMethod: DropMethod;
  now?: number;
}): TableRow[] {
  const k = input.keepa;
  const stats = k
    ? {
        avg30: k.avg30,
        avg90: k.avg90,
        avg180: k.avg180,
        salesRankDrops30: k.salesRankDrops30 ?? undefined,
        salesRankDrops90: k.salesRankDrops90 ?? undefined,
        salesRankDrops180: k.salesRankDrops180 ?? undefined,
      }
    : null;
  const out: TableRow[] = [];
  for (const key of input.rows) {
    let row: TableRow;
    switch (key) {
      case 'sales':
        row = {
          key,
          label: TABLE_LABELS[key],
          kind: 'text',
          values: [input.sales, '--', '--'],
          needsOffers: false,
        };
        break;
      case 'salesDrop':
        row = {
          key,
          label: TABLE_LABELS[key],
          kind: 'count',
          values: RANGES.map((range) =>
            k
              ? rankDrops({
                  method: input.dropMethod,
                  range,
                  stats,
                  salesCsv: k.salesCsv,
                  now: input.now,
                })
              : null,
          ),
          needsOffers: false,
        };
        break;
      case 'avgRank':
        row = {
          key,
          label: TABLE_LABELS[key],
          kind: 'rank',
          values: RANGES.map((r) => keepaAverage(stats, r, KEEPA_CSV.SALES)),
          needsOffers: false,
        };
        break;
      case 'outOfStockRateAmz':
      case 'outOfStockRate3p': {
        const who = key === 'outOfStockRateAmz' ? 0 : 1;
        const pct = (arr: number[] | undefined) => {
          const v = arr?.[who];
          return v == null || v < 0 ? null : v;
        };
        row = {
          key,
          label: TABLE_LABELS[key],
          kind: 'percent',
          values: [pct(k?.outOfStockPercentage30), pct(k?.outOfStockPercentage90), undefined],
          needsOffers: false,
        };
        break;
      }
      default: {
        const index = PRICE_INDEX[key]!;
        const needsOffers = key === 'avgPriceFBA' || key === 'avgPriceBB';
        row = {
          key,
          label: TABLE_LABELS[key],
          kind: 'price',
          values: RANGES.map((r) =>
            needsOffers && !k?.withOffers ? null : keepaAverage(stats, r, index),
          ),
          needsOffers,
        };
      }
    }
    // Used prices are hidden when Keepa has none (RevSeller's table has no Used row for new-only items).
    if (key === 'avgPriceUsed' && row.values.every((v) => v == null)) continue;
    out.push(row);
  }
  return out;
}

export function formatCell(kind: CellKind, v: number | string | null | undefined): string {
  if (v === undefined) return '';
  if (v === null) return '--';
  if (typeof v === 'string') return v;
  switch (kind) {
    case 'price':
      return `$${v.toFixed(2)}`;
    case 'rank':
    case 'count':
      return Math.round(v).toLocaleString('en-US');
    case 'percent':
      return `${Math.round(v)}%`;
    default:
      return String(v);
  }
}

/** Stop automatic Keepa requests below this many tokens (docs/01 §5). */
export const KEEPA_MIN_TOKENS = 5;
