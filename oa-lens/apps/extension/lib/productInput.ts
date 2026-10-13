// Builds the core calculator input from the Worker bundle, settings and this product's popup edits
// (docs/02 §C, §K-1, §K-2). Pure, so it can be tested without a browser.
import {
  categoryIdToNameTable,
  isMediaDisplayGroup,
  roundCatalogDims,
  type Dims,
  type MfnShipMethod,
  type ProductInput,
} from '@oa-lens/core';
import type {
  CatalogDTO,
  FeesTieredDTO,
  LowInventorySetting,
  MfnShipMethodSetting,
  OffersDTO,
  PlacementLocationSetting,
  PlacementRegionSetting,
  SellPriceOrder,
  Settings,
  UspsServiceSetting,
} from '@oa-lens/shared';

/** Per-product changes made in the fee popups. They never touch the saved settings. */
export interface ProductOverrides {
  dims?: Dims;
  storageEnabled?: boolean;
  storageMonths?: number;
  placementEnabled?: boolean;
  placementRegion?: PlacementRegionSetting;
  placementLocations?: PlacementLocationSetting;
  lowInventoryEnabled?: boolean;
  lowInventoryPeriod?: LowInventorySetting;
  prepEnabled?: boolean;
  prepOn?: string[];
  fbaOtherEnabled?: boolean;
  fbaOther?: number;
  shipToFbaEnabled?: boolean;
  shipToFba?: number | null;
  fbmOtherEnabled?: boolean;
  fbmOther?: number;
  fbmShipEnabled?: boolean;
  fbmShipMethod?: MfnShipMethodSetting;
  fbmUspsService?: UspsServiceSetting;
  fbmZone?: 4 | 5 | 8;
  fbmPoundPrice?: number;
  fbmFlatRate?: number;
  fbmShip?: number | null;
  /** Percent. */
  discount?: number;
  taxEnabled?: boolean;
}

export interface CalculatorValues {
  sellFba: number | null;
  sellFbm: number | null;
  buyFba: number;
  buyFbm: number;
}

/** Package dims from the catalog (item dims as a fallback), rounded like the widget shows them. */
export function catalogDims(catalog: CatalogDTO | null): Dims | null {
  const d = catalog?.packageDimensions ?? catalog?.itemDimensions;
  if (!d || d.length == null || d.width == null || d.height == null || d.weight == null)
    return null;
  return roundCatalogDims({ length: d.length, width: d.width, height: d.height, weight: d.weight });
}

export function categoryName(catalog: CatalogDTO | null): string | null {
  const group = catalog?.websiteDisplayGroup;
  return group ? (categoryIdToNameTable[group] ?? catalog?.websiteDisplayGroupName ?? null) : null;
}

/** docs/04 §6. Used mode always takes the lowest used price. */
export function defaultSellPrice(offers: OffersDTO | null, order: SellPriceOrder): number | null {
  if (!offers) return null;
  const lowest = [offers.lowestFba, offers.lowestFbm].filter((v): v is number => v != null);
  const low = lowest.length ? Math.min(...lowest) : null;
  if (offers.condition === 'used') return low;
  switch (order) {
    case 'buybox_lowprice':
      return offers.buyBox ?? low;
    case 'lowfba_buybox_lowprice':
      return offers.lowestFba ?? offers.buyBox ?? low;
    case 'lowfbm_buybox_lowprice':
      return offers.lowestFbm ?? offers.buyBox ?? low;
  }
}

export function mfnShipMethod(settings: Settings, o: ProductOverrides): MfnShipMethod {
  const m = settings.us;
  switch (o.fbmShipMethod ?? m.mfnShipEstimateMethod) {
    case 'pound':
      return { method: 'pound', pricePerLb: o.fbmPoundPrice ?? m.mfnShipPoundPrice };
    case 'flat':
      return { method: 'flat', rate: o.fbmFlatRate ?? m.mfnShipFlatRate };
    case 'usps':
      return {
        method: 'usps',
        service: o.fbmUspsService ?? m.mfnUSPSMethod,
        zone: o.fbmZone ?? m.mfnShipZone,
        alwaysPriority: m.mfnUSPSAlwaysUsePriority,
        priorityForHazmat: m.mfnUSPSUsePriorityForHazmat,
      };
  }
}

