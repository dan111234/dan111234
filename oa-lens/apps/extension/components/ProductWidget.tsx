// Product page main widget (docs/02). Data comes from the Worker bundle; numbers from packages/core.
import { calculateProduct, daysSince, formatTopPercent, topPercent } from '@oa-lens/core';
import {
  DEFAULT_SETTINGS,
  type OfferCondition,
  type ProductBundleDTO,
  type SalesRank,
  type Settings,
} from '@oa-lens/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { BoughtPastMonth } from '../lib/amazonDom';
import {
  hazmatBadge,
  hazmatDetail,
  HAZMAT_BLOCKED,
  HAZMAT_FULFILLABLE,
  keepaHazmatBadge,
} from '../lib/hazmatCodes';
import { send } from '../lib/messages';
import {
  buildProductInput,
  defaultSellPrice,
  type CalculatorValues,
  type ProductOverrides,
} from '../lib/productInput';
import { saveSettings, watchSettings } from '../lib/settings';
import type { ClientError } from '../lib/workerClient';
import { Calculator, OfferSummary, ProductBox, Targets } from './Calculator';
import { Header } from './Header';
import { KeepaMetrics, KeepaTable, KeepaTablePill, type KeepaState } from './KeepaSection';
import type { WidgetModel } from './model';
import { SettingsModal, type SettingsTab } from './SettingsModal';
import { cx, SectionPill } from './ui';

interface Props {
  asin: string | null;
  /** #productTitle text, shown until the catalog title arrives (docs/06: CAT -> DOM). */
  domTitle: string | null;
  /** "1K+ bought in past month" from the page (docs/06 30d Sales). */
  bought: BoughtPastMonth | null;
}

type BundleState =
  | { status: 'loading' }
  | { status: 'ready'; bundle: ProductBundleDTO }
  | { status: 'error'; error: ClientError };

/** docs/02 §L messages. */
export function errorMessage(error: ClientError): string {
  switch (error.code) {
    case 'NOT_CONFIGURED':
      return '옵션에서 Worker URL과 공유키를 입력하세요';
    case 'NETWORK':
      return '서버에 연결할 수 없습니다. 옵션에서 Worker URL을 확인하세요';
    case 'KEY_MISMATCH':
      return '공유키가 Worker와 다릅니다. 옵션에서 공유키를 확인하세요';
    case 'AUTH':
      return 'SP-API 인증 오류 - Worker의 refresh token을 확인하세요';
    case 'RATE_LIMIT':
      return `요청 한도 초과 - ${error.retryAfter ?? 2}초 후 다시 시도하세요`;
    case 'NOT_FOUND':
      return error.message === 'No ASIN on this page'
        ? '이 페이지에서 ASIN을 찾지 못했습니다'
        : '카탈로그에서 이 ASIN을 찾을 수 없습니다';
    default:
      return error.message;
  }
}

const FONT_SCALE: Record<Settings['displayFontSize'], number> = {
  smaller: 0.9,
  small: 0.95,
  default: 1,
  large: 1.05,
  larger: 1.1,
};

const EMPTY_VALUES: CalculatorValues = { sellFba: null, sellFbm: null, buyFba: 0, buyFbm: 0 };
const WIDE_PX = 440;

function Skeleton({ width }: { width: string }) {
  return (
    <span
      class="oal-inline-block oal-h-[12px] oal-animate-pulse oal-rounded oal-bg-gray-200 oal-align-middle"
      style={{ width }}
    />
  );
}

