import { overmaxFeeTable, SIZE_TIERS, sizeTierTable, type SizeTier } from '../../data';

/** Package dimensions in inches and weight in pounds. */
export interface Dims {
  length: number;
  width: number;
  height: number;
  weight: number;
}

export interface SortedDims {
  longest: number;
  median: number;
  shortest: number;
  lengthGirth: number;
}

/** Categories billed with the Media weight limit (docs/04 §2-1). */
export const MEDIA_CATEGORIES = [
  'Books',
  'Video & DVD',
  'Music',
  'Software & Computer/Video Games',
  'Video',
  'Video Games',
] as const;

/** Catalog websiteDisplayGroup values that are Media. */
export const MEDIA_DISPLAY_GROUPS = [
  'book_display_on_website',
  'dvd_display_on_website',
  'music_display_on_website',
  'software_display_on_website',
  'video_games_display_on_website',
] as const;

export function isMediaDisplayGroup(group: string | null | undefined): boolean {
  return group != null && (MEDIA_DISPLAY_GROUPS as readonly string[]).includes(group);
}

/**
 * Catalog dimensions as the widget shows and calculates them: sides rounded to 0.01 in, weight
 * truncated to 0.01 lb (RevSeller shows 0.82 kg = 1.8078 lb as "LBS: 1.80" and 4.5669 in as 4.57).
 */
export function roundCatalogDims(dims: Dims): Dims {
  const r = (v: number) => Math.round(Number((v * 100).toFixed(6))) / 100;
  return {
    length: r(dims.length),
    width: r(dims.width),
    height: r(dims.height),
    weight: Math.floor(Number((dims.weight * 100).toFixed(6))) / 100,
  };
}

export function sortDims(dims: Pick<Dims, 'length' | 'width' | 'height'>): SortedDims {
  const [longest, median, shortest] = [dims.length, dims.width, dims.height].sort((a, b) => b - a);
  return {
    longest: longest!,
    median: median!,
    shortest: shortest!,
    lengthGirth: longest! + 2 * (median! + shortest!),
  };
}

export function isStandardTier(tier: SizeTier): boolean {
  return tier === 'Small Standard-Size' || tier === 'Large Standard-Size';
}

export function isBulkyTier(tier: SizeTier): boolean {
  return tier === 'Small Bulky' || tier === 'Large Bulky';
}

export function isExtraLargeTier(tier: SizeTier): boolean {
  return tier.startsWith('Extra Large');
}

/**
 * L × W × H / 139 (docs/04 §2-2). Bulky and Extra Large tiers bill width and height of at least
 * 2 inches; pass `minSide2` for those.
 */
export function dimWeight(
  dims: Pick<Dims, 'length' | 'width' | 'height'>,
  minSide2 = false,
): number {
  const s = sortDims(dims);
  const median = minSide2 ? Math.max(2, s.median) : s.median;
  const shortest = minSide2 ? Math.max(2, s.shortest) : s.shortest;
  return (s.longest * median * shortest) / 139;
}

function fits(limit: number | null, value: number): boolean {
  return limit == null || value <= limit;
}

/** First tier whose limits the item fits, or null ("Unknown"). */
export function sizeTier(dims: Dims, options: { media?: boolean } = {}): SizeTier | null {
  const s = sortDims(dims);
  const bulkyWeight = Math.max(dims.weight, dimWeight(dims, true));
  for (const tier of SIZE_TIERS) {
    const t = sizeTierTable[tier];
    const weightLimit =
      typeof t.weight === 'number' ? t.weight : options.media ? t.weight.media : t.weight.nonMedia;
    // Standard tiers compare the unit weight; past Large Standard the dimensional weight counts.
    const weight = isStandardTier(tier) ? dims.weight : bulkyWeight;
    if (
      fits(t.longest, s.longest) &&
      fits(t.median, s.median) &&
      fits(t.shortest, s.shortest) &&
      fits(t.lengthGirth, s.lengthGirth) &&
      fits(weightLimit, weight)
    ) {
      return tier;
    }
  }
  return null;
}

/** "Large Standard-Size Non-Media" style name used by the packaging tables. */
export function tierFullName(tier: SizeTier, media = false): string {
  return isStandardTier(tier) ? `${tier} ${media ? 'Media' : 'Non-Media'}` : tier;
}

/** Short label for the widget (docs/04 §2-1-5). */
export function tierShortName(tier: SizeTier | null): string {
  switch (tier) {
    case null:
      return 'Unknown';
    case 'Small Standard-Size':
      return 'Sm Std';
    case 'Large Standard-Size':
      return 'Lg Std';
    case 'Small Bulky':
      return 'Sm Bulky';
    case 'Large Bulky':
      return 'Lg Bulky';
    default:
      return `XL ${tier.slice('Extra Large '.length)}`;
  }
}

/** Overmax surcharge for Extra Large items over 96 in long or 130 in length + girth. */
export function overmaxFee(tier: SizeTier, dims: Dims): number {
  if (!isExtraLargeTier(tier)) return 0;
  const s = sortDims(dims);
  if (s.longest <= 96 && s.lengthGirth <= 130) return 0;
  return overmaxFeeTable[tier] ?? 0;
}
