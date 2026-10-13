// FBA inbound eligibility and prep instructions. Both need the "Amazon Fulfillment" role on the
// SP-API app; without it Amazon answers 403 and the widget simply hides Haz/Prep details.
import {
  MARKETPLACES,
  type EligibilityDTO,
  type MarketplaceKey,
  type PrepDTO,
} from '@oa-lens/shared';
import type { Env } from '../env';
import { spapiFetch } from './client';

export interface RawEligibility {
  payload?: { isEligibleForProgram?: boolean; ineligibilityReasonList?: string[] };
}

export function normalizeEligibility(raw: RawEligibility): EligibilityDTO {
  return {
    eligible: raw.payload?.isEligibleForProgram !== false,
    reasons: raw.payload?.ineligibilityReasonList ?? [],
  };
}

export async function fetchEligibility(
  env: Env,
  mp: MarketplaceKey,
  asin: string,
): Promise<EligibilityDTO> {
  const raw = await spapiFetch<RawEligibility>(env, mp, {
    path: '/fba/inbound/v1/eligibility/itemPreview',
    query: { asin, program: 'INBOUND', marketplaceIds: MARKETPLACES[mp].id },
  });
  return normalizeEligibility(raw);
}

export interface RawPrep {
  payload?: {
    ASINPrepInstructionsList?: { ASIN?: string; PrepInstructionList?: string[] }[];
  };
}

/** "Polybagging" style labels from PrepInstruction enum values. */
const PREP_LABELS: Record<string, string> = {
  Polybagging: 'Polybagging',
  BubbleWrapping: 'Bubble Wrapping',
  Taping: 'Taping',
  BlackShrinkWrapping: 'Black Shrink Wrapping',
  Labeling: 'Labeling',
  HangGarment: 'Hang Garment',
  SetCreation: 'Set Creation',
  Boxing: 'Boxing',
  RemoveFromHanger: 'Remove From Hanger',
  Debundle: 'Debundle',
  SuffocationStickering: 'Suffocation Stickering',
  CapSealing: 'Cap Sealing',
  SetStickering: 'Set Stickering',
  BlankStickering: 'Blank Stickering',
  ShipsInProductPackaging: 'Ships In Product Packaging',
};

export function normalizePrep(asin: string, raw: RawPrep): PrepDTO {
  const entry = raw.payload?.ASINPrepInstructionsList?.find((x) => x.ASIN === asin);
  return {
    instructions: (entry?.PrepInstructionList ?? [])
      .filter((p) => p !== 'NoPrep')
      .map((p) => PREP_LABELS[p] ?? p),
  };
}

export async function fetchPrep(env: Env, mp: MarketplaceKey, asin: string): Promise<PrepDTO> {
  const raw = await spapiFetch<RawPrep>(env, mp, {
    path: '/fba/inbound/v0/prepInstructions',
    query: { ShipToCountryCode: mp === 'us' ? 'US' : 'CA', ASINList: asin },
  });
  return normalizePrep(asin, raw);
}