function RankLine({ rank, loading }: { rank: SalesRank | null; loading: boolean }) {
  if (loading) return <Skeleton width="220px" />;
  if (!rank) return <span class="oal-text-[19px] oal-text-[#565959]">--</span>;
  const pct = topPercent(rank.rank, rank.category);
  return (
    <span class="oal-flex oal-min-w-0 oal-items-center oal-justify-center oal-gap-[10px]">
      <span
        class="oal-truncate oal-text-[19px] oal-font-medium oal-text-[#3d8b37]"
        title={`#${rank.rank.toLocaleString('en-US')} in ${rank.category}`}
      >
        {rank.rank.toLocaleString('en-US')} in {rank.category}
      </span>
      {pct != null && (
        <span
          class="oal-shrink-0 oal-rounded-[4px] oal-bg-[#eee] oal-px-[6px] oal-py-[2px] oal-text-[12px] oal-text-[#565959]"
          title="Current rank ÷ estimated number of products in the category. A rough sales-speed guide."
        >
          {formatTopPercent(pct)}
        </span>
      )}
    </span>
  );
}

export function ProductWidget({ asin, domTitle, bought }: Props) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [condition, setCondition] = useState<OfferCondition | null>(null);
  const [state, setState] = useState<BundleState>({ status: 'loading' });
  const [parentRank, setParentRank] = useState<SalesRank | null | 'loading'>(null);
  const [reload, setReload] = useState<{ n: number; fresh: boolean }>({ n: 0, fresh: false });
  const [values, setValues] = useState<CalculatorValues>(EMPTY_VALUES);
  const [touched, setTouched] = useState({ sell: false, buy: false });
  const [linkSell, setLinkSell] = useState(true);
  const [linkBuy, setLinkBuy] = useState(true);
  const [overrides, setOverridesState] = useState<ProductOverrides>({});
  const [targetsOpen, setTargetsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null);
  const [wide, setWide] = useState(true);
  const [keepa, setKeepa] = useState<KeepaState>({ status: 'idle' });
  const [keepaOffers, setKeepaOffers] = useState<KeepaState>({ status: 'idle' });
  const [tableOpen, setTableOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(
    () =>
      watchSettings((s) => {
        setSettings(s);
        setSettingsLoaded(true);
      }),
    [],
  );

  // Each product starts from the default condition with fresh inputs.
  useEffect(() => {
    if (!settingsLoaded) return;
    setCondition(settings.defaultCondition);
    setValues(EMPTY_VALUES);
    setTouched({ sell: false, buy: false });
    setOverridesState({});
  }, [asin, settingsLoaded]);

  useEffect(() => {
    if (!root.current) return;
    const ro = new ResizeObserver(([entry]) => setWide((entry?.contentRect.width ?? 0) >= WIDE_PX));
    ro.observe(root.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!asin) {
      setState({ status: 'error', error: { code: 'NOT_FOUND', message: 'No ASIN on this page' } });
      return;
    }
    if (!condition) return;
    let cancelled = false;
    setState((prev) =>
      prev.status === 'ready' && prev.bundle.asin === asin ? prev : { status: 'loading' },
    );
    setParentRank(null);
    void (async () => {
      const res = await send({ type: 'product', asin, condition, fresh: reload.fresh });
      if (cancelled) return;
      if (!res.ok) {
        setState({ status: 'error', error: res.error });
        return;
      }
      setState({ status: 'ready', bundle: res.data });
      // docs/06: a child ASIN without its own rank shows the parent's rank.
      const cat = res.data.catalog.ok ? res.data.catalog.data : null;
      if (cat && !cat.salesRank && cat.parentAsin && cat.parentAsin !== asin) {
        setParentRank('loading');
        const parent = await send({ type: 'catalog', asin: cat.parentAsin });
        if (!cancelled) setParentRank(parent.ok ? parent.data.salesRank : null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [asin, condition, reload]);

  // Keepa (docs/01 §5): stats automatically (1 token); offers (FBA/Buy Box averages, ~6 tokens)
  // only when the 30/90/180 table is open. A pinned table loads the offers version directly.
  const loadKeepa = useCallback(async (target: string, offers: boolean, auto: boolean) => {
    const set = offers ? setKeepaOffers : setKeepa;
    set({ status: 'loading' });
    const res = await send({ type: 'keepa', asin: target, offers, auto });
    if (target !== currentAsin.current) return;
    const next: KeepaState = res.ok
      ? { status: 'ready', product: res.data.products.find((p) => p.asin === target) ?? null }
      : { status: 'error', error: res.error };
    set(next);
    if (offers && res.ok) setKeepa((k) => (k.status === 'ready' ? k : next));
  }, []);
  const currentAsin = useRef<string | null>(null);

  useEffect(() => {
    currentAsin.current = asin;
    if (!asin || !settingsLoaded) return;
    const pinned = settings.autoKeepaTable;
    setTableOpen(pinned);
    setKeepaOffers({ status: 'idle' });
    if (pinned) {
      setKeepa({ status: 'loading' });
      void loadKeepa(asin, true, true);
    } else {
      void loadKeepa(asin, false, true);
    }
  }, [asin, settingsLoaded]);

  useEffect(() => {
    if (tableOpen && asin && keepaOffers.status === 'idle') {
      void loadKeepa(asin, true, settings.autoKeepaTable);
    }
  }, [tableOpen, asin, keepaOffers.status]);

  const bundle = state.status === 'ready' && state.bundle.asin === asin ? state.bundle : null;
  const catalog = bundle?.catalog.ok ? bundle.catalog.data : null;
  const offers = bundle?.offers.ok ? bundle.offers.data : null;
  const tiered = bundle?.feesTiered.ok ? bundle.feesTiered.data : null;
  const restrictions = bundle?.restrictions.ok ? bundle.restrictions.data : null;
  const eligibility = bundle?.eligibility.ok ? bundle.eligibility.data : null;
  const savedCost = bundle?.buyCost.ok ? bundle.buyCost.data : null;

  // Defaults once the bundle arrives, unless the user already typed (docs/02 §C-2).
  useEffect(() => {
    if (!bundle) return;
    setValues((v) => {
      const next = { ...v };
      if (!touched.sell) {
        next.sellFba = defaultSellPrice(offers, settings.sellPriceOrderFBA);
        next.sellFbm = defaultSellPrice(offers, settings.sellPriceOrderFBM);
      }
      if (!touched.buy) {
        const list = settings.useListPrice ? (offers?.listPrice ?? catalog?.listPrice ?? 0) : 0;
        next.buyFba = savedCost?.fba ?? list;
        next.buyFbm = savedCost?.fbm ?? savedCost?.fba ?? list;
      }
      return next;
    });
  }, [bundle, settings.sellPriceOrderFBA, settings.sellPriceOrderFBM, settings.useListPrice]);

  // Save the buy cost 0.8 s after the last edit (docs/01 §2-7).
  useEffect(() => {
    if (!touched.buy || !asin || !condition || !settings.saveBuycost) return;
    const t = window.setTimeout(() => {
      void send({ type: 'saveBuyCost', asin, condition, fba: values.buyFba, fbm: values.buyFbm });
    }, 800);
    return () => window.clearTimeout(t);
  }, [values.buyFba, values.buyFbm, touched.buy]);

  const keepaProduct =
    (keepaOffers.status === 'ready' ? keepaOffers.product : null) ??
    (keepa.status === 'ready' ? keepa.product : null);
  const keepaHazmat = keepaProduct?.hazmat ?? null;
  const reasons = eligibility?.reasons ?? [];
  // Red Haz (eligibility or Keepa) bills hazmat storage and ship-to-FBA rates; yellow does not.
  const eligibilityHazmat =
    reasons.some((r) => ([...HAZMAT_BLOCKED, ...HAZMAT_FULFILLABLE] as string[]).includes(r)) ||
    keepaHazmatBadge(keepaHazmat) === 'red';

  const result = useMemo(
    () =>
      calculateProduct(
        buildProductInput({
          catalog,
          tiered,
          hazmat: eligibilityHazmat,
          settings,
          values,
          overrides,
        }),
      ),
    [catalog, tiered, eligibilityHazmat, settings, values, overrides],
  );

  const updateSettings = useCallback(
    (patch: Partial<Settings>) => {
      const next = { ...settings, ...patch };
      setSettings(next);
      void saveSettings(next);
    },
    [settings],
  );

  const model: WidgetModel = {
    asin: asin ?? '',
    condition: condition ?? 'new',
    settings,
    catalog,
    offers,
    result,
    values,
    overrides,
    linkSell,
    linkBuy,
    setSell: (column, value) => {
      setTouched((t) => ({ ...t, sell: true }));
      setValues((v) =>
        linkSell
          ? { ...v, sellFba: value, sellFbm: value }
          : column === 'fba'
            ? { ...v, sellFba: value }
            : { ...v, sellFbm: value },
      );
    },
    setBuy: (column, value) => {
      const cost = value ?? 0;
      setTouched((t) => ({ ...t, buy: true }));
      setValues((v) =>
        linkBuy
          ? { ...v, buyFba: cost, buyFbm: cost }
          : column === 'fba'
            ? { ...v, buyFba: cost }
            : { ...v, buyFbm: cost },
      );
    },
    setLinkSell,
    setLinkBuy,
    setOverrides: (patch) => setOverridesState((o) => ({ ...o, ...patch })),
    updateSettings,
    openSettings: (tab) => setSettingsTab((tab as SettingsTab) ?? 'fba'),
  };

  const loading = state.status === 'loading';
  const rank = catalog?.salesRank ?? (parentRank !== 'loading' ? parentRank : null);
  const title = catalog?.title ?? domTitle ?? '';
  const upc = catalog?.identifiers.upc[0] ?? catalog?.identifiers.ean[0] ?? null;
  const listed = daysSince(keepaProduct?.listedSince ?? catalog?.launchDate ?? null);
  const keepaProps = {
    keepa,
    keepaOffers,
    bought,
    condition: condition ?? 'new',
    settings,
    tableOpen,
    onToggleTable: () => setTableOpen((o) => !o),
    onPin: (pinned: boolean) => updateSettings({ autoKeepaTable: pinned }),
    onPrice: (price: number) => model.setSell('fba', price),
  } as const;
  const restrictionsError = bundle ? !bundle.restrictions.ok : false;
  const transparency = (restrictions ?? []).some((r) => r.transparency);
  const fatal = state.status === 'error' ? state.error : null;
  const partErrors = bundle
    ? (
        [
          ['카탈로그', bundle.catalog],
          ['오퍼', bundle.offers],
          ['수수료 견적', bundle.feesTiered],
        ] as const
      ).filter(([, p]) => !p.ok)
    : [];

  return (
    <div
      ref={root}
      class="oal-my-[8px] oal-rounded-[6px] oal-border oal-border-[#d5d9d9] oal-bg-white oal-font-sans oal-text-[13px] oal-leading-[1.35] oal-text-[#0f1111]"
      style={{ zoom: FONT_SCALE[settings.displayFontSize] }}
    >
      <Header
        asin={asin ?? ''}
        title={title}
        upc={upc}
        restrictions={restrictions}
        restrictionsError={restrictionsError}
        used={condition === 'used'}
        hazmat={hazmatBadge(
          eligibility,
          keepaHazmat,
          result.kind === 'hazmat' && !eligibilityHazmat,
        )}
        hazmatDetail={hazmatDetail(keepaHazmat)}
        transparency={transparency}
        onSettings={() => setSettingsTab('fba')}
        onOptions={() => void send({ type: 'openOptions' })}
        onRefreshRestrictions={() => setReload((r) => ({ n: r.n + 1, fresh: true }))}
      />

      {fatal && (
        <div class="oal-flex oal-items-center oal-justify-between oal-gap-2 oal-bg-[#fde8ea] oal-px-[10px] oal-py-[6px] oal-text-[12px] oal-text-[#b12704]">
          <span>{errorMessage(fatal)}</span>
          <button
            type="button"
            class="oal-shrink-0 oal-rounded oal-border oal-border-[#e5a0a8] oal-bg-white oal-px-2 oal-py-[1px] hover:oal-bg-[#fff5f5]"
            onClick={() =>
              fatal.code === 'NOT_CONFIGURED' || fatal.code === 'KEY_MISMATCH'
                ? void send({ type: 'openOptions' })
                : setReload((r) => ({ n: r.n + 1, fresh: false }))
            }
          >
            {fatal.code === 'NOT_CONFIGURED' || fatal.code === 'KEY_MISMATCH'
              ? '옵션 열기'
              : '재시도'}
          </button>
        </div>
      )}
      {partErrors.length > 0 && (
        <div class="oal-flex oal-items-center oal-justify-between oal-gap-2 oal-bg-[#fff8e5] oal-px-[10px] oal-py-[4px] oal-text-[12px] oal-text-[#8a5a00]">
          <span>
            {partErrors
              .map(([name, p]) => `${name}: ${p.ok ? '' : errorMessage(p.error)}`)
              .join(' · ')}
          </span>
          <button
            type="button"
            class="oal-shrink-0 oal-underline"
            onClick={() => setReload((r) => ({ n: r.n + 1, fresh: false }))}
          >
            재시도
          </button>
        </div>
      )}

      {/* §B top widget */}
      <div class="oal-relative oal-border-b oal-border-[#e3e6e6] oal-px-[10px] oal-pb-[16px] oal-pt-[12px] oal-text-center">
        {parentRank === 'loading' && !catalog?.salesRank ? (
          <span class="oal-text-[#565959]">loading parent rank...</span>
        ) : (
          <RankLine rank={rank} loading={loading} />
        )}
        <KeepaMetrics {...keepaProps} />
        <KeepaTablePill {...keepaProps} />
      </div>
      {tableOpen && <KeepaTable {...keepaProps} />}

      {/* §C calculator + §D product box */}
      <div
        class={cx(
          'oal-flex oal-gap-[8px] oal-px-[8px] oal-py-[12px]',
          wide ? 'oal-flex-row' : 'oal-flex-col',
        )}
      >
        <div class="oal-min-w-0 oal-flex-1">
          <Calculator model={model} />
        </div>
        <div class={cx(wide ? 'oal-w-[36%] oal-min-w-[168px] oal-shrink-0' : 'oal-w-full')}>
          <ProductBox model={model} listedDays={listed} />
        </div>
      </div>

      {/* §E Targets */}
      <div class="oal-relative oal-border-t oal-border-[#e3e6e6]">
        <SectionPill
          label="Targets"
          open={targetsOpen}
          onToggle={() => setTargetsOpen(!targetsOpen)}
          class="oal-absolute oal-left-[8px] oal-top-[-10px]"
        />
        <div class={cx(targetsOpen ? 'oal-pt-[16px]' : 'oal-pt-[4px]')}>
          {targetsOpen && <Targets model={model} />}
        </div>
      </div>

      {/* §F offer line */}
      <div class="oal-border-t oal-border-[#e3e6e6]">
        <OfferSummary model={model} />
      </div>

      {/* §H bottom bar */}
      <div class="oal-flex oal-items-center oal-justify-center oal-rounded-b-[6px] oal-border-t oal-border-[#e3e6e6] oal-px-[10px] oal-py-[6px]">
        <button
          type="button"
          title="Switch between New and Used offers"
          class="oal-rounded-[4px] oal-px-[10px] oal-py-[2px] oal-text-[12px] oal-font-bold hover:oal-bg-[#f0f0f0]"
          onClick={() => setCondition(condition === 'used' ? 'new' : 'used')}
        >
          {condition === 'used' ? 'Used' : 'New'}
        </button>
      </div>

      {settingsTab && (
        <SettingsModal
          settings={settings}
          tab={settingsTab}
          onTab={setSettingsTab}
          onChange={(next) => {
            setSettings(next);
            void saveSettings(next);
          }}
          onClose={() => setSettingsTab(null)}
        />
      )}
    </div>
  );
}
