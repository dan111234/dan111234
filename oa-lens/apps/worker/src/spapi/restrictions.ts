import {
  MARKETPLACES,
  type MarketplaceKey,
  type RestrictionDTO,
  type RestrictionStatus,
} from '@oa-lens/shared';
import type { Env } from '../env';
import { ApiError } from '../lib/errors';
import { spapiFetch } from './client';

export const NEW_CONDITIONS = ['new_new'] as const;
export const USED_CONDITIONS = [
  'used_like_new',
  'used_very_good',
  'used_good',
  'used_acceptable',
] as const;

interface RawReason {
  message?: string;
  reasonCode?: string;
  links?: { resource?: string; title?: string }[];
}
export interface RawRestrictions {
  restrictions?: { conditionType?: string; reasons?: RawReason[] }[];
}

/** docs/06: empty -> Sell, APPROVAL_REQUIRED -> Appr, NOT_ELIGIBLE -> Rstr, ASIN_NOT_FOUND -> --. */
export function normalizeRestrictions(conditionType: string, raw: RawRestrictions): RestrictionDTO {
  const reasons = (raw.restrictions ?? []).flatMap((r) => r.reasons ?? []);
  const codes = reasons.map((r) => r.reasonCode ?? '');
  let status: RestrictionStatus = 'sell';
  if (codes.includes('NOT_ELIGIBLE')) status = 'restricted';
  else if (codes.includes('APPROVAL_REQUIRED')) status = 'approval';
  else if (codes.includes('ASIN_NOT_FOUND')) status = 'unknown';
  else if (reasons.length > 0) status = 'restricted';
  return {
    conditionType,
    status,
    reasons: reasons.map((r) => ({
      code: r.reasonCode ?? '',
      message: r.message ?? '',
      links: (r.links ?? [])
        .filter((l) => l.resource)
        .map((l) => ({ url: l.resource!, title: l.title ?? '' })),
    })),
    transparency: reasons.some((r) => /transparency/i.test(r.message ?? '')),
  };
}

/** getListingsRestrictions for one condition type (docs/07 §2). */
export async function fetchRestrictions(
  env: Env,
  mp: MarketplaceKey,
  asin: string,
  conditionType: string,
): Promise<RestrictionDTO> {
  if (!env.SELLER_ID) throw new ApiError('AUTH', 'SELLER_ID is not set');
  const raw = await spapiFetch<RawRestrictions>(env, mp, {
    path: '/listings/2021-08-01/restrictions',
    query: {
      asin,
      sellerId: env.SELLER_ID,
      marketplaceIds: MARKETPLACES[mp].id,
      conditionType,
    },
  });
  return normalizeRestrictions(conditionType, raw);
}
