import type {
  CatalogDTO,
  CatalogIdentifiers,
  ClassificationRank,
  Dimensions,
  MarketplaceKey,
  SalesRank,
} from '@oa-lens/shared';
import { MARKETPLACES } from '@oa-lens/shared';
import type { Env } from '../env';
import { spapiFetch } from './client';

/** docs/07 §2. */
export const CATALOG_INCLUDED_DATA = [
  'attributes',
  'dimensions',
  'identifiers',
  'images',
  'productTypes',
  'relationships',
  'salesRanks',
  'summaries',
  'classifications',
] as const;

// Subset of Catalog Items 2022-04-01 `Item` that we read.
interface Measure {
  unit?: string;
  value?: number;
}
interface RawDimensions {
  height?: Measure;
  length?: Measure;
  width?: Measure;
  weight?: Measure;
}
interface AttrValue {
  value?: unknown;
  marketplace_id?: string;
  currency?: string;
}
interface ByMarketplace {
  marketplaceId?: string;
}
export interface RawCatalogItem {
  asin: string;
  attributes?: Record<string, AttrValue[] | undefined>;
  dimensions?: (ByMarketplace & { item?: RawDimensions; package?: RawDimensions })[];
  identifiers?: (ByMarketplace & {
    identifiers?: { identifierType?: string; identifier?: string }[];
  })[];
  images?: (ByMarketplace & { images?: { variant?: string; link?: string; height?: number }[] })[];
  productTypes?: (ByMarketplace & { productType?: string })[];
  relationships?: (ByMarketplace & {
    relationships?: {
      type?: string;
      parentAsins?: string[];
      childAsins?: string[];
      variationTheme?: { theme?: string; attributes?: string[] };
    }[];
  })[];
  salesRanks?: (ByMarketplace & {
    classificationRanks?: { classificationId?: string; title?: string; rank?: number }[];
    displayGroupRanks?: { websiteDisplayGroup?: string; title?: string; rank?: number }[];
  })[];
  summaries?: (ByMarketplace & {
    itemName?: string;
    brand?: string;
    manufacturer?: string;
    modelNumber?: string;
    partNumber?: string;
    itemClassification?: string;
    websiteDisplayGroup?: string;
    websiteDisplayGroupName?: string;
  })[];
}

const LENGTH_TO_INCHES: Record<string, number> = {
  inches: 1,
  inch: 1,
  centimeters: 1 / 2.54,
  centimeter: 1 / 2.54,
  millimeters: 1 / 25.4,
  millimeter: 1 / 25.4,
  meters: 100 / 2.54,
  feet: 12,
};
const WEIGHT_TO_POUNDS: Record<string, number> = {
  pounds: 1,
  pound: 1,
  ounces: 1 / 16,
  ounce: 1 / 16,
  kilograms: 2.2046226218,
  kilogram: 2.2046226218,
  grams: 1 / 453.59237,
  gram: 1 / 453.59237,
  milligrams: 1 / 453592.37,
};

function convert(measure: Measure | undefined, table: Record<string, number>): number | null {
  if (measure?.value == null || !Number.isFinite(measure.value)) return null;
  const factor = table[(measure.unit ?? '').toLowerCase()];
  if (factor === undefined) return null;
  return Math.round(measure.value * factor * 10000) / 10000;
}

function normalizeDimensions(raw: RawDimensions | undefined): Dimensions | null {
  if (!raw) return null;
  const dims: Dimensions = {
    length: convert(raw.length, LENGTH_TO_INCHES),
    width: convert(raw.width, LENGTH_TO_INCHES),
    height: convert(raw.height, LENGTH_TO_INCHES),
    weight: convert(raw.weight, WEIGHT_TO_POUNDS),
  };
  return Object.values(dims).every((v) => v === null) ? null : dims;
}

/** Picks the entry for our marketplace, falling back to the first one. */
function forMp<T extends ByMarketplace>(list: T[] | undefined, mpId: string): T | undefined {
  return list?.find((x) => x.marketplaceId === mpId) ?? list?.[0];
}

