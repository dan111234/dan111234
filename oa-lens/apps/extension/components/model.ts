import type { ProductResult } from '@oa-lens/core';
import type { CatalogDTO, OfferCondition, OffersDTO, Settings } from '@oa-lens/shared';
import type { CalculatorValues, ProductOverrides } from '../lib/productInput';

/** What the widget sections share: calculation result plus setters for inputs and popup edits. */
export interface WidgetModel {
  asin: string;
  condition: OfferCondition;
  settings: Settings;
  catalog: CatalogDTO | null;
  offers: OffersDTO | null;
  result: ProductResult;
  values: CalculatorValues;
  overrides: ProductOverrides;
  linkSell: boolean;
  linkBuy: boolean;
  setSell: (column: 'fba' | 'fbm', value: number | null) => void;
  setBuy: (column: 'fba' | 'fbm', value: number | null) => void;
  setLinkSell: (linked: boolean) => void;
  setLinkBuy: (linked: boolean) => void;
  setOverrides: (patch: Partial<ProductOverrides>) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  openSettings: (tab?: string) => void;
}
