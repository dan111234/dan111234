// Everything the calculator, fee popups and product box show for one product (docs/02 §C, §D,
// §K-1, §K-2), computed from catalog data, SP-API quotes and the user's options.
import type { FeesTieredDTO } from '@oa-lens/shared';
import {
  referralFeeTable,
  type PlacementRegion,
  type ReferralRule,
  type SizeTier,
} from '../../data';
import { detectFulfillmentKind, resolveFulfillmentFee } from '../fees/blend';
import {
  cubicFeet,
  lowInventoryFee,
  placementFee,
  prepChipsFee,
  shipToFbaFee,
  storageFee,
  type LowInventoryOption,
  type PlacementLocations,
  type PrepChip,
} from '../fees/extras';
import {
  periodForDate,
  priceBand,
  type FeePeriod,
  type FulfillmentKind,
} from '../fees/fulfillment';
import { mfnShippingFee, type MfnShipMethod } from '../fees/mfnShipping';
import { closingFee, inferReferralRule, referralFee } from '../fees/referral';
import {
  isExtraLargeTier,
  isStandardTier,
  sizeTier,
  tierShortName,
  type Dims,
} from '../fees/sizeTier';
import { outboundWeight, tierDimWeight } from '../fees/weight';
import {
  breakevenPrice,
  computeProfit,
  maxCost,
  type CostModel,
  type MaxCostRules,
  type RoiMethod,
  type TargetMetric,
} from '../profit';
import { round2 } from '../round';

export interface PlacementOption {
  enabled: boolean;
  region: PlacementRegion;
  locations: PlacementLocations;
}

export interface FbaOptions {
  storage: { enabled: boolean; months: number };
  /** Standard and Bulky tiers have separate settings (docs/05 FBA tab). */
  placement: { standard: PlacementOption; bulky: PlacementOption };
  lowInventory: { enabled: boolean; period: LowInventoryOption };
  prep: { enabled: boolean; chips: PrepChip[]; on: string[] };
  other: { enabled: boolean; amount: number };
  shipToFba: {
    enabled: boolean;
    ratePerLb: number;
    hazmatRatePerLb: number;
    useDimWeight: boolean;
    /** Typed into the popup for this product. */
    override: number | null;
  };
}

export interface FbmOptions {
  other: { enabled: boolean; amount: number };
  ship: { enabled: boolean; method: MfnShipMethod; override: number | null };
}

export interface CostOptions {
  /** Fraction, 0.1 = 10%. */
  discount: number;
  /** Fraction, 0.07 = 7%. */
  taxRate: number;
  taxEnabled: boolean;
  roiMethod: RoiMethod;
  maxCost: { fba: MaxCostRules; fbm: MaxCostRules };
}

export interface ProductInput {
  /** Dimensions used for estimates (edited or catalog), rounded for display. */
  dims: Dims | null;
  /** Catalog dimensions; when `dims` differs the local fee table is used. */
  catalogDims: Dims | null;
  media: boolean;
  /** Referral category name, for the $0.30 minimum and closing fee fallbacks. */
  category: string | null;
  productType: string | null;
  tiered: FeesTieredDTO | null;
  /** Hazmat from FBA eligibility; fee comparison can also detect it. */
  hazmat: boolean;
  fba: { price: number | null; buyCost: number };
  fbm: { price: number | null; buyCost: number };
  fbaOptions: FbaOptions;
  fbmOptions: FbmOptions;
  cost: CostOptions;
  usePeak: boolean;
  today?: Date;
}

export interface FbaColumn {
  period: FeePeriod;
  price: number;
  referral: number;
  fulfillment: number;
  fulfillmentSource: 'api' | 'offset' | 'local';
  closing: number;
  storage: number;
  storageHint: string;
  /** null = N/A for the tier. */
  placement: number | null;
  lowInventory: number | null;
  prep: number;
  other: number;
  shipToFba: number;
  fees: number;
  expenses: number;
  buyCost: number;
  tax: number;
  net: number;
  roi: number | null;
  margin: number | null;
  model: CostModel;
}

export interface FbmColumn {
  price: number;
  referral: number;
  closing: number;
  shipToBuyer: number;
  other: number;
  fees: number;
  expenses: number;
  buyCost: number;
  tax: number;
  net: number;
  roi: number | null;
  margin: number | null;
  model: CostModel;
}