export function buildProductInput(input: {
  catalog: CatalogDTO | null;
  tiered: FeesTieredDTO | null;
  hazmat: boolean;
  settings: Settings;
  values: CalculatorValues;
  overrides: ProductOverrides;
  today?: Date;
}): ProductInput {
  const { settings: s, overrides: o, values } = input;
  const m = s.us;
  const fromCatalog = catalogDims(input.catalog);
  return {
    dims: o.dims ?? fromCatalog,
    catalogDims: fromCatalog,
    media: isMediaDisplayGroup(input.catalog?.websiteDisplayGroup),
    category: categoryName(input.catalog),
    productType: input.catalog?.productType ?? null,
    tiered: input.tiered,
    hazmat: input.hazmat,
    fba: { price: values.sellFba, buyCost: values.buyFba },
    fbm: { price: values.sellFbm, buyCost: values.buyFbm },
    fbaOptions: {
      storage: {
        enabled: o.storageEnabled ?? m.fbaCalcStorageFee,
        months: o.storageMonths ?? m.storageMonths,
      },
      placement: {
        standard: {
          enabled: o.placementEnabled ?? m.fbaInboundPlacementStandardEnabled,
          region: o.placementRegion ?? m.fbaInboundPlacementStandardRegion,
          locations: o.placementLocations ?? m.fbaInboundPlacementStandardLocation,
        },
        bulky: {
          enabled: o.placementEnabled ?? m.fbaInboundPlacementEnabled,
          region: o.placementRegion ?? m.fbaInboundPlacementRegion,
          locations: o.placementLocations ?? m.fbaInboundPlacementLocation,
        },
      },
      lowInventory: {
        enabled: o.lowInventoryEnabled ?? m.fbaLowInventoryEnabled,
        period: o.lowInventoryPeriod ?? m.fbaLowInventoryPeriod,
      },
      prep: {
        enabled: o.prepEnabled ?? m.fbaExtrasEnabled,
        chips: m.fbaExtrasChips,
        on: o.prepOn ?? m.fbaExtrasDefaultOn,
      },
      other: { enabled: o.fbaOtherEnabled ?? m.fbaOtherEnabled, amount: o.fbaOther ?? m.fbaOther },
      shipToFba: {
        enabled: o.shipToFbaEnabled ?? m.fbaInboundEnabled,
        ratePerLb: m.fbaInbound,
        hazmatRatePerLb: m.fbaInboundHazmatEnabled ? m.fbaInboundHazmat : m.fbaInbound,
        useDimWeight: m.fbaInboundUseDim,
        override: o.shipToFba ?? null,
      },
    },
    fbmOptions: {
      other: { enabled: o.fbmOtherEnabled ?? m.mfnOtherEnabled, amount: o.fbmOther ?? m.mfnOther },
      ship: {
        enabled: o.fbmShipEnabled ?? m.mfnShipEstimate,
        method: mfnShipMethod(s, o),
        override: o.fbmShip ?? null,
      },
    },
    cost: {
      discount: (o.discount ?? 0) / 100,
      taxRate: m.salesTax / 100,
      taxEnabled: o.taxEnabled ?? s.useSalesTax,
      roiMethod: s.roiMethod,
      maxCost: {
        fba: {
          net: s.maxBuyCostFBAByNet,
          roi: s.maxBuyCostFBAByROI,
          margin: s.maxBuyCostFBAByMargin,
        },
        fbm: {
          net: s.maxBuyCostMFNByNet,
          roi: s.maxBuyCostMFNByROI,
          margin: s.maxBuyCostMFNByMargin,
        },
      },
    },
    usePeak: s.usePeakFees,
    today: input.today,
  };
}

/** Ship revenue the FBM price includes (docs/04 §4). */
export function fbmShipRevenue(settings: Settings): number {
  return settings.us.mfnShipRevEnabled ? settings.us.mfnShipRev : 0;
}
