import { beforeEach, describe, expect, it } from 'vitest';
import {
  findWidgetAnchor,
  insertAtAnchor,
  isAtAnchor,
  readAsin,
  readTitle,
} from '../lib/amazonDom';

const URL_ASIN = 'https://www.amazon.com/Acme-Widget/dp/B0PARENT01?th=1';

function page(html: string) {
  document.body.innerHTML = html;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('readAsin', () => {
  it('prefers the buy-box hidden input over the URL (selected child of a parent link)', () => {
    page(
      '<form id="addToCart"><input type="hidden" id="ASIN" name="ASIN" value="B0CHILD002"></form>',
    );
    expect(readAsin(document, URL_ASIN)).toBe('B0CHILD002');
  });

  it('falls back through the alternative selectors', () => {
    page('<input type="hidden" name="ASIN.0" value="B0CHILD003">');
    expect(readAsin(document, URL_ASIN)).toBe('B0CHILD003');
    page('<div id="averageCustomerReviews" data-asin="b0child004"></div>');
    expect(readAsin(document, URL_ASIN)).toBe('B0CHILD004');
  });

  it('ignores malformed values and uses the URL', () => {
    page('<input type="hidden" id="ASIN" value="">');
    expect(readAsin(document, URL_ASIN)).toBe('B0PARENT01');
  });

  it('returns null when neither DOM nor URL has one', () => {
    expect(readAsin(document, 'https://www.amazon.com/s?k=widget')).toBeNull();
  });
});

describe('readTitle', () => {
  it('reads #productTitle with whitespace collapsed', () => {
    page('<h1 id="title"><span id="productTitle">\n   Acme   Widget,\n Blue  </span></h1>');
    expect(readTitle(document)).toBe('Acme Widget, Blue');
  });

  it('falls back to #title', () => {
    page('<h1 id="title">Fallback title</h1>');
    expect(readTitle(document)).toBe('Fallback title');
  });

  it('returns null when missing or empty', () => {
    page('<span id="productTitle">   </span>');
    expect(readTitle(document)).toBeNull();
  });
});

describe('widget anchor', () => {
  const DP = `
    <div id="centerCol">
      <div id="titleSection"><div id="title_feature_div"><div id="titleblock_feature_div"></div></div></div>
      <div id="averageCustomerReviews_feature_div"></div>
    </div>`;

  it('uses the title block first', () => {
    page(DP);
    expect(findWidgetAnchor(document)).toMatchObject({
      element: document.querySelector('#titleblock_feature_div'),
      append: 'after',
    });
  });

  it('falls back in order, ending with the top of #centerCol', () => {
    page(DP);
    document.querySelector('#titleblock_feature_div')!.remove();
    expect(findWidgetAnchor(document)?.element.id).toBe('title_feature_div');
    document.querySelector('#titleSection')!.remove();
    expect(findWidgetAnchor(document)).toMatchObject({
      element: document.querySelector('#centerCol'),
      append: 'first',
    });
  });

  it('returns null off product layouts', () => {
    page('<div id="search"></div>');
    expect(findWidgetAnchor(document)).toBeNull();
  });

  it('inserts below the anchor and detects when it has been moved away', () => {
    page(DP);
    const host = document.createElement('oa-lens-widget');
    const anchor = findWidgetAnchor(document)!;
    expect(isAtAnchor(host, anchor)).toBe(false);
    insertAtAnchor(host, anchor);
    expect(anchor.element.nextElementSibling).toBe(host);
    expect(isAtAnchor(host, anchor)).toBe(true);

    // Amazon re-renders the surrounding block on a variation switch: our host goes with it.
    const fresh = document.createElement('div');
    fresh.id = 'title_feature_div';
    fresh.innerHTML = '<div id="titleblock_feature_div"></div>';
    document.querySelector('#title_feature_div')!.replaceWith(fresh);
    expect(host.isConnected).toBe(false);
    expect(isAtAnchor(host, findWidgetAnchor(document)!)).toBe(false);
  });

  it('prepends into #centerCol', () => {
    page('<div id="centerCol"><div id="other"></div></div>');
    const host = document.createElement('oa-lens-widget');
    const anchor = findWidgetAnchor(document)!;
    insertAtAnchor(host, anchor);
    expect(document.querySelector('#centerCol')!.firstElementChild).toBe(host);
    expect(isAtAnchor(host, anchor)).toBe(true);
  });
});
