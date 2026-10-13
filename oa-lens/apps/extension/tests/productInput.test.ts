import { calculateProduct } from '@oa-lens/core';
import { DEFAULT_SETTINGS, mergeSettings, type CatalogDTO, type OffersDTO } from '@oa-lens/shared';
import { describe, expect, it } from 'vitest';
import {
  buildProductInput,
  catalogDims,
  categoryName,
  defaultSellPrice,
  mfnShipMethod,
} from '../lib/productInput';

const catalog = {
  asin: 'B0FBP3N9RK',
  websiteDisplayGroup: 'fashion_display_on_website',
  websiteDisplayGroupName: 'Fashion',
  productType: 'SHOES',
  packageDimensions: { length: 12.4016, width: 7.5591, height: 4.5669, weight: 1.8078 },
  itemDimensions: null,
} as unknown as CatalogDTO;

const offers: OffersDTO = {
  asin: 'B0FBP3N9RK',
  condition: 'new',
  counts: { fba: 2, fbm: 3, total: 5 },
  lowestFba: 93.47,
  lowestFbm: 133.7,
  buyBox: 93.47,
  buyBoxEligible: { fba: 2, fbm: 3 },
  amazon: 112.79,
  listPrice: 169.95,
  cpt: null,
  offers: [],
};

describe('catalog helpers', () => {
  it('rounds catalog dims like the widget', () => {
    expect(catalogDims(catalog)).toEqual({ length: 12.4, width: 7.56, height: 4.57, weight: 1.8 });
    expect(catalogDims(null)).toBeNull();
    expect(catalogDims({ ...catalog, packageDimensions: null } as CatalogDTO)).toBeNull();
  });
  it('category name from the display group', () => {
    expect(categoryName(catalog)).toBe('Clothing, Shoes & Jewelry');
  });
});

describe('defaultSellPrice (docs/04 §6)', () => {
  it('orders', () => {
    expect(defaultSellPrice(offers, 'buybox_lowprice')).toBe(93.47);
    expect(defaultSellPrice({ ...offers, buyBox: null }, 'buybox_lowprice')).toBe(93.47);
    expect(defaultSellPrice(offers, 'lowfbm_buybox_lowprice')).toBe(133.7);
    expect(defaultSellPrice({ ...offers, lowestFba: null }, 'lowfba_buybox_lowprice')).toBe(93.47);
    expect(defaultSellPrice(null, 'buybox_lowprice')).toBeNull();
  });
  it('used takes the lowest used price', () => {
    expect(
      defaultSellPrice(
        { ...offers, condition: 'used', lowestFba: 50, lowestFbm: 45 },
        'buybox_lowprice',
      ),
    ).toBe(45);
  });
});

describe('buildProductInput', () => {
  const values = { sellFba: 93.47, sellFbm: 93.47, buyFba: 0, buyFbm: 0 };
  const tiered = {
    '9': { ReferralFee: 1.35, FBAFees: 6.45, VariableClosingFee: 0, PerItemFee: 0, Promotion: 0 },
    '13': { ReferralFee: 1.95, FBAFees: 7.3, VariableClosingFee: 0, PerItemFee: 0, Promotion: 0 },
    '350': { ReferralFee: 52.5, FBAFees: 7.57, VariableClosingFee: 0, PerItemFee: 0, Promotion: 0 },
  };

  it('reproduces screenshot 01 with default settings and Peak rate', () => {
    const settings = { ...DEFAULT_SETTINGS, usePeakFees: true };
    const r = calculateProduct(
      buildProductInput({
        catalog,
        tiered,
        hazmat: false,
        settings,
        values,
        overrides: {},
        today: new Date('2026-10-13T12:00:00Z'),
      }),
    );
    expect(r.fba.main!.net).toBe(70.73);
    expect(r.fbm.column!.net).toBe(70.58);
    expect(r.fba.breakeven).toBe(9.96);
    expect(r.fbm.breakeven).toBe(10.44);
  });

  it('popup overrides win over settings', () => {
    const input = buildProductInput({
      catalog,
      tiered,
      hazmat: false,
      settings: DEFAULT_SETTINGS,
      values,
      overrides: { storageMonths: 3, discount: 10, taxEnabled: false, fbmShip: 5, prepOn: ['bag'] },
    });
    expect(input.fbaOptions.storage.months).toBe(3);
    expect(input.cost.discount).toBeCloseTo(0.1);
    expect(input.cost.taxEnabled).toBe(false);
    expect(input.fbmOptions.ship.override).toBe(5);
    expect(input.fbaOptions.prep.on).toEqual(['bag']);
  });

  it('ship method from settings and overrides', () => {
    const s = mergeSettings({ us: { mfnShipEstimateMethod: 'pound', mfnShipPoundPrice: 1.5 } });
    expect(mfnShipMethod(s, {})).toEqual({ method: 'pound', pricePerLb: 1.5 });
    expect(mfnShipMethod(s, { fbmShipMethod: 'usps', fbmZone: 8 })).toMatchObject({
      method: 'usps',
      zone: 8,
      service: 'ground_advantage',
    });
  });
});

describe('mergeSettings', () => {
  it('keeps valid values, drops unknown keys and bad types', () => {
    const s = mergeSettings({
      decimalProfit: 2,
      roiMethod: 'nope',
      usePeakFees: 'yes',
      bogus: 1,
      us: {
        salesTax: 7,
        mfnShipZone: 6,
        fbaExtrasChips: [{ id: 'bag', label: 'BagBagBag', amount: 1 }],
      },
    });
    expect(s.decimalProfit).toBe(2);
    expect(s.roiMethod).toBe('buyCostOnly');
    expect(s.usePeakFees).toBe(false);
    expect('bogus' in s).toBe(false);
    expect(s.us.salesTax).toBe(7);
    expect(s.us.mfnShipZone).toBe(5);
    expect(s.us.fbaExtrasChips).toEqual([{ id: 'bag', label: 'BagBag', amount: 1 }]);
    expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
});
