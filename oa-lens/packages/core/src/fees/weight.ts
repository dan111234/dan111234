import { packagingWeightTable, type SizeTier } from '../../data';
import { floor2 } from '../round';
import { dimWeight, isStandardTier, tierFullName, type Dims } from './sizeTier';

/** Dimensional weight as billed for the tier (Bulky/Extra Large use 2 in minimum sides). */
export function tierDimWeight(tier: SizeTier, dims: Dims): number {
  return dimWeight(dims, !isStandardTier(tier));
}

/** Weight Amazon bills fulfillment on (docs/04 §2-2), before the lookup truncation. */
export function outboundWeight(
  tier: SizeTier,
  dims: Dims,
  options: { media?: boolean } = {},
): number {
  const packaging = packagingWeightTable[tierFullName(tier, options.media)] ?? 0;
  if (tier === 'Small Standard-Size') return dims.weight + packaging;
  if (tier === 'Extra Large 150+ lb') return dims.weight;
  return Math.max(dims.weight, tierDimWeight(tier, dims)) + packaging;
}

/** Weight used to look up fee tables: truncated to two decimals. */
export function lookupWeight(weight: number): number {
  return floor2(weight);
}

/** Display: under 1 lb in whole ounces (as lb), otherwise whole pounds rounded up. */
export function displayWeight(weight: number): { value: number; unit: 'oz' | 'lb' } {
  if (weight < 1)
    return { value: Math.max(1, Math.ceil(Number((weight * 16).toFixed(6)))), unit: 'oz' };
  return { value: Math.ceil(Number(weight.toFixed(6))), unit: 'lb' };
}
