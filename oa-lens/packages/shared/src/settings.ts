// Settings and defaults (docs/05). Stored in chrome.storage.local by the extension.
// Marketplace-specific values (fees, shipping, tax) live under `us`.

export type PlacementRegionSetting = 'west' | 'central' | 'east';
/** Inbound locations; 5 means "5+". */
export type PlacementLocationSetting = 1 | 2 | 3 | 5;
export type LowInventorySetting = 'select' | '0-14' | '14-21' | '21-28' | '28+';
export type MfnShipMethodSetting = 'usps' | 'pound' | 'flat';
export type UspsServiceSetting = 'ground_advantage' | 'priority' | 'media_mail';
export type SellPriceOrder = 'buybox_lowprice' | 'lowfba_buybox_lowprice' | 'lowfbm_buybox_lowprice';
export type RoiMethodSetting = 'buyCostOnly' | 'buyCost_Other_Inbound' | 'allFees';

export interface PrepChipSetting {
  id: string;
  /** Up to 6 characters. */
  label: string;
  amount: number;
}

export interface MarketSettings {
  // FBA tab
  fbaInboundUseDim: boolean;
  fbaInboundEnabled: boolean;
  /** $/lb */
  fbaInbound: number;
  fbaInboundHazmatEnabled: boolean;
  fbaInboundHazmat: number;
  fbaExtrasEnabled: boolean;
  fbaExtrasChips: PrepChipSetting[];
  /** Chip ids switched on by default. */
  fbaExtrasDefaultOn: string[];
  fbaOtherEnabled: boolean;
  fbaOther: number;
  storageMonths: number;
  fbaCalcStorageFee: boolean;
  fbaInboundPlacementStandardEnabled: boolean;
  fbaInboundPlacementStandardRegion: PlacementRegionSetting;
  fbaInboundPlacementStandardLocation: PlacementLocationSetting;
  fbaInboundPlacementEnabled: boolean;
  fbaInboundPlacementRegion: PlacementRegionSetting;
  fbaInboundPlacementLocation: PlacementLocationSetting;
  fbaLowInventoryEnabled: boolean;
  fbaLowInventoryPeriod: LowInventorySetting;
  // FBM tab
  mfnShipRevEnabled: boolean;
  mfnShipRev: number;
  mfnOtherEnabled: boolean;
  mfnOther: number;
  mfnShipEstimate: boolean;
  mfnShipEstimateMethod: MfnShipMethodSetting;
  mfnShipPoundPrice: number;
  mfnShipFlatRate: number;
  mfnUSPSMethod: UspsServiceSetting;
  mfnShipZone: 4 | 5 | 8;
  mfnUSPSUsePriorityForHazmat: boolean;
  mfnUSPSAlwaysUsePriority: boolean;
  // Sell Price/Buy Cost tab
  /** Percent. */
  salesTax: number;
}

export interface Settings {
  us: MarketSettings;
  // Sell Price/Buy Cost
  sellPriceOrderFBM: SellPriceOrder;
  sellPriceOrderFBA: Exclude<SellPriceOrder, 'lowfbm_buybox_lowprice'>;
  useSalesTax: boolean;
  decimalBuyCost: 2 | 3 | 4 | 5 | 6;
  useListPrice: boolean;
  saveBuycost: boolean;
  maxBuyCostType: 'fba' | 'fbm';
  maxBuyCostFBAByNet: number;
  maxBuyCostFBAByROI: number;
  maxBuyCostFBAByMargin: number;
  maxBuyCostMFNByNet: number;
  maxBuyCostMFNByROI: number;
  maxBuyCostMFNByMargin: number;
  // ROI-Margin
  roiMethod: RoiMethodSetting;
  decimalProfit: 0 | 1 | 2;
  alwaysShowROI: boolean;
  // Targets
  profitPriceTargets: string;
  roiPriceTargets: string;
  marginPriceTargets: string;
  targetsFbaFbm: 'fba' | 'fbm';
  targetsMetric: 'margin' | 'roi';
  // General
  defaultCondition: 'new' | 'used';
  closeFBAPercent: 1 | 2 | 3;
  salesRankDropCalcMethod: 'standard' | 'threePercentDrop';
  feeSavingThreshold: number;
  smartInput: boolean;
  usePeakFees: boolean;
  usePromoFees: boolean;
  hideHints: boolean;
  hideFBMColumn: boolean;
  // Display
  displayFontSize: 'smaller' | 'small' | 'default' | 'large' | 'larger';
}

export const DEFAULT_PREP_CHIP_SETTINGS: PrepChipSetting[] = [
  { id: 'bag', label: 'Bag', amount: 0.7 },
  { id: 'tape', label: 'Tape', amount: 0.6 },
  { id: 'label', label: 'Label', amount: 0.55 },
  { id: 'bubble', label: 'Bubble', amount: 1.04 },
];

export const DEFAULT_MARKET_SETTINGS: MarketSettings = {
  fbaInboundUseDim: false,
  fbaInboundEnabled: true,
  fbaInbound: 0,
  fbaInboundHazmatEnabled: true,
  fbaInboundHazmat: 0,
  fbaExtrasEnabled: true,
  fbaExtrasChips: DEFAULT_PREP_CHIP_SETTINGS,
  fbaExtrasDefaultOn: [],
  fbaOtherEnabled: true,
  fbaOther: 0,
  storageMonths: 1,
  fbaCalcStorageFee: true,
  fbaInboundPlacementStandardEnabled: true,
  fbaInboundPlacementStandardRegion: 'west',
  fbaInboundPlacementStandardLocation: 5,
  fbaInboundPlacementEnabled: true,
  fbaInboundPlacementRegion: 'west',
  fbaInboundPlacementLocation: 5,
  fbaLowInventoryEnabled: true,
  fbaLowInventoryPeriod: 'select',
  mfnShipRevEnabled: true,
  mfnShipRev: 0,
  mfnOtherEnabled: true,
  mfnOther: 0,
  mfnShipEstimate: true,
  mfnShipEstimateMethod: 'usps',
  mfnShipPoundPrice: 0,
  mfnShipFlatRate: 0,
  mfnUSPSMethod: 'ground_advantage',
  mfnShipZone: 5,
  mfnUSPSUsePriorityForHazmat: false,
  mfnUSPSAlwaysUsePriority: false,
  salesTax: 0,
};

