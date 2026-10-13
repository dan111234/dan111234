import { render } from 'preact';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import { ProductWidget } from '../../components/ProductWidget';
import {
  findWidgetAnchor,
  insertAtAnchor,
  isAtAnchor,
  readAsin,
  readTitle,
} from '../../lib/amazonDom';
import '../../styles/tailwind.css';

const RESYNC_DEBOUNCE_MS = 150;

export default defineContentScript({
  // amazon.com only (docs/02 §L); other marketplaces are out of scope for now.
  matches: [
    '*://www.amazon.com/dp/*',
    '*://www.amazon.com/*/dp/*',
    '*://www.amazon.com/gp/product/*',
    '*://www.amazon.com/gp/aw/d/*',
  ],
  runAt: 'document_end',
  cssInjectionMode: 'ui',

  async main(ctx) {
    let asin: string | null = null;
    let anchor = findWidgetAnchor(document);

    const draw = (container: HTMLElement) =>
      render(<ProductWidget asin={asin} domTitle={readTitle(document)} />, container);

    const ui = await createShadowRootUi(ctx, {
      name: 'oa-lens-widget',
      position: 'inline',
      // Position is handled by sync() below so the anchor can change over the page's lifetime.
      anchor: () => anchor?.element,
      append: (_anchorEl, host) => {
        if (anchor) insertAtAnchor(host, anchor);
      },
      onMount: (container) => {
        draw(container);
        return container;
      },
      onRemove: (container) => {
        if (container) render(null, container);
      },
    });

    // Keeps the widget under the title and in step with the selected variation. Amazon swaps
    // page fragments on variation change, so this runs on URL changes and DOM mutations.
    const sync = () => {
      if (ctx.isInvalid) return;
      anchor = findWidgetAnchor(document);
      if (!anchor) return;
      const nextAsin = readAsin(document, location.href);
      const moved = !isAtAnchor(ui.shadowHost, anchor);
      const changed = nextAsin !== asin;
      asin = nextAsin;
      if (moved) ui.mount();
      else if (changed) draw(ui.uiContainer);
    };

    let pending: number | undefined;
    const scheduleSync = () => {
      if (pending !== undefined) return;
      pending = ctx.setTimeout(() => {
        pending = undefined;
        sync();
      }, RESYNC_DEBOUNCE_MS);
    };

    sync();
    ctx.addEventListener(window, 'wxt:locationchange', scheduleSync);
    // Whole body: Amazon may replace the containers we would otherwise watch. sync() is cheap and
    // debounced, and mutations inside our own shadow root are not reported here.
    const observer = new MutationObserver(scheduleSync);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['value', 'data-asin'],
    });
    ctx.onInvalidated(() => observer.disconnect());
  },
});
