// Net profit, ROI, margin and the reverse solvers (docs/04 §3, §5).
import type { ReferralRule } from '../../data';
import { invertReferral, referralFee } from '../fees/referral';
import { round2 } from '../round';

export type RoiMethod = 'buyCostOnly' | 'buyCost_Other_Inbound' | 'allFees';

/**
 * Everything needed to price one fulfillment channel. For FBM `fulfillment` returns 0 and
 * `fixedFees`/`inbound` hold the ship-to-buyer cost.
 */
export interface CostModel {
  referralRule: ReferralRule;
  closingFee: number;
  /** Fulfillment fee at a given sell price (it changes with the price band). */
  fulfillment: (price: number) => number;
  /** Fees that do not depend on the price: storage, ship to FBA, placement, low inventory, prep (FBA) or ship to buyer (FBM). */
  fixedFees: number;
  /** Ship to FBA (FBA) or ship to buyer (FBM); the extra ROI denominator of `buyCost_Other_Inbound`. */
  inbound: number;
  other: number;
  /** Buy cost before discount. */
  buyCost: number;
  /** Buy cost discount as a fraction (0.1 = 10%). */
  discount?: number;
  /** Buy cost sales tax as a fraction (0.07 = 7%). 0 when switched off. */
  taxRate?: number;
  roiMethod?: RoiMethod;
}

export interface ProfitResult {
  price: number;
  referral: number;
  closing: number;
  fulfillment: number;
  /** Referral + closing + fulfillment + fixed fees. */
  fees: number;
  /** Fees + Other: the popup's "Expenses" (buy cost excluded). */
  expenses: number;
  /** Buy cost after discount (C'). */
  buyCost: number;
  tax: number;
  net: number;
  /** Fractions; null when the denominator is 0. */
  roi: number | null;
  margin: number | null;
}

const effectiveCost = (m: CostModel, buyCost = m.buyCost) => buyCost * (1 - (m.discount ?? 0));
const taxOn = (m: CostModel, cost: number) => round2(cost * (m.taxRate ?? 0));

function roiDenominator(m: CostModel, cost: number, tax: number, fees: number): number {
  switch (m.roiMethod ?? 'buyCostOnly') {
    case 'buyCostOnly':
      return cost + tax;
    case 'buyCost_Other_Inbound':
      return cost + tax + m.other + m.inbound;
    case 'allFees':
      return cost + tax + fees + m.other;
  }
}

/** docs/04 §3. */
export function computeProfit(m: CostModel, price: number, buyCost = m.buyCost): ProfitResult {
  const referral = referralFee(m.referralRule, price);
  const fulfillment = m.fulfillment(price);
  const fees = round2(referral + m.closingFee + fulfillment + m.fixedFees);
  const cost = effectiveCost(m, buyCost);
  const tax = taxOn(m, cost);
  const net = round2(price - fees - (cost + m.other + tax));
  const denominator = roiDenominator(m, cost, tax, fees);
  return {
    price,
    referral,
    closing: m.closingFee,
    fulfillment,
    fees,
    expenses: round2(fees + m.other),
    buyCost: cost,
    tax,
    net,
    roi: denominator > 0 ? net / denominator : null,
    margin: price > 0 ? net / price : null,
  };
}

export type TargetMetric = 'net' | 'roi' | 'margin';

/** `value` is dollars for net, a fraction for roi and margin. */
export interface Target {
  metric: TargetMetric;
  value: number;
}

/**
 * Highest buy cost (before discount) that still meets the target at the given sell price
 * (docs/04 §5 Max Buy). null when no cost works.
 */
export function maxBuyCost(m: CostModel, price: number, target: Target): number | null {
  const base = computeProfit(m, price, 0);
  const e0 = base.fees + m.other; // Expenses − C' − Tax
  const t = m.taxRate ?? 0;
  const r = target.value;
  let cost: number;
  switch (target.metric) {
    case 'net':
      cost = (price - r - e0) / (1 + t);
      break;
    case 'margin':
      cost = (price * (1 - r) - e0) / (1 + t);
      break;
    case 'roi':
      switch (m.roiMethod ?? 'buyCostOnly') {
        case 'buyCostOnly':
          cost = (price - e0) / ((1 + r) * (1 + t));
          break;
        case 'buyCost_Other_Inbound':
          cost = (price - e0 - r * (m.other + m.inbound)) / ((1 + r) * (1 + t));
          break;
        case 'allFees':
          cost = (price - e0 * (1 + r)) / ((1 + r) * (1 + t));
          break;
      }
  }
  if (!Number.isFinite(cost) || cost < 0) return null;
  const d = m.discount ?? 0;
  return round2(d < 1 ? cost / (1 - d) : cost);
}

/** Buy cost at which net profit is 0. */
export function breakevenCost(m: CostModel, price: number): number | null {
  return maxBuyCost(m, price, { metric: 'net', value: 0 });
}

