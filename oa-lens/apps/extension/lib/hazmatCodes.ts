// FBA inbound eligibility reason codes that concern dangerous goods (docs/06 Haz).
// Meanings from the getItemEligibilityPreview IneligibilityReasonList enum.
import type { EligibilityDTO } from '@oa-lens/shared';

/** Regulated as unfulfillable dangerous goods / fully regulated. */
export const HAZMAT_BLOCKED = ['FBA_INB_0015', 'FBA_INB_0097'] as const;
/** Fulfillable dangerous goods: may need the FBA dangerous goods program. */
export const HAZMAT_FULFILLABLE = ['FBA_INB_0016'] as const;
/** Under dangerous goods review (information, battery, SDS, conflicting data …). */
export const HAZMAT_REVIEW = [
  'FBA_INB_0007',
  'FBA_INB_0008',
  'FBA_INB_0009',
  'FBA_INB_0010',
  'FBA_INB_0011',
  'FBA_INB_0012',
  'FBA_INB_0013',
  'FBA_INB_0014',
] as const;

/** red = Haz, yellow = Haz but may be sendable, review = Rvw, null = not hazmat. */
export type HazmatBadge = 'red' | 'yellow' | 'review' | null;

const has = (reasons: string[], codes: readonly string[]) => reasons.some((r) => codes.includes(r));

export function hazmatBadge(eligibility: EligibilityDTO | null, feeHazmat: boolean): HazmatBadge {
  const reasons = eligibility?.reasons ?? [];
  if (has(reasons, HAZMAT_BLOCKED)) return 'red';
  if (has(reasons, HAZMAT_FULFILLABLE)) return 'yellow';
  if (has(reasons, HAZMAT_REVIEW)) return 'review';
  return feeHazmat ? 'red' : null;
}

/** Reasons that are not about dangerous goods, for the FBA header warning. */
export function otherIneligibility(eligibility: EligibilityDTO | null): string[] {
  const hazmat = new Set<string>([...HAZMAT_BLOCKED, ...HAZMAT_FULFILLABLE, ...HAZMAT_REVIEW]);
  return (eligibility?.reasons ?? []).filter((r) => !hazmat.has(r));
}