export const DEFAULT_SETTINGS: Settings = {
  us: DEFAULT_MARKET_SETTINGS,
  sellPriceOrderFBM: 'buybox_lowprice',
  sellPriceOrderFBA: 'buybox_lowprice',
  useSalesTax: true,
  decimalBuyCost: 2,
  useListPrice: false,
  saveBuycost: true,
  maxBuyCostType: 'fba',
  maxBuyCostFBAByNet: 3,
  maxBuyCostFBAByROI: 0,
  maxBuyCostFBAByMargin: 0,
  maxBuyCostMFNByNet: 3,
  maxBuyCostMFNByROI: 0,
  maxBuyCostMFNByMargin: 0,
  roiMethod: 'buyCostOnly',
  decimalProfit: 0,
  alwaysShowROI: true,
  profitPriceTargets: '0,1,2,3,4,10',
  roiPriceTargets: '0,10,20,30,40,50',
  marginPriceTargets: '0,10,20,30,40,50',
  targetsFbaFbm: 'fba',
  targetsMetric: 'margin',
  defaultCondition: 'new',
  closeFBAPercent: 3,
  salesRankDropCalcMethod: 'standard',
  feeSavingThreshold: 10,
  smartInput: false,
  usePeakFees: false,
  usePromoFees: true,
  hideHints: false,
  hideFBMColumn: false,
  displayFontSize: 'default',
};

/** Allowed values for string/number enum settings; anything else falls back to the default. */
const ENUMS: Record<string, readonly unknown[]> = {
  fbaInboundPlacementStandardRegion: ['west', 'central', 'east'],
  fbaInboundPlacementRegion: ['west', 'central', 'east'],
  fbaInboundPlacementStandardLocation: [1, 5],
  fbaInboundPlacementLocation: [1, 2, 3, 5],
  fbaLowInventoryPeriod: ['select', '0-14', '14-21', '21-28', '28+'],
  mfnShipEstimateMethod: ['usps', 'pound', 'flat'],
  mfnUSPSMethod: ['ground_advantage', 'priority', 'media_mail'],
  mfnShipZone: [4, 5, 8],
  sellPriceOrderFBM: ['buybox_lowprice', 'lowfba_buybox_lowprice', 'lowfbm_buybox_lowprice'],
  sellPriceOrderFBA: ['buybox_lowprice', 'lowfba_buybox_lowprice'],
  decimalBuyCost: [2, 3, 4, 5, 6],
  maxBuyCostType: ['fba', 'fbm'],
  roiMethod: ['buyCostOnly', 'buyCost_Other_Inbound', 'allFees'],
  decimalProfit: [0, 1, 2],
  targetsFbaFbm: ['fba', 'fbm'],
  targetsMetric: ['margin', 'roi'],
  defaultCondition: ['new', 'used'],
  closeFBAPercent: [1, 2, 3],
  salesRankDropCalcMethod: ['standard', 'threePercentDrop'],
  displayFontSize: ['smaller', 'small', 'default', 'large', 'larger'],
};

function sanitizeChips(value: unknown): PrepChipSetting[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const chips = value
    .filter(
      (c): c is PrepChipSetting =>
        typeof c === 'object' &&
        c !== null &&
        typeof (c as PrepChipSetting).id === 'string' &&
        typeof (c as PrepChipSetting).label === 'string' &&
        typeof (c as PrepChipSetting).amount === 'number' &&
        Number.isFinite((c as PrepChipSetting).amount),
    )
    .map((c) => ({ id: c.id, label: c.label.slice(0, 6), amount: c.amount }));
  return chips.length ? chips : undefined;
}

function sanitize<T extends object>(defaults: T, raw: unknown): T {
  const out = { ...defaults } as Record<string, unknown>;
  if (typeof raw !== 'object' || raw === null) return out as T;
  for (const [key, def] of Object.entries(defaults)) {
    const value = (raw as Record<string, unknown>)[key];
    if (value === undefined) continue;
    if (key === 'fbaExtrasChips') {
      out[key] = sanitizeChips(value) ?? def;
    } else if (key === 'fbaExtrasDefaultOn') {
      out[key] = Array.isArray(value) ? value.filter((v) => typeof v === 'string') : def;
    } else if (ENUMS[key]) {
      if (ENUMS[key]!.includes(value)) out[key] = value;
    } else if (typeof value === typeof def && (typeof value !== 'number' || Number.isFinite(value))) {
      out[key] = value;
    }
  }
  return out as T;
}

/**
 * Stored or imported settings merged over the defaults. Unknown keys are dropped and values of the
 * wrong type fall back to the default (docs/05 Export/Import).
 */
export function mergeSettings(raw: unknown): Settings {
  const merged = sanitize(DEFAULT_SETTINGS, raw);
  merged.us = sanitize(
    DEFAULT_MARKET_SETTINGS,
    typeof raw === 'object' && raw !== null ? (raw as { us?: unknown }).us : undefined,
  );
  return merged;
}
