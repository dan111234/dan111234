const intFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** 45210 -> "45,210". Null/NaN -> "--". */
export function formatInt(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '--';
  return intFormat.format(Math.round(value));
}

/** 45210 -> "#45,210". Null/NaN -> "--". */
export function formatRank(rank: number | null | undefined): string {
  if (rank == null || !Number.isFinite(rank)) return '--';
  return `#${formatInt(rank)}`;
}
