import {
  packagingWeightTableMFN,
  uspsPriceTable,
  type SizeTier,
  type UspsService,
} from '../../data';
import { round2 } from '../round';
import { cubicFeet } from './extras';
import { isStandardTier, tierFullName, type Dims } from './sizeTier';

export type UspsZone = 4 | 5 | 8;
const ZONE_INDEX: Record<UspsZone, number> = { 4: 0, 5: 1, 8: 2 };

export type MfnShipMethod =
  | {
      method: 'usps';
      service: UspsService;
      zone: UspsZone;
      alwaysPriority?: boolean;
      priorityForHazmat?: boolean;
    }
  | { method: 'pound'; pricePerLb: number }
  | { method: 'flat'; rate: number };

/** MFN packaging weight. The table still uses the old oversize names for non-standard tiers. */
function mfnPackaging(tier: SizeTier | null, media: boolean): number {
  if (tier == null) return 0;
  if (isStandardTier(tier)) return packagingWeightTableMFN[tierFullName(tier, media)] ?? 0;
  return packagingWeightTableMFN['Small Oversize'] ?? 0;
}

/** Weight billed by USPS: actual + packaging, or dim weight (/166) when over 1 cu ft. */
export function uspsWeight(dims: Dims, tier: SizeTier | null, media = false): number {
  const weight = dims.weight + mfnPackaging(tier, media);
  if (cubicFeet(dims) <= 1) return weight;
  return Math.max(weight, (dims.length * dims.width * dims.height) / 166);
}

/** USPS retail price (docs/04 §4). null if the weight is off the table. */
export function uspsPrice(service: UspsService, zone: UspsZone, weight: number): number | null {
  const brackets = uspsPriceTable[service];
  if (!brackets?.length) return null;
  // Under 1 lb use the ounce brackets (0.25 … 0.99); from 1 lb whole pounds rounded up, max 70.
  const key = weight < 1 ? weight : Math.min(70, Math.ceil(Number(weight.toFixed(6))));
  const bracket = brackets.find((b) => key <= b.upTo) ?? brackets.at(-1)!;
  const fees = bracket.fees;
  return fees.length === 1 ? fees[0]! : (fees[ZONE_INDEX[zone]] ?? null);
}

/** FBM ship-to-buyer estimate (docs/04 §4). */
export function mfnShippingFee(input: {
  dims: Dims;
  tier: SizeTier | null;
  method: MfnShipMethod;
  media?: boolean;
  hazmat?: boolean;
}): number {
  const { method: m } = input;
  switch (m.method) {
    case 'flat':
      return round2(m.rate);
    case 'pound':
      return round2(input.dims.weight * m.pricePerLb);
    case 'usps': {
      let service: UspsService = m.service;
      if (input.media) service = 'media_mail';
      if (m.alwaysPriority || (m.priorityForHazmat && input.hazmat)) service = 'priority';
      const price = uspsPrice(service, m.zone, uspsWeight(input.dims, input.tier, input.media));
      return price == null ? 0 : round2(price);
    }
  }
}
