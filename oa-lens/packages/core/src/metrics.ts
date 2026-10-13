// Small sales metrics shown in the widget (docs/04 §7).
import { totalProductsTable } from '../data';

/** rank ÷ category size × 100, or null when the category size is unknown. */
export function topPercent(
  rank: number | null | undefined,
  category: string | null | undefined,
): number | null {
  if (rank == null || !category) return null;
  const total = totalProductsTable[category];
  if (!total) return null;
  return (rank / total) * 100;
}

/** ≥ 5%: rounded up to a whole number; below: two decimals, never "0.00". */
export function formatTopPercent(pct: number | null): string {
  if (pct == null || !Number.isFinite(pct)) return '--';
  if (pct >= 5) return `${Math.ceil(pct)}%`;
  const fixed = (Math.round(pct * 100) / 100).toFixed(2);
  return `${fixed === '0.00' ? '0.01' : fixed}%`;
}

/** FBA offers priced within `percent`% of the lowest FBA price. */
export function closeFbaOfferCount(fbaPrices: number[], percent: number): number {
  if (fbaPrices.length === 0) return 0;
  const low = Math.min(...fbaPrices);
  const limit = low * (1 + percent / 100) + 1e-9;
  return fbaPrices.filter((p) => p <= limit).length;
}

/** Whole days since `since` (Unix ms or ISO date). */
export function daysSince(
  since: number | string | null | undefined,
  now = Date.now(),
): number | null {
  if (since == null) return null;
  const t = typeof since === 'number' ? since : Date.parse(since);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now - t) / 86400000));
}
