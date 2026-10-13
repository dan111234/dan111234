import { describe, expect, it } from 'vitest';
import { normalizeCatalogItem, type RawCatalogItem } from '../src/spapi/catalog';
import fixture from './fixtures/catalog-item.json';

describe('normalizeCatalogItem', () => {
  const dto = normalizeCatalogItem(fixture as RawCatalogItem, 'us');

  it('reads summary fields', () => {
    expect(dto).toMatchObject({
      asin: 'B0TESTCHLD',
      title: 'Acme Widget, Blue, Large',
      brand: 'Acme',
      manufacturer: 'Acme Manufacturing Co.',
      model: 'AW-100',
      productType: 'HOME',
      itemClassification: 'VARIATION_CHILD',
      websiteDisplayGroup: 'home_display_on_website',
      listPrice: 24.99,
      launchDate: '2021-03-15T07:00:01.000Z',
    });
  });

  it('reads variation parent and theme', () => {
    expect(dto.parentAsin).toBe('B0TESTPRNT');
    expect(dto.childAsins).toEqual([]);
    expect(dto.variationTheme).toBe('SIZE_NAME/COLOR_NAME');
  });

  it('uses the display group rank first', () => {
    expect(dto.salesRank).toEqual({
      rank: 45210,
      category: 'Home & Kitchen',
      source: 'displayGroup',
    });
    expect(dto.classificationRanks).toEqual([
      { id: '3734591', title: 'Storage Baskets', rank: 112 },
    ]);
  });

  it('falls back to the classification rank', () => {
    const raw = structuredClone(fixture) as RawCatalogItem;
    raw.salesRanks![0]!.displayGroupRanks = [];
    expect(normalizeCatalogItem(raw, 'us').salesRank).toEqual({
      rank: 112,
      category: 'Storage Baskets',
      source: 'classification',
    });
  });

  it('returns null rank when there is none', () => {
    const raw = structuredClone(fixture) as RawCatalogItem;
    delete raw.salesRanks;
    expect(normalizeCatalogItem(raw, 'us').salesRank).toBeNull();
  });

  it('groups and de-duplicates identifiers', () => {
    expect(dto.identifiers).toEqual({
      upc: ['012345678905', '012345678912'],
      ean: ['0012345678905'],
      isbn: [],
      gtin: [],
    });
  });

  it('picks the largest MAIN image', () => {
    expect(dto.image).toBe('https://m.media-amazon.com/images/I/main-large.jpg');
  });

  it('keeps package dimensions in inches and pounds', () => {
    expect(dto.packageDimensions).toEqual({ length: 12.2, width: 8.4, height: 3.1, weight: 1.35 });
  });

  it('converts metric item dimensions', () => {
    expect(dto.itemDimensions).toEqual({ length: 20, width: 5, height: 10, weight: 2.2046 });
  });

  it('handles a bare item', () => {
    const bare = normalizeCatalogItem({ asin: 'B000000001' }, 'us');
    expect(bare).toMatchObject({
      asin: 'B000000001',
      title: null,
      brand: null,
      salesRank: null,
      packageDimensions: null,
      image: null,
    });
  });
});