function attr(item: RawCatalogItem, name: string, mpId: string): AttrValue | undefined {
  const values = item.attributes?.[name];
  return values?.find((v) => v.marketplace_id === mpId) ?? values?.[0];
}

function attrString(item: RawCatalogItem, name: string, mpId: string): string | null {
  const v = attr(item, name, mpId)?.value;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function attrNumber(item: RawCatalogItem, name: string, mpId: string): number | null {
  const v = attr(item, name, mpId)?.value;
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

export function normalizeCatalogItem(item: RawCatalogItem, mp: MarketplaceKey): CatalogDTO {
  const mpId = MARKETPLACES[mp].id;
  const summary = forMp(item.summaries, mpId);
  const ranks = forMp(item.salesRanks, mpId);
  const dims = forMp(item.dimensions, mpId);

  const identifiers: CatalogIdentifiers = { upc: [], ean: [], isbn: [], gtin: [] };
  for (const id of forMp(item.identifiers, mpId)?.identifiers ?? []) {
    const type = id.identifierType?.toLowerCase();
    if (!id.identifier || !type || !(type in identifiers)) continue;
    const bucket = identifiers[type as keyof CatalogIdentifiers];
    if (!bucket.includes(id.identifier)) bucket.push(id.identifier);
  }

  const variation = forMp(item.relationships, mpId)?.relationships?.find(
    (r) => r.type === 'VARIATION',
  );

  const classificationRanks: ClassificationRank[] = (ranks?.classificationRanks ?? [])
    .filter((r) => typeof r.rank === 'number')
    .map((r) => ({ id: r.classificationId ?? '', title: r.title ?? '', rank: r.rank! }));

  // docs/06: top-level display group rank first, then the first sub-category rank.
  const displayRank = ranks?.displayGroupRanks?.find((r) => typeof r.rank === 'number');
  let salesRank: SalesRank | null = null;
  if (displayRank) {
    salesRank = {
      rank: displayRank.rank!,
      category: displayRank.title ?? summary?.websiteDisplayGroupName ?? '',
      source: 'displayGroup',
    };
  } else if (classificationRanks[0]) {
    salesRank = {
      rank: classificationRanks[0].rank,
      category: classificationRanks[0].title,
      source: 'classification',
    };
  }

  const images = forMp(item.images, mpId)?.images ?? [];
  const main = images
    .filter((img) => img.variant === 'MAIN' && img.link)
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0];

  return {
    asin: item.asin,
    parentAsin: variation?.parentAsins?.[0] ?? null,
    childAsins: variation?.childAsins ?? [],
    variationTheme: variation?.variationTheme?.theme ?? null,
    title: summary?.itemName ?? attrString(item, 'item_name', mpId),
    brand: summary?.brand ?? attrString(item, 'brand', mpId),
    manufacturer: summary?.manufacturer ?? attrString(item, 'manufacturer', mpId),
    model:
      summary?.modelNumber ??
      attrString(item, 'model_number', mpId) ??
      summary?.partNumber ??
      attrString(item, 'part_number', mpId),
    identifiers,
    image: main?.link ?? images.find((img) => img.link)?.link ?? null,
    productType: forMp(item.productTypes, mpId)?.productType ?? null,
    websiteDisplayGroup: summary?.websiteDisplayGroup ?? null,
    websiteDisplayGroupName: summary?.websiteDisplayGroupName ?? null,
    itemClassification: summary?.itemClassification ?? null,
    salesRank,
    classificationRanks,
    packageDimensions: normalizeDimensions(dims?.package),
    itemDimensions: normalizeDimensions(dims?.item),
    listPrice: attrNumber(item, 'list_price', mpId),
    launchDate: attrString(item, 'product_site_launch_date', mpId),
  };
}

export async function fetchCatalogItem(
  env: Env,
  mp: MarketplaceKey,
  asin: string,
): Promise<CatalogDTO> {
  const raw = await spapiFetch<RawCatalogItem>(env, mp, {
    path: `/catalog/2022-04-01/items/${asin}`,
    query: {
      marketplaceIds: MARKETPLACES[mp].id,
      includedData: [...CATALOG_INCLUDED_DATA],
    },
  });
  return normalizeCatalogItem(raw, mp);
}
