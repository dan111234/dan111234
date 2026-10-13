// Every Amazon DOM selector lives in this file (CLAUDE.md). Amazon changes its markup often, so
// each lookup tries a list of alternatives in order. Keep at least three entries per list.
import { extractAsinFromUrl, isValidAsin } from '@oa-lens/core';

export const SELECTORS = {
  /**
   * The current (selected-variation) ASIN. The buy-box form's hidden input is preferred over the
   * URL because a /dp/ link can carry the parent ASIN while the page shows a child.
   */
  asin: [
    'input#ASIN',
    'input[name="ASIN"]',
    'input[name="ASIN.0"]',
    '#averageCustomerReviews[data-asin]',
  ],
  title: ['#productTitle', '#title', '#title_feature_div h1'],
} as const;

/** docs/01 §3: insert right below the title block; first match wins. */
export const WIDGET_ANCHORS = [
  { selector: '#titleblock_feature_div', append: 'after' },
  { selector: '#title_feature_div', append: 'after' },
  { selector: '#titleSection', append: 'after' },
  { selector: '#centerCol', append: 'first' },
] as const;

export type AnchorAppend = (typeof WIDGET_ANCHORS)[number]['append'];

export interface WidgetAnchor {
  element: Element;
  append: AnchorAppend;
}

export function queryFirst(root: ParentNode, selectors: readonly string[]): Element | null {
  for (const selector of selectors) {
    const el = root.querySelector(selector);
    if (el) return el;
  }
  return null;
}

function asinFromElement(el: Element): string | null {
  const raw = (el instanceof HTMLInputElement ? el.value : el.getAttribute('data-asin')) ?? '';
  const asin = raw.trim().toUpperCase();
  return isValidAsin(asin) ? asin : null;
}

export function readAsin(doc: Document, url: string): string | null {
  for (const selector of SELECTORS.asin) {
    const el = doc.querySelector(selector);
    const asin = el && asinFromElement(el);
    if (asin) return asin;
  }
  return extractAsinFromUrl(url);
}

export function readTitle(doc: Document): string | null {
  const text = queryFirst(doc, SELECTORS.title)?.textContent?.replace(/\s+/g, ' ').trim();
  return text || null;
}

export function findWidgetAnchor(doc: Document): WidgetAnchor | null {
  for (const { selector, append } of WIDGET_ANCHORS) {
    const element = doc.querySelector(selector);
    if (element) return { element, append };
  }
  return null;
}

/** True when `host` already sits where `anchor` says it should. */
export function isAtAnchor(host: Element, anchor: WidgetAnchor): boolean {
  if (!host.isConnected) return false;
  return anchor.append === 'after'
    ? anchor.element.nextElementSibling === host
    : anchor.element.firstElementChild === host;
}

export function insertAtAnchor(host: Element, anchor: WidgetAnchor): void {
  if (anchor.append === 'after') anchor.element.after(host);
  else anchor.element.prepend(host);
}
