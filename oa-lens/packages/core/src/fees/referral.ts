import {
  closingFeeTable,
  referralFeesEstimateTable,
  referralFeeTable,
  type ReferralRange,
  type ReferralRule,
} from '../../data';
import { round2 } from '../round';

export type { ReferralRule } from '../../data';

function inRange(r: ReferralRange, price: number, fromInclusive: boolean): boolean {
  return fromInclusive ? price >= r.from && price < r.to : price > r.from && price <= r.to;
}

function rawReferral(rule: ReferralRule, price: number): number {
  switch (rule.kind) {
    case 'fixed':
      return rule.fixed;
    case 'percent':
      return (price * rule.percent) / 100;
    case 'range': {
      if (rule.portion) {
        let total = 0;
        for (const r of rule.range) {
          if (price <= r.from) break;
          total += ((Math.min(price, r.to) - r.from) * r.percent) / 100;
        }
        return total;
      }
      // The first range has no lower bound in practice (from = 0 includes P = 0).
      const r =
        rule.range.find((x) => inRange(x, price, rule.fromInclusive)) ??
        (price <= (rule.range[0]?.from ?? 0) ? rule.range[0] : rule.range.at(-1));
      return r ? (price * r.percent) / 100 : 0;
    }
  }
}

/** Referral fee at price P, min applied, round2 (docs/04 §2-5). */
export function referralFee(rule: ReferralRule, price: number): number {
  const fee = rawReferral(rule, price);
  const min = rule.kind === 'fixed' ? 0 : rule.min;
  return round2(Math.max(fee, min));
}

/** Categories whose referral fee has no $0.30 minimum. */
export const NO_MIN_REFERRAL_CATEGORIES = [
  'Books',
  'DVDs',
  'Grocery & Gourmet Food',
  'Music',
  'Software & Computer/Video Games',
  'Video & DVD',
  'Video Games',
  'Video Game Consoles',
  'Gift Cards',
] as const;

/** SP-API referral quotes at $9, $13 (optional) and $350. */
export interface ReferralQuotes {
  9: number;
  13?: number | null;
  350: number;
}

export interface InferredReferralRule {
  rule: ReferralRule;
  source: 'percent' | 'estimateTable' | 'fallback';
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.005;

/**
 * Works out the product's referral rule from SP-API quotes instead of trusting the category name
 * (docs/04 §2-5). `category` only decides the $0.30 minimum and the mower/snow blower exception.
 */
export function inferReferralRule(
  quotes: ReferralQuotes,
  options: { category?: string | null; productType?: string | null; price?: number } = {},
): InferredReferralRule {
  let result: InferredReferralRule;
  const pct9 = Math.round((quotes[9] / 9) * 100);
  const pct350 = Math.round((quotes[350] / 350) * 100);
  if (pct9 === pct350) {
    result = { rule: { kind: 'percent', percent: pct9, min: 0.3 }, source: 'percent' };
  } else {
    const row = referralFeesEstimateTable.find(
      (r) =>
        near(r.price9, quotes[9]) &&
        near(r.price350, quotes[350]) &&
        (quotes[13] == null || r.price13 == null || near(r.price13, quotes[13])),
    );
    result = row
      ? { rule: row.result, source: 'estimateTable' }
      : { rule: referralFeeTable['Everything Else']!, source: 'fallback' };
  }

  const { category, productType, price } = options;
  if (category && (NO_MIN_REFERRAL_CATEGORIES as readonly string[]).includes(category)) {
    result = { ...result, rule: withMin(result.rule, 0) };
  }
  if (
    price != null &&
    price > 500 &&
    (productType === 'LAWN_MOWER' || productType === 'SNOW_BLOWER')
  ) {
    result = { ...result, rule: { kind: 'percent', percent: 8, min: 0.3 } };
  }
  return result;
}

function withMin(rule: ReferralRule, min: number): ReferralRule {
  return rule.kind === 'fixed' ? rule : { ...rule, min };
}

/** Variable closing fee: the SP-API quote when present, else the media table. */
export function closingFee(category: string | null | undefined, apiQuote?: number | null): number {
  if (apiQuote != null) return apiQuote;
  return (category && closingFeeTable[category]) || 0;
}

/**
 * Solves P − referral(P) = S for P (docs/04 §5 invertReferral). Returns the smallest such P.
 */
export function invertReferral(rule: ReferralRule, target: number): number {
  switch (rule.kind) {
    case 'fixed':
      return target + rule.fixed;
    case 'percent': {
      const p = target / (1 - rule.percent / 100);
      return (p * rule.percent) / 100 < rule.min ? target + rule.min : p;
    }
    case 'range': {
      if (rule.portion) {
        let cumulative = 0;
        for (const r of rule.range) {
          const rate = r.percent / 100;
          const p = (target - r.from * rate + cumulative) / (1 - rate);
          if (p <= r.to) return rawReferral(rule, p) < rule.min ? target + rule.min : p;
          cumulative += (r.to - r.from) * rate;
        }
        return target;
      }
      for (const r of rule.range) {
        const p = target / (1 - r.percent / 100);
        if (inRange(r, p, rule.fromInclusive) || (r === rule.range[0] && p <= r.from)) {
          return (p * r.percent) / 100 < rule.min ? target + rule.min : p;
        }
      }
      return target / (1 - (rule.range.at(-1)?.percent ?? 0) / 100);
    }
  }
}