export interface MaxCostResult {
  value: number;
  rule: TargetMetric;
}

export interface ProductResult {
  tier: SizeTier | null;
  tierShort: string;
  outbound: number | null;
  dimWeight: number | null;
  cubicFeet: number | null;
  referralRule: ReferralRule;
  referralSource: 'percent' | 'estimateTable' | 'fallback' | 'category';
  kind: FulfillmentKind;
  hazmat: boolean;
  /** Today's fee period. */
  todayPeriod: FeePeriod;
  fba: {
    nonPeak: FbaColumn | null;
    peak: FbaColumn | null;
    /** The column the main Net uses (Peak when "Peak rate" is ticked). */
    main: FbaColumn | null;
    breakeven: number | null;
    maxCost: MaxCostResult | null;
  };
  fbm: {
    column: FbmColumn | null;
    breakeven: number | null;
    maxCost: MaxCostResult | null;
  };
}

function referralFor(input: ProductInput, price: number | null) {
  if (input.tiered) {
    return inferReferralRule(
      {
        9: input.tiered['9'].ReferralFee,
        13: input.tiered['13'].ReferralFee,
        350: input.tiered['350'].ReferralFee,
      },
      { category: input.category, productType: input.productType, price: price ?? undefined },
    );
  }
  const byCategory = input.category ? referralFeeTable[input.category] : undefined;
  return byCategory
    ? { rule: byCategory, source: 'category' as const }
    : { rule: referralFeeTable['Everything Else']!, source: 'fallback' as const };
}

const QUOTE = ['9', '13', '350'] as const;

function closingAt(input: ProductInput, price: number): number {
  const quote = input.tiered?.[QUOTE[priceBand(price)]]?.VariableClosingFee;
  return closingFee(input.category, quote);
}

