// Mixing SP-API quotes with the local tables (docs/04 §2-4).
import type { FeesTieredDTO } from '@oa-lens/shared';
import { referralFeeTable, type ReferralRule, type SizeTier } from '../../data';
import {
  localFulfillmentFee,
  periodForDate,
  priceBand,
  type FeePeriod,
  type FulfillmentKind,
} from './fulfillment';
import { round2 } from '../round';
import type { Dims } from './sizeTier';

/** Quote price for each fulfillment price band. */
export const QUOTE_PRICES = [9, 13, 350] as const;
const BAND_QUOTE = ['9', '13', '350'] as const;

const sameRule = (a: ReferralRule, b: ReferralRule | undefined) =>
  b != null && JSON.stringify(a) === JSON.stringify(b);

export function isClothingRule(rule: ReferralRule): boolean {
  return sameRule(rule, referralFeeTable['Clothing & Accessories']);
}

export function sameDims(a: Dims, b: Dims | null | undefined): boolean {
  if (!b) return false;
  const eq = (x: number, y: number) => Math.abs(x - y) < 1e-6;
  return (
    eq(a.length, b.length) &&
    eq(a.width, b.width) &&
    eq(a.height, b.height) &&
    eq(a.weight, b.weight)
  );
}

interface KindInput {
  tier: SizeTier;
  dims: Dims;
  tiered: FeesTieredDTO;
  rule: ReferralRule;
  media?: boolean;
  today?: Date;
}

export interface KindDetection {
  kind: FulfillmentKind;
  /** The local table for `kind` reproduces every API quote. */
  matchesApi: boolean;
}

/**
 * Hazmat when the hazmat table reproduces the API quotes and the standard one does not; clothing
 * when the referral rule is the Clothing rule (the clothing table is then used for local
 * calculations even if the quotes do not match, e.g. when Amazon measured the item differently).
 */
export function detectFulfillmentKind(input: KindInput): KindDetection {
  const today = input.today ?? new Date();
  const period = periodForDate(today);
  const matches = (kind: FulfillmentKind) =>
    QUOTE_PRICES.every((price, i) => {
      const local = localFulfillmentFee({ ...input, price, period, kind, date: today });
      return local != null && Math.abs(local - input.tiered[BAND_QUOTE[i]!].FBAFees) < 0.005;
    });
  if (isClothingRule(input.rule)) return { kind: 'clothing', matchesApi: matches('clothing') };
  if (matches('standard')) return { kind: 'standard', matchesApi: true };
  if (matches('hazmat')) return { kind: 'hazmat', matchesApi: true };
  return { kind: 'standard', matchesApi: false };
}

export interface FulfillmentResolution {
  fee: number | null;
  /**
   * api: today's SP-API quote. offset: the local table for the other period plus today's
   * API − local difference. local: the local table only (edited dims or no quotes).
   */
  source: 'api' | 'offset' | 'local';
  /** API − local for today's period at this price band, when quotes were used. */
  offset?: number;
}

/**
 * Fulfillment fee for one price and period (docs/04 §2-4).
 * - Catalog dims and today's period: the API quote.
 * - Catalog dims, other period: local table + (API − local) of today's period. RevSeller does
 *   this: B0HC235K4R is billed $0.11 over the table (8.01 vs 7.90) and its Peak column shows
 *   8.46 + 0.11 = 8.57.
 * - Edited dims or no quotes: local table.
 */
export function resolveFulfillmentFee(input: {
  tier: SizeTier;
  dims: Dims;
  /** Dimensions as the catalog reported them; edits switch to the local table. */
  catalogDims: Dims | null;
  price: number;
  period: FeePeriod;
  kind: FulfillmentKind;
  tiered: FeesTieredDTO | null;
  media?: boolean;
  today?: Date;
}): FulfillmentResolution {
  const today = input.today ?? new Date();
  const local = localFulfillmentFee({ ...input, date: today });
  if (input.tiered == null || !sameDims(input.dims, input.catalogDims)) {
    return { fee: local, source: 'local' };
  }
  const api = input.tiered[BAND_QUOTE[priceBand(input.price)]].FBAFees;
  const todayPeriod = periodForDate(today);
  const localToday =
    input.period === todayPeriod
      ? local
      : localFulfillmentFee({ ...input, period: todayPeriod, date: today });
  const offset = localToday == null ? 0 : round2(api - localToday);
  if (input.period === todayPeriod) return { fee: api, source: 'api', offset };
  return { fee: local == null ? null : round2(local + offset), source: 'offset', offset };
}