function solveForNetPart(
  m: CostModel,
  extra: (price: number) => number,
  startPrice: number,
): number {
  // S = extra + (C' + Other + Tax) + (Fees − Referral); P = invertReferral(S). Re-solve when the
  // answer lands in a different fulfillment price band (docs/04 §5 band correction).
  const cost = effectiveCost(m);
  const tax = taxOn(m, cost);
  let guess = startPrice;
  let price = guess;
  for (let i = 0; i < 4; i++) {
    const s =
      extra(guess) + cost + m.other + tax + m.closingFee + m.fulfillment(guess) + m.fixedFees;
    price = invertReferral(m.referralRule, s);
    if (m.fulfillment(price) === m.fulfillment(guess)) break;
    guess = price;
  }
  return price;
}

/**
 * Lowest sell price that meets the target with the current buy cost (docs/04 §5 Min Sell).
 * `currentPrice` picks the starting fulfillment band. null for ROI with the allFees method.
 */
export function minSellPrice(m: CostModel, target: Target, currentPrice: number): number | null {
  const start = currentPrice > 0 ? currentPrice : 10;
  if (target.metric === 'net') return round2(solveForNetPart(m, () => target.value, start));
  if (target.metric === 'roi') {
    if ((m.roiMethod ?? 'buyCostOnly') === 'allFees') return null;
    const cost = effectiveCost(m);
    const denominator = roiDenominator(m, cost, taxOn(m, cost), 0);
    return round2(solveForNetPart(m, () => denominator * target.value, start));
  }
  // Margin: P(k+1) = MinSell(net = P(k) × M), starting at the breakeven price.
  if (target.value >= 1) return null;
  let price = solveForNetPart(m, () => 0, start);
  for (let i = 0; i < 25; i++) {
    const next = solveForNetPart(m, () => price * target.value, price);
    const done = Math.abs(next - price) < 0.005;
    price = next;
    if (done) break;
  }
  return round2(price);
}

export function breakevenPrice(m: CostModel, currentPrice: number): number | null {
  return minSellPrice(m, { metric: 'net', value: 0 }, currentPrice);
}

export interface MaxCostRules {
  /** Dollars; 0 = off. */
  net: number;
  /** Percent; 0 = off. */
  roi: number;
  /** Percent; 0 = off. */
  margin: number;
}

/** Smallest Max Buy over the enabled rules (docs/04 §5 Max Cost). */
export function maxCost(
  m: CostModel,
  price: number,
  rules: MaxCostRules,
): { value: number; rule: TargetMetric } | null {
  const candidates: { value: number; rule: TargetMetric }[] = [];
  const add = (rule: TargetMetric, value: number) => {
    const v = maxBuyCost(m, price, { metric: rule, value });
    if (v != null) candidates.push({ value: v, rule });
  };
  if (rules.net) add('net', rules.net);
  if (rules.roi) add('roi', rules.roi / 100);
  if (rules.margin) add('margin', rules.margin / 100);
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (b.value < a.value ? b : a));
}

/** "0,1,2,3" -> [0,1,2,3]; 0 is added in front when missing (the breakeven row). */
export function parseTargetList(list: string): number[] {
  const values = list
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
  if (!values.includes(0)) values.unshift(0);
  return values;
}

export interface TargetRow {
  /** Dollars for net, percent for roi and margin (as listed in settings). */
  target: number;
  minSell: number | null;
  maxBuy: number | null;
}

/** Targets table (docs/04 §5). */
export function targetsTable(
  m: CostModel,
  price: number,
  metric: TargetMetric,
  targets: number[],
): TargetRow[] {
  return targets.map((target) => {
    const value = metric === 'net' ? target : target / 100;
    return {
      target,
      minSell: minSellPrice(m, { metric, value }, price),
      maxBuy: maxBuyCost(m, price, { metric, value }),
    };
  });
}

export interface OrderTotals {
  unitCost: number;
  sales: number;
  net: number;
}

/** Order totals for `units` bought for `totalCost` in all (docs/04 §5). */
export function orderTotals(
  m: CostModel,
  price: number,
  units: number,
  totalCost: number,
): OrderTotals | null {
  if (!(units > 0)) return null;
  const unitCost = totalCost / units;
  const { net } = computeProfit(m, price, unitCost);
  return { unitCost: round2(unitCost), sales: round2(price * units), net: round2(net * units) };
}

/** ROI/margin display with `decimals` places: 1.0175 -> "102%" (0), "101.75%" (2). */
export function formatPercent(value: number | null, decimals: 0 | 1 | 2 = 0): string {
  if (value == null || !Number.isFinite(value)) return '--';
  return `${round(value * 100, decimals).toFixed(decimals)}%`;
}

function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(Number((value * f).toFixed(6))) / f;
}
