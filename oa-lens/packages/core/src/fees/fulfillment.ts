import {
  fulfillmentFeeClothingTable,
  fulfillmentFeeHazmatTable,
  fulfillmentFeeTable,
  type BracketTable,
  type FulfillmentTable,
  type SizeTier,
} from '../../data';
import { round2 } from '../round';
import { overmaxFee, type Dims } from './sizeTier';
import { lookupWeight, outboundWeight } from './weight';

export type FeePeriod = 'nonPeak' | 'peak';
export type FulfillmentKind = 'standard' | 'clothing' | 'hazmat';

/** Fuel and logistics surcharge applied to the local table (docs/04 §2-3). */
export const FBA_SURCHARGE_RATE = 0.035;
export const FBA_SURCHARGE_START = '2026-04-17';

const TABLES: Record<FulfillmentKind, FulfillmentTable> = {
  standard: fulfillmentFeeTable,
  clothing: fulfillmentFeeClothingTable,
  hazmat: fulfillmentFeeHazmatTable,
};

/** 0: P < $10, 1: $10 <= P <= $50, 2: P > $50. */
export function priceBand(price: number): 0 | 1 | 2 {
  if (price < 10) return 0;
  return price <= 50 ? 1 : 2;
}

/** ISO yyyy-mm-dd of a date in US Pacific time is close enough; we only compare calendar days. */
function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Peak runs Oct 15 – Jan 14 (inclusive); everything else is Non-Peak. */
export function periodForDate(date: Date): FeePeriod {
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  if (m === 11 || m === 12) return 'peak';
  if (m === 10 && d >= 15) return 'peak';
  if (m === 1 && d < 15) return 'peak';
  return 'nonPeak';
}

/** Fee for a bracket table at an already-truncated weight, or null if the weight is off the table. */
export function bracketFee(table: BracketTable, weight: number, band: 0 | 1 | 2): number | null {
  const { above } = table;
  if (above && weight > above.startFrom) {
    const base = table.brackets.find((b) => b.upTo >= above.startFrom);
    if (!base) return null;
    const steps = Math.ceil(Number(((weight - above.startFrom) / above.every).toFixed(6)));
    return base.fees[band] + steps * above.fee[band];
  }
  const bracket = table.brackets.find((b) => weight <= b.upTo);
  return bracket ? bracket.fees[band] : null;
}

export interface LocalFulfillmentInput {
  tier: SizeTier;
  dims: Dims;
  price: number;
  period: FeePeriod;
  kind?: FulfillmentKind;
  media?: boolean;
  /** Date the fee applies on; decides whether the surcharge is included. Defaults to now. */
  date?: Date;
}

/** Fulfillment fee from the local table (docs/04 §2-3), surcharge and overmax included. */
export function localFulfillmentFee(input: LocalFulfillmentInput): number | null {
  const table = TABLES[input.kind ?? 'standard'][input.tier][input.period === 'peak' ? 1 : 0];
  const weight = lookupWeight(outboundWeight(input.tier, input.dims, { media: input.media }));
  const base = bracketFee(table, weight, priceBand(input.price));
  if (base == null) return null;
  const fee = base + overmaxFee(input.tier, input.dims);
  const surcharged = isoDay(input.date ?? new Date()) >= FBA_SURCHARGE_START;
  return round2(surcharged ? fee * (1 + FBA_SURCHARGE_RATE) : fee);
}
