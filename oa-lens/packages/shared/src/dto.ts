import type { PartResult } from './api';

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

/** One SP-API fee quote (FinalFee amounts, i.e. after promotions). */
export interface FeeQuote {
  ReferralFee: number;
  FBAFees: number;
  VariableClosingFee: number;
  PerItemFee: number;
  /** Sum of FeePromotion amounts (already subtracted from the fees above). */
  Promotion: number;
}

/** FBA quotes at $9, $13 and $350, one per fulfillment price band (docs/07 §2 fees/tiered). */
export interface FeesTieredDTO {
  '9': FeeQuote;
  '13': FeeQuote;
  '350': FeeQuote;
}

export type OfferCondition = 'new' | 'used';

/** One offer from getItemOffers (top 20 by Amazon's order). */
export interface OfferDTO {
  sellerId: string;
  fba: boolean;
  /** Sold by Amazon itself. */
  amazon: boolean;
  price: number;
  shipping: number;
  landed: number;
  buyBoxWinner: boolean;
  prime: boolean;
  feedbackCount: number | null;
  feedbackPct: number | null;
  shipMinHours: number | null;
  shipMaxHours: number | null;
  subCondition: string | null;
}

/** Normalized getItemOffers result (docs/06 offer summary). Prices are landed (price + shipping). */
export interface OffersDTO {
  asin: string;
  condition: OfferCondition;
  counts: { fba: number; fbm: number; total: number };
  lowestFba: number | null;
  lowestFbm: number | null;
  buyBox: number | null;
  buyBoxEligible: { fba: number; fbm: number };
  /** Amazon's own offer price, if Amazon sells it. */
  amazon: number | null;
  listPrice: number | null;
  /** Competitive Price Threshold, when Amazon returns one. */
  cpt: number | null;
  offers: OfferDTO[];
}

export type RestrictionStatus = 'sell' | 'approval' | 'restricted' | 'unknown';

export interface RestrictionLink {
  url: string;
  title: string;
}

/** Listings Restrictions for one condition type (docs/06 Sell/Appr/Rstr). */
export interface RestrictionDTO {
  conditionType: string;
  status: RestrictionStatus;
  reasons: { code: string; message: string; links: RestrictionLink[] }[];
  /** A reason mentions Transparency codes (Tp badge). */
  transparency: boolean;
}

/** FBA inbound eligibility (docs/06 Haz, FBA warning). */
export interface EligibilityDTO {
  eligible: boolean;
  reasons: string[];
}

export interface PrepDTO {
  /** e.g. ["Polybagging", "Labeling"]; empty = None Listed. */
  instructions: string[];
}

export interface BuyCostDTO {
  asin: string;
  condition: OfferCondition;
  fba: number | null;
  fbm: number | null;
  updatedAt: number;
}

/** GET /v1/{mp}/product/{asin} (docs/07 §3). */
export interface ProductBundleDTO {
  asin: string;
  condition: OfferCondition;
  catalog: PartResult<CatalogDTO>;
  offers: PartResult<OffersDTO>;
  feesTiered: PartResult<FeesTieredDTO>;
  /** New: one entry (new_new). Used: like new, very good, good, acceptable. */
  restrictions: PartResult<RestrictionDTO[]>;
  eligibility: PartResult<EligibilityDTO>;
  buyCost: PartResult<BuyCostDTO | null>;
}

/**
 * Keepa product, trimmed to what the widget shows (docs/06). Arrays are Keepa csv-indexed
 * (0 AMAZON, 1 NEW, 2 USED, 3 SALES, 7 NEW_FBM_SHIPPING, 10 NEW_FBA, 18 BUY_BOX_SHIPPING …);
 * prices in cents, -1 = no data.
 */
export interface KeepaProductDTO {
  asin: string;
  avg30: number[];
  avg90: number[];
  avg180: number[];
  current: number[];
  salesRankDrops30: number | null;
  salesRankDrops90: number | null;
  salesRankDrops180: number | null;
  outOfStockPercentage30: number[];
  outOfStockPercentage90: number[];
  monthlySold: number | null;
  /** Unix ms. */
  listedSince: number | null;
  /** csv[3] (SALES) history, for the 3% drop count. */
  salesCsv: number[] | null;
  /** Requested with offers=20, so FBA/FBM/Buy Box averages are filled. */
  withOffers: boolean;
  /** Amazon's dangerous goods data as Keepa reports it; null = none listed. */
  hazmat: KeepaHazmatDTO | null;
  batteriesRequired: boolean | null;
  batteriesIncluded: boolean | null;
}

export interface KeepaHazmatDTO {
  /** e.g. "UN3481" */
  unId: string | null;
  /** Transport class, e.g. "9" */
  className: string | null;
  /** e.g. "LITHIUM ION BATTERIES CONTAINED IN EQUIPMENT" */
  shippingName: string | null;
  packingGroup: string | null;
  /** Exceptions that apply in the US, e.g. "US_SmallLithiumIonBatteryInEquipment". */
  usExceptions: string[];
}

export interface KeepaQuotaDTO {
  tokensLeft: number;
  refillIn: number;
  refillRate?: number;
  updatedAt: number;
}

/** GET /v1/{mp}/keepa/product/{asins} (docs/07 §4). */
export interface KeepaProductsDTO {
  products: KeepaProductDTO[];
  quota: KeepaQuotaDTO | null;
}
