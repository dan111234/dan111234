// Price-independent FBA fees: storage, inbound placement, low inventory, ship to FBA, prep chips.
import {
  fbaExtrasFeeTable,
  inboundPlacementTable,
  lowInventoryTable,
  storageFeeHazmatTable,
  storageFeeTable,
  type LowInventoryPeriod,
  type PlacementRegion,
  type SizeTier,
} from '../../data';
import { round2 } from '../round';
import type { FeePeriod } from './fulfillment';
import { isExtraLargeTier, isStandardTier, type Dims } from './sizeTier';
import { lookupWeight, outboundWeight, tierDimWeight } from './weight';

export function cubicFeet(dims: Pick<Dims, 'length' | 'width' | 'height'>): number {
  return (dims.length * dims.width * dims.height) / 1728;
}

export interface StorageFee {
  total: number;
  /** $/month in Jan–Sep and Oct–Dec, for the "Jan-Sep $x/mo Oct-Dec $y/mo" hint. */
  monthly: [number, number];
  hint: string;
}

/**
 * Monthly storage for `months` months (docs/04 §2-6). Non-Peak starts counting in January, Peak in
 * October.
 */
export function storageFee(input: {
  tier: SizeTier;
  dims: Dims;
  months: number;
  period: FeePeriod;
  hazmat?: boolean;
}): StorageFee {
  const rates = (input.hazmat ? storageFeeHazmatTable : storageFeeTable)[input.tier] ?? [0, 0];
  const cuft = cubicFeet(input.dims);
  const monthly: [number, number] = [cuft * rates[0], cuft * rates[1]];
  const months = Math.min(12, Math.max(0, Math.floor(input.months)));
  const start = input.period === 'peak' ? 9 : 0; // zero-based month
  let total = 0;
  for (let i = 0; i < months; i++) {
    const month = (start + i) % 12;
    total += month >= 9 ? monthly[1] : monthly[0];
  }
  const [a, b] = monthly.map((m) => round2(m).toFixed(2));
  return {
    total: round2(total + 0.0001),
    monthly: [round2(monthly[0]), round2(monthly[1])],
    hint: `Jan-Sep $${a}/mo Oct-Dec $${b}/mo`,
  };
}

/** 1, 2, 3 or 5 (= "5+"). Standard tiers only offer 1 and 5+. */
export type PlacementLocations = 1 | 2 | 3 | 5;

export function placementOptions(tier: SizeTier): PlacementLocations[] | null {
  if (isExtraLargeTier(tier)) return null;
  return isStandardTier(tier) ? [1, 5] : [1, 2, 3, 5];
}

/** Inbound placement service fee (docs/04 §2-7). null = not applicable (Extra Large). */
export function placementFee(input: {
  tier: SizeTier;
  dims: Dims;
  region: PlacementRegion;
  locations: PlacementLocations;
}): number | null {
  const { tier, dims } = input;
  if (isExtraLargeTier(tier)) return null;
  if (input.locations === 5) return 0;
  if (isStandardTier(tier) && input.locations !== 1) return 0;
  const brackets = inboundPlacementTable[tier]?.[input.region];
  if (!brackets?.length) return 0;
  const weight = lookupWeight(
    tier === 'Small Standard-Size' ? dims.weight : Math.max(dims.weight, tierDimWeight(tier, dims)),
  );
  const bracket = brackets.find((b) => weight <= b.upTo) ?? brackets.at(-1)!;
  return bracket.fees[input.locations - 1] ?? 0;
}

export type LowInventoryOption = 'select' | LowInventoryPeriod | '28+';

/** Low-inventory-level fee (docs/04 §2-8). null = not applicable. */
export function lowInventoryFee(input: {
  tier: SizeTier;
  dims: Dims;
  period: LowInventoryOption;
  grocery?: boolean;
}): number | null {
  if (isExtraLargeTier(input.tier) || input.grocery) return null;
  if (input.period === 'select' || input.period === '28+') return 0;
  const row = lowInventoryTable[input.tier];
  if (!row) return 0;
  if (Array.isArray(row)) {
    const heavy = outboundWeight(input.tier, input.dims) > 3;
    return row[heavy ? 1 : 0]?.[input.period] ?? 0;
  }
  return row[input.period] ?? 0;
}

/** Inbound shipping to FBA: weight × $/lb (docs/04 §2-9). */
export function shipToFbaFee(input: {
  tier: SizeTier;
  dims: Dims;
  ratePerLb: number;
  useDimWeight?: boolean;
}): number {
  const weight = input.useDimWeight
    ? Math.max(input.dims.weight, tierDimWeight(input.tier, input.dims))
    : input.dims.weight;
  return round2(weight * input.ratePerLb);
}

export interface PrepChip {
  id: string;
  /** Up to 6 characters. */
  label: string;
  amount: number;
}

export const DEFAULT_PREP_CHIPS: PrepChip[] = [
  { id: 'bag', label: 'Bag', amount: fbaExtrasFeeTable.bag ?? 0.7 },
  { id: 'tape', label: 'Tape', amount: fbaExtrasFeeTable.tape ?? 0.6 },
  { id: 'label', label: 'Label', amount: fbaExtrasFeeTable.label ?? 0.55 },
  { id: 'bubble', label: 'Bubble', amount: fbaExtrasFeeTable.bubble ?? 1.04 },
];

/** Sum of the chips that are switched on (docs/04 §2-10). */
export function prepChipsFee(chips: PrepChip[], enabledIds: Iterable<string>): number {
  const on = new Set(enabledIds);
  return round2(chips.filter((c) => on.has(c.id)).reduce((sum, c) => sum + c.amount, 0));
}
