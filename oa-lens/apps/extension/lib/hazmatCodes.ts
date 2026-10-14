// FBA inbound eligibility reason codes that concern dangerous goods (docs/06 Haz).
// Meanings from the getItemEligibilityPreview IneligibilityReasonList enum.
import type { EligibilityDTO, KeepaHazmatDTO } from '@oa-lens/shared';

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

/**
 * Amazon's dangerous goods data from Keepa: a UN number / class means hazmat; a US exception
 * (e.g. US_SmallLithiumIonBatteryInEquipment) means it may still go to FBA without hazmat approval.
 * RevSeller shows yellow Haz for B0HC235K4R, which is UN3481 with that exception.
 */
export function keepaHazmatBadge(h: KeepaHazmatDTO | null | undefined): HazmatBadge {
  if (!h) return null;
  return h.usExceptions.length > 0 ? 'yellow' : 'red';
}

/** FBA eligibility codes first, then Keepa's dangerous goods data, then the fee comparison. */
export function hazmatBadge(
  eligibility: EligibilityDTO | null,
  keepaHazmat: KeepaHazmatDTO | null | undefined,
  feeHazmat: boolean,
): HazmatBadge {
  const reasons = eligibility?.reasons ?? [];
  if (has(reasons, HAZMAT_BLOCKED)) return 'red';
  if (has(reasons, HAZMAT_FULFILLABLE)) return 'yellow';
  if (has(reasons, HAZMAT_REVIEW)) return 'review';
  return keepaHazmatBadge(keepaHazmat) ?? (feeHazmat ? 'red' : null);
}

/** "UN3481 · Class 9 · LITHIUM ION … · US exception: Small Lithium Ion Battery In Equipment" */
export function hazmatDetail(h: KeepaHazmatDTO | null | undefined): string | null {
  if (!h) return null;
  const exception = h.usExceptions[0]?.replace(/^US_/, '').replace(/([a-z])([A-Z])/g, '$1 $2');
  return [
    h.unId,
    h.className && `Class ${h.className}`,
    h.shippingName,
    exception && `US exception: ${exception}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Reasons that are not about dangerous goods, for the FBA header warning. */
export function otherIneligibility(eligibility: EligibilityDTO | null): string[] {
  const hazmat = new Set<string>([...HAZMAT_BLOCKED, ...HAZMAT_FULFILLABLE, ...HAZMAT_REVIEW]);
  return (eligibility?.reasons ?? []).filter((r) => !hazmat.has(r));
}