/** All calculator numbers for one product. */
export function calculateProduct(input: ProductInput): ProductResult {
  const today = input.today ?? new Date();
  const todayPeriod = periodForDate(today);
  const { dims } = input;
  const tier = dims ? sizeTier(dims, { media: input.media }) : null;
  const referral = referralFor(input, input.fba.price ?? input.fbm.price);
  const rule = referral.rule;

  const detection =
    tier && dims && input.tiered
      ? detectFulfillmentKind({ tier, dims, tiered: input.tiered, rule, media: input.media, today })
      : null;
  const kind: FulfillmentKind = input.hazmat ? 'hazmat' : (detection?.kind ?? 'standard');
  const hazmat = kind === 'hazmat';

  const costBase = {
    discount: input.cost.discount,
    taxRate: input.cost.taxEnabled ? input.cost.taxRate : 0,
    roiMethod: input.cost.roiMethod,
  };

  // ---- FBA ----
  let nonPeak: FbaColumn | null = null;
  let peak: FbaColumn | null = null;
  if (tier && dims && input.fba.price != null && input.fba.price > 0) {
    const o = input.fbaOptions;
    const placementOpt = isStandardTier(tier) ? o.placement.standard : o.placement.bulky;
    const placement = isExtraLargeTier(tier)
      ? null
      : placementOpt.enabled
        ? placementFee({
            tier,
            dims,
            region: placementOpt.region,
            locations: placementOpt.locations,
          })
        : 0;
    const lowInventory = o.lowInventory.enabled
      ? lowInventoryFee({
          tier,
          dims,
          period: o.lowInventory.period,
          grocery: input.category === 'Grocery & Gourmet Food',
        })
      : isExtraLargeTier(tier)
        ? null
        : 0;
    const prep = o.prep.enabled ? prepChipsFee(o.prep.chips, o.prep.on) : 0;
    const other = o.other.enabled ? o.other.amount : 0;
    const shipToFba = !o.shipToFba.enabled
      ? 0
      : (o.shipToFba.override ??
        shipToFbaFee({
          tier,
          dims,
          ratePerLb: hazmat ? o.shipToFba.hazmatRatePerLb : o.shipToFba.ratePerLb,
          useDimWeight: o.shipToFba.useDimWeight,
        }));

    const column = (period: FeePeriod): FbaColumn | null => {
      const storage = o.storage.enabled
        ? storageFee({ tier, dims, months: o.storage.months, period, hazmat })
        : { ...storageFee({ tier, dims, months: 1, period, hazmat }), total: 0 };
      const fulfillmentAt = (price: number) =>
        resolveFulfillmentFee({
          tier,
          dims,
          catalogDims: input.catalogDims,
          price,
          period,
          kind,
          tiered: input.tiered,
          media: input.media,
          today,
        });
      const ff = fulfillmentAt(input.fba.price!);
      if (ff.fee == null) return null;
      const fixedFees = round2(
        storage.total + (placement ?? 0) + (lowInventory ?? 0) + prep + shipToFba,
      );
      const model: CostModel = {
        referralRule: rule,
        closingFee: closingAt(input, input.fba.price!),
        fulfillment: (price) => fulfillmentAt(price).fee ?? 0,
        fixedFees,
        inbound: shipToFba,
        other,
        buyCost: input.fba.buyCost,
        ...costBase,
      };
      const r = computeProfit(model, input.fba.price!);
      return {
        period,
        price: r.price,
        referral: r.referral,
        fulfillment: r.fulfillment,
        fulfillmentSource: ff.source,
        closing: r.closing,
        storage: storage.total,
        storageHint: storage.hint,
        placement,
        lowInventory,
        prep,
        other,
        shipToFba,
        fees: r.fees,
        expenses: r.expenses,
        buyCost: r.buyCost,
        tax: r.tax,
        net: r.net,
        roi: r.roi,
        margin: r.margin,
        model,
      };
    };
    nonPeak = column('nonPeak');
    peak = column('peak');
  }
  const main = input.usePeak ? peak : nonPeak;

  // ---- FBM ----
  let fbmColumn: FbmColumn | null = null;
  const fbmPrice = input.fbm.price;
  if (fbmPrice != null && fbmPrice > 0) {
    const o = input.fbmOptions;
    const needsDims = o.ship.enabled && o.ship.override == null && o.ship.method.method !== 'flat';
    if (!needsDims || dims) {
      const shipToBuyer = !o.ship.enabled
        ? 0
        : (o.ship.override ??
          mfnShippingFee({ dims: dims!, tier, method: o.ship.method, media: input.media, hazmat }));
      const other = o.other.enabled ? o.other.amount : 0;
      const model: CostModel = {
        referralRule: rule,
        closingFee: closingAt(input, fbmPrice),
        fulfillment: () => 0,
        fixedFees: shipToBuyer,
        inbound: shipToBuyer,
        other,
        buyCost: input.fbm.buyCost,
        ...costBase,
      };
      const r = computeProfit(model, fbmPrice);
      fbmColumn = {
        price: r.price,
        referral: r.referral,
        closing: r.closing,
        shipToBuyer,
        other,
        fees: r.fees,
        expenses: r.expenses,
        buyCost: r.buyCost,
        tax: r.tax,
        net: r.net,
        roi: r.roi,
        margin: r.margin,
        model,
      };
    }
  }

  return {
    tier,
    tierShort: tierShortName(tier),
    outbound: tier && dims ? outboundWeight(tier, dims, { media: input.media }) : null,
    dimWeight: tier && dims ? tierDimWeight(tier, dims) : null,
    cubicFeet: dims ? cubicFeet(dims) : null,
    referralRule: rule,
    referralSource: referral.source,
    kind,
    hazmat,
    todayPeriod,
    fba: {
      nonPeak,
      peak,
      main,
      breakeven: main ? breakevenPrice(main.model, main.price) : null,
      maxCost: main ? maxCost(main.model, main.price, input.cost.maxCost.fba) : null,
    },
    fbm: {
      column: fbmColumn,
      breakeven: fbmColumn ? breakevenPrice(fbmColumn.model, fbmColumn.price) : null,
      maxCost: fbmColumn ? maxCost(fbmColumn.model, fbmColumn.price, input.cost.maxCost.fbm) : null,
    },
  };
}

/** "15%", or the rate that applies at `price` for tiered rules ("8%" below $10 for Beauty). */
export function referralRateLabel(rule: ReferralRule, price: number | null): string {
  switch (rule.kind) {
    case 'fixed':
      return `$${rule.fixed.toFixed(2)}`;
    case 'percent':
      return `${rule.percent}%`;
    case 'range': {
      if (price == null || price <= 0) return rule.range.map((r) => `${r.percent}%`).join('/');
      const fee = referralFee(rule, price);
      return `${round2((fee / price) * 100)}%`;
    }
  }
}
