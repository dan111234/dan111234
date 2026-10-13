// Normalized DTOs returned by the Worker. Field sources: docs/06.

/** Inches and pounds. A field is null when Amazon did not provide it. */
export interface Dimensions {
  length: number | null;
  width: number | null;
  height: number | null;
  weight: number | null;
}

export interface SalesRank {
  rank: number;
  /** Display name, e.g. "Home & Kitchen". */
  category: string;
  /** displayGroup = top-level category rank, classification = sub-category rank. */
  source: 'displayGroup' | 'classification';
}

export interface ClassificationRank {
  id: string;
  title: string;
  rank: number;
}

export interface CatalogIdentifiers {
  upc: string[];
  ean: string[];
  isbn: string[];
  gtin: string[];
}

export interface CatalogDTO {
  asin: string;
  parentAsin: string | null;
  childAsins: string[];
  variationTheme: string | null;
  title: string | null;
  brand: string | null;
  manufacturer: string | null;
  model: string | null;
  identifiers: CatalogIdentifiers;
  image: string | null;
  productType: string | null;
  websiteDisplayGroup: string | null;
  websiteDisplayGroupName: string | null;
  itemClassification: string | null;
  salesRank: SalesRank | null;
  classificationRanks: ClassificationRank[];
  packageDimensions: Dimensions | null;
  itemDimensions: Dimensions | null;
  listPrice: number | null;
  launchDate: string | null;
}
