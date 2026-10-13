// Calculator (docs/02 §C), product box (§D), offer line (§F) and Targets (§E).
import {
  closeFbaOfferCount,
  formatPercent,
  parseTargetList,
  targetsTable,
  type Dims,
  type MaxCostResult,
} from '@oa-lens/core';
import { ChevronDown, MapPin, Pencil, Trophy } from 'lucide-preact';
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { catalogDims } from '../lib/productInput';
import { FbaFeesPopup, FbmFeesPopup } from './FeePopups';
import { LtsfPopup, OrderTotalsPopup, PrepPopup, WeightPopup } from './InfoPopups';
import type { WidgetModel } from './model';
import { CopyText, cx, money, MoneyInput, Popover, SectionPill, Switch } from './ui';

function LinkToggle(props: { linked: boolean; onChange: (linked: boolean) => void }) {
  return (
    <button
      type="button"
      title={
        props.linked ? 'FBM and FBA move together. Click to unlink.' : 'Click to link FBM and FBA'
      }
      class="oal-w-full oal-text-center oal-text-[15px] oal-text-[#8a8a8a] hover:oal-text-black"
      onClick={() => props.onChange(!props.linked)}
    >
      {props.linked ? '=' : '≠'}
    </button>
  );
}

function NetPill(props: {
  value: number | null;
  popup: ComponentChildren;
  width: number;
  title: string;
}) {
  const negative = (props.value ?? 0) < 0;
  return (
    <Popover
      class="oal-w-full"
      width={props.width}
      closable
      panelClass="oal-pt-[4px]"
      trigger={({ toggle, open }) => (
        <button
          type="button"
          title={props.title}
          onClick={toggle}
          class={cx(
            'oal-flex oal-h-[30px] oal-w-full oal-items-center oal-justify-between oal-rounded-[4px] oal-px-[8px]',
            negative ? 'oal-bg-[#fde8ea]' : 'oal-bg-[#e6f4e4]',
            open && 'oal-ring-1 oal-ring-[#3d8b37]',
          )}
        >
          <ChevronDown size={14} class="oal-text-[#777]" />
          <span class="oal-flex oal-items-baseline oal-gap-[4px]">
            <span
              class={cx(
                'oal-text-[17px] oal-font-bold',
                negative ? 'oal-text-[#cc0c39]' : 'oal-text-[#3d8b37]',
              )}
            >
              {props.value == null ? 'N/A' : props.value.toFixed(2)}
            </span>
          </span>
        </button>
      )}
    >
      {props.popup}
    </Popover>
  );
}

function maxCostTitle(
  mc: MaxCostResult | null,
  rules: { net: number; roi: number; margin: number },
) {
  if (!mc) return '';
  const label =
    mc.rule === 'net'
      ? `Net ≥ $${rules.net}`
      : mc.rule === 'roi'
        ? `ROI ≥ ${rules.roi}%`
        : `Margin ≥ ${rules.margin}%`;
  return `Based on ${label}`;
}

export function Calculator({ model }: { model: WidgetModel }) {
  const { result, settings, values, offers } = model;
  const hideFbm = settings.hideFBMColumn;
  const fba = result.fba.main;
  const fbm = result.fbm.column;
  const s = settings;
  const fbaRules = {
    net: s.maxBuyCostFBAByNet,
    roi: s.maxBuyCostFBAByROI,
    margin: s.maxBuyCostFBAByMargin,
  };
  const fbmRules = {
    net: s.maxBuyCostMFNByNet,
    roi: s.maxBuyCostMFNByROI,
    margin: s.maxBuyCostMFNByMargin,
  };
  const noRules = (r: typeof fbaRules) => !r.net && !r.roi && !r.margin;
  const showRoi = s.alwaysShowROI && (values.buyFba > 0 || values.buyFbm > 0);
  const grid = hideFbm
    ? 'oal-grid-cols-[auto_1fr]'
    : 'oal-grid-cols-[auto_minmax(0,1fr)_12px_minmax(0,1fr)]';
  const cell = (fbmNode: ComponentChildren, mid: ComponentChildren, fbaNode: ComponentChildren) =>
    hideFbm ? [fbaNode] : [fbmNode, mid, fbaNode];

  const MaxCost = ({ mc, rules }: { mc: MaxCostResult | null; rules: typeof fbaRules }) =>
    noRules(rules) ? (
      <button
        type="button"
        class="oal-text-[#007185] hover:oal-underline"
        onClick={() => model.openSettings('sellbuy')}
      >
        Define
      </button>
    ) : (
      <button
        type="button"
        title={maxCostTitle(mc, rules)}
        class="hover:oal-underline"
        onClick={() => mc && model.setBuy(rules === fbaRules ? 'fba' : 'fbm', mc.value)}
      >
        {mc ? money(mc.value) : '--'}
      </button>
    );

  return (
    <div class={cx('oal-grid oal-items-center oal-gap-x-[6px] oal-gap-y-[8px]', grid)}>
      {/* header */}
      <span />
      {cell(
        <span class="oal-flex oal-items-center oal-justify-center oal-gap-[6px] oal-whitespace-nowrap oal-text-[13px] oal-font-bold">
          <a
            class="hover:oal-underline"
            href={`https://www.amazon.com/dp/${model.asin}/?aod=1`}
            target="_blank"
            rel="noreferrer"
            title="Open All Offers"
          >
            FBM {offers ? offers.counts.fbm : ''}
          </a>
          <Switch
            on={false}
            title="Hide FBM column"
            onChange={() => model.updateSettings({ hideFBMColumn: true })}
          />
        </span>,
        <span />,
        <span class="oal-flex oal-items-center oal-justify-center oal-gap-[6px] oal-whitespace-nowrap oal-text-[13px] oal-font-bold">
          <a
            class="hover:oal-underline"
            href={`https://www.amazon.com/dp/${model.asin}/?aod=1`}
            target="_blank"
            rel="noreferrer"
            title="Open All Offers"
          >
            FBA {offers ? offers.counts.fba : ''}
          </a>
          {hideFbm && (
            <Switch
              on
              title="Show FBM column"
              onChange={() => model.updateSettings({ hideFBMColumn: false })}
            />
          )}
        </span>,
      )}

      {/* Sell Price */}
      <span class="oal-whitespace-nowrap oal-text-[12.5px]">Sell Price</span>
      {cell(
        <MoneyInput
          value={values.sellFbm}
          live={s.smartInput}
          ariaLabel="FBM sell price"
          onChange={(v) => model.setSell('fbm', v)}
        />,
        <LinkToggle linked={model.linkSell} onChange={model.setLinkSell} />,
        <MoneyInput
          value={values.sellFba}
          live={s.smartInput}
          ariaLabel="FBA sell price"
          onChange={(v) => model.setSell('fba', v)}
        />,
      )}

      {/* Buy Cost */}
      <span class="oal-flex oal-items-center oal-gap-[4px] oal-whitespace-nowrap oal-text-[12.5px]">
        Buy Cost
        <Popover
          width={300}
          title="Order totals"
          closable
          trigger={({ toggle }) => (
            <button
              type="button"
              title="Order totals"
              class="oal-inline-flex oal-h-[17px] oal-w-[17px] oal-items-center oal-justify-center oal-rounded-[3px] oal-border oal-border-[#a6a6a6] oal-text-[11px] oal-font-bold hover:oal-bg-[#f3f3f3]"
              onClick={toggle}
            >
              #
            </button>
          )}
        >
          <OrderTotalsPopup model={model} />
        </Popover>
      </span>
      {cell(
        <MoneyInput
          value={values.buyFbm}
          decimals={s.decimalBuyCost}
          live={s.smartInput}
          ariaLabel="FBM buy cost"
          onChange={(v) => model.setBuy('fbm', v)}
        />,
        <LinkToggle linked={model.linkBuy} onChange={model.setLinkBuy} />,
        <MoneyInput
          value={values.buyFba}
          decimals={s.decimalBuyCost}
          live={s.smartInput}
          ariaLabel="FBA buy cost"
          onChange={(v) => model.setBuy('fba', v)}
        />,
      )}

      {(model.overrides.discount ?? 0) > 0 && (
        <>
          <span class="oal-text-[12px]">Discounted Cost</span>
          {cell(
            <span class="oal-text-right oal-text-[12px]">{money(fbm?.buyCost)}</span>,
            <span />,
            <span class="oal-text-right oal-text-[12px]">{money(fba?.buyCost)}</span>,
          )}
        </>
      )}

      {/* Net */}
      <span class="oal-text-[16px] oal-font-bold oal-text-[#3d8b37]">Net</span>
      {cell(
        <NetPill
          value={fbm?.net ?? null}
          popup={<FbmFeesPopup model={model} />}
          width={560}
          title="FBM Fees"
        />,
        <span />,
        <NetPill
          value={fba?.net ?? null}
          popup={<FbaFeesPopup model={model} />}
          width={700}
          title="FBA Fees"
        />,
      )}

      {showRoi && (
        <>
          <span class="oal-text-[12px]">ROI</span>
          {cell(
            <span class="oal-text-right oal-text-[12px]">
              {formatPercent(fbm?.roi ?? null, s.decimalProfit)}
            </span>,
            <span />,
            <span class="oal-text-right oal-text-[12px]">
              {formatPercent(fba?.roi ?? null, s.decimalProfit)}
            </span>,
          )}
          <span class="oal-text-[12px]">Margin</span>
          {cell(
            <span class="oal-text-right oal-text-[12px]">
              {formatPercent(fbm?.margin ?? null, s.decimalProfit)}
            </span>,
            <span />,
            <span class="oal-text-right oal-text-[12px]">
              {formatPercent(fba?.margin ?? null, s.decimalProfit)}
            </span>,
          )}
        </>
      )}

      <span class="oal-whitespace-nowrap oal-text-[11.5px]">Breakeven Price</span>
      {cell(
        <button
          type="button"
          class="oal-text-center oal-text-[12px] hover:oal-underline"
          title="Sell price where Net is $0. Click to use it."
          onClick={() => result.fbm.breakeven != null && model.setSell('fbm', result.fbm.breakeven)}
        >
          {money(result.fbm.breakeven)}
        </button>,
        <span />,
        <button
          type="button"
          class="oal-text-center oal-text-[12px] hover:oal-underline"
          title="Sell price where Net is $0. Click to use it."
          onClick={() => result.fba.breakeven != null && model.setSell('fba', result.fba.breakeven)}
        >
          {money(result.fba.breakeven)}
        </button>,
      )}
      <span class="oal--mt-[4px] oal-whitespace-nowrap oal-text-[11.5px]">Max Cost</span>
      {cell(
        <span class="oal-text-center oal-text-[12px]">
          <MaxCost mc={result.fbm.maxCost} rules={fbmRules} />
        </span>,
        <span />,
        <span class="oal-text-center oal-text-[12px]">
          <MaxCost mc={result.fba.maxCost} rules={fbaRules} />
        </span>,
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function DimsEditor({ model, onDone }: { model: WidgetModel; onDone: () => void }) {
  const base = model.overrides.dims ?? catalogDims(model.catalog);
  const [d, setD] = useState<Dims>(base ?? { length: 0, width: 0, height: 0, weight: 0 });
  const field = (key: keyof Dims, label: string) => (
    <label class="oal-flex oal-items-center oal-gap-[3px]">
      <span class="oal-w-[22px] oal-text-[11px] oal-text-[#565959]">{label}</span>
      <MoneyInput
        value={d[key]}
        clearable={false}
        inputClass="!oal-h-[22px] !oal-text-[12px]"
        onChange={(v) => setD({ ...d, [key]: v ?? 0 })}
      />
    </label>
  );
  return (
    <div class="oal-mt-[4px] oal-grid oal-grid-cols-2 oal-gap-[4px] oal-rounded-[4px] oal-border oal-border-[#ddd] oal-bg-white oal-p-[6px]">
      {field('weight', 'Wt')}
      {field('length', 'L')}
      {field('width', 'W')}
      {field('height', 'H')}
      <div class="oal-col-span-2 oal-flex oal-justify-end oal-gap-[6px] oal-text-[12px]">
        <button
          type="button"
          class="oal-text-[#007185] hover:oal-underline"
          onClick={() => {
            model.setOverrides({ dims: undefined });
            onDone();
          }}
        >
          Reset
        </button>
        <button
          type="button"
          class="oal-rounded-[3px] oal-bg-[#3d8b37] oal-px-[8px] oal-text-white"
          onClick={() => {
            if (d.length > 0 && d.width > 0 && d.height > 0 && d.weight > 0)
              model.setOverrides({ dims: d });
            onDone();
          }}
        >
          Apply
        </button>
      </div>
    </div>
  );
}

export function ProductBox({
  model,
  listedDays,
}: {
  model: WidgetModel;
  listedDays: number | null;
}) {
  const { catalog, result, asin, settings } = model;
  const [editing, setEditing] = useState(false);
  const [upcOpen, setUpcOpen] = useState(false);
  const dims = model.overrides.dims ?? catalogDims(catalog);
  const upcs = catalog?.identifiers.upc.length
    ? catalog.identifiers.upc
    : (catalog?.identifiers.ean ?? []);
  const isbn = catalog?.identifiers.isbn ?? [];
  const parent = catalog?.parentAsin && catalog.parentAsin !== asin ? catalog.parentAsin : null;
  const label = 'oal-font-bold oal-text-[#0f1111]';
  const brand = catalog?.brand;

  return (
    <div class="oal-rounded-[6px] oal-border oal-border-[#e3e3e3] oal-bg-[#f7f7f7] oal-px-[9px] oal-py-[6px] oal-text-[12.5px] oal-leading-[21px] oal-text-[#565959]">
      {parent && (
        <div>
          Parent: <CopyText text={parent} />
        </div>
      )}
      <div class="oal-flex oal-items-center oal-gap-[6px]">
        <span class="oal-font-bold oal-text-[#0f1111]" title="Active ASIN">
          {parent && '↳'}
          <CopyText text={asin} />
        </span>
        {listedDays != null && (
          <span
            class="oal-border-l oal-border-[#ccc] oal-pl-[6px]"
            title="Days since listed on Amazon"
          >
            {listedDays}d
          </span>
        )}
      </div>
      {brand && (
        <div class="oal-flex oal-items-center oal-gap-[4px]">
          <span class={label}>Brand:</span>
          <Popover
            width={240}
            trigger={({ toggle }) => (
              <button
                type="button"
                onClick={toggle}
                class="oal-inline-flex oal-items-center oal-gap-[2px] oal-rounded-[4px] oal-bg-[#e6f4e4] oal-px-[6px] oal-leading-[20px] oal-text-[#2b7a24]"
              >
                {brand}
                <ChevronDown size={13} />
              </button>
            )}
          >
            {(close) => (
              <div class="oal-flex oal-flex-col oal-px-[12px] oal-py-[8px] oal-text-[13px]">
                <button
                  type="button"
                  class="oal-py-[3px] oal-text-left oal-text-[#007185] hover:oal-underline"
                  onClick={() => {
                    void navigator.clipboard?.writeText(brand);
                    close();
                  }}
                >
                  Copy Brand Name
                </button>
                <a
                  class="oal-py-[3px] oal-text-[#007185] hover:oal-underline"
                  href={`https://www.amazon.com/s?rh=p_89%3A${encodeURIComponent(brand)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Amazon Search this Brand
                </a>
                <a
                  class="oal-py-[3px] oal-text-[#007185] hover:oal-underline"
                  href={`https://keepa.com/#!finder/{"f":{"brand":{"filterType":"text","filter":${JSON.stringify(brand)}}}}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Keepa Product Finder
                </a>
              </div>
            )}
          </Popover>
        </div>
      )}
      {catalog?.manufacturer && (
        <div>
          <span class={label}>Manuf:</span> <CopyText text={catalog.manufacturer} />
        </div>
      )}
      {isbn.length > 0 && (
        <div>
          <span class={label}>ISBN:</span> <CopyText text={isbn[0]!} />
        </div>
      )}
      {upcs.length > 0 && (
        <div>
          <span class={label}>UPC:</span>{' '}
          {(upcOpen ? upcs : upcs.slice(0, 1)).map((u, i) => (
            <span key={u}>
              {i > 0 && ', '}
              <CopyText text={u} />
            </span>
          ))}
          {upcs.length > 1 && (
            <button
              type="button"
              class="oal-ml-[4px] oal-text-[#007185]"
              onClick={() => setUpcOpen(!upcOpen)}
            >
              {upcOpen ? '⊖' : '⊕'}
            </button>
          )}
        </div>
      )}
      {catalog?.model && (
        <div>
          <span class={label}>Model:</span> <CopyText text={catalog.model} />
        </div>
      )}
      <div class="oal-flex oal-items-center oal-gap-[7px] oal-whitespace-nowrap">
        <Popover
          width={280}
          trigger={({ toggle }) => (
            <button
              type="button"
              title="Click to check SC"
              class="oal-text-[#3d8b37] hover:oal-underline"
              onClick={toggle}
            >
              Prep
            </button>
          )}
        >
          <PrepPopup asin={asin} />
        </Popover>
        <a
          href="https://sellercentral.amazon.com/help/hub/reference/external/G201105770"
          target="_blank"
          rel="noreferrer"
          title="Size tier according to FBA guidelines"
          class="hover:oal-underline"
        >
          {result.tierShort}
        </a>
        {result.cubicFeet != null && (
          <Popover
            mode="hover"
            width={380}
            trigger={() => <span class="oal-cursor-default oal-text-[#3d8b37]">LTSF</span>}
          >
            <LtsfPopup cubicFeet={result.cubicFeet} />
          </Popover>
        )}
      </div>
      {dims ? (
        <>
          <div class="oal-flex oal-items-center oal-gap-[6px]">
            <Popover
              mode="hover"
              width={280}
              trigger={() => <span class="oal-cursor-default">LBS: {dims.weight.toFixed(2)}</span>}
            >
              <WeightPopup model={model} />
            </Popover>
            {result.dimWeight != null && result.dimWeight > dims.weight && (
              <span class="oal-border-l oal-border-[#ccc] oal-pl-[6px]" title="Dimensional weight">
                {result.dimWeight.toFixed(2)}D
              </span>
            )}
          </div>
          <div class="oal-flex oal-items-center oal-gap-[4px]">
            <span class="oal-whitespace-nowrap" title="Product Package Dimensions">
              {dims.length.toFixed(2)} x {dims.width.toFixed(2)} x {dims.height.toFixed(2)} in
            </span>
            <button
              type="button"
              title="Change Weight or Dimensions for Estimates"
              class={cx('hover:oal-text-black', model.overrides.dims && 'oal-text-[#c45500]')}
              onClick={() => setEditing(!editing)}
            >
              <Pencil size={12} />
            </button>
          </div>
        </>
      ) : (
        <div class="oal-text-[12px]">
          No weight or dimensions.{' '}
          <a
            class="oal-text-[#007185] hover:oal-underline"
            href={`https://sellercentral.amazon.com/revcal?asin=${asin}`}
            target="_blank"
            rel="noreferrer"
          >
            Check fees in Amz Calc
          </a>{' '}
          <button type="button" class="oal-text-[#007185]" onClick={() => setEditing(true)}>
            Enter
          </button>
        </div>
      )}
      {editing && <DimsEditor model={model} onDone={() => setEditing(false)} />}
      <label class="oal-flex oal-cursor-pointer oal-items-center oal-gap-[4px]">
        <a
          href="https://sell.amazon.com/pricing#fulfillment-fees"
          target="_blank"
          rel="noreferrer"
          class="hover:oal-underline"
          title="Peak fees apply Oct 15 – Jan 14"
        >
          {settings.usePeakFees ? 'Peak rate' : 'Non-Peak rate'}
        </a>
        <input
          type="checkbox"
          class="oal-h-[13px] oal-w-[13px] oal-accent-[#555]"
          checked={settings.usePeakFees}
          onChange={(e) =>
            model.updateSettings({ usePeakFees: (e.target as HTMLInputElement).checked })
          }
        />
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

export function OfferSummary({ model }: { model: WidgetModel }) {
  const o = model.offers;
  const pct = model.settings.closeFBAPercent;
  const fbaPrices = (o?.offers ?? []).filter((x) => x.fba).map((x) => x.landed);
  const close = closeFbaOfferCount(fbaPrices, pct);
  const eligible = o ? o.buyBoxEligible.fba + o.buyBoxEligible.fbm : 0;
  const aod = `https://www.amazon.com/dp/${model.asin}/?aod=1`;
  const Col = (props: { label: string; children: ComponentChildren; title?: string }) => (
    <div class="oal-flex oal-flex-col oal-items-center" title={props.title}>
      <a
        href={aod}
        target="_blank"
        rel="noreferrer"
        class="oal-text-[12px] oal-text-[#565959] hover:oal-underline"
      >
        {props.label}
      </a>
      <span class="oal-flex oal-items-center oal-gap-[4px] oal-text-[14px] oal-font-bold oal-text-[#0f1111]">
        {props.children}
      </span>
    </div>
  );
  return (
    <div class="oal-grid oal-grid-cols-[1fr_1fr_8px_1fr_1fr_1fr] oal-items-start oal-px-[8px] oal-py-[8px]">
      <Col label="Low FBA" title={`${close} FBA within ${pct}% of Low FBA`}>
        {money(o?.lowestFba)}
        {o?.lowestFba != null && (
          <span class="oal-flex oal-items-center oal-text-[12px] oal-font-normal oal-text-[#565959]">
            <MapPin size={12} />
            {close}
          </span>
        )}
      </Col>
      <Col label="Low FBM">{money(o?.lowestFbm)}</Col>
      <span />
      <Col label="Buy Box" title={`${eligible} Eligible for Buy Box`}>
        {money(o?.buyBox)}
        {o?.buyBox != null && (
          <span class="oal-flex oal-items-center oal-text-[12px] oal-font-normal oal-text-[#565959]">
            <Trophy size={12} />
            {eligible}
          </span>
        )}
      </Col>
      <Col label="Amz">
        <span class="oal-text-[#e47911]">{money(o?.amazon)}</span>
      </Col>
      <Col
        label="CPT"
        title="Competitive Price Threshold: the price Amazon uses when deciding Featured Offer eligibility"
      >
        {money(o?.cpt)}
      </Col>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function TargetTable(props: {
  head: string;
  rows: { label: string; sell: number | null; buy: number | null }[];
  onSell: (v: number) => void;
  onBuy: (v: number) => void;
}) {
  return (
    <table class="oal-w-full oal-border-collapse oal-overflow-hidden oal-rounded-[4px] oal-border oal-border-[#ddd] oal-text-[12px]">
      <thead>
        <tr class="oal-border-b oal-border-[#ddd]">
          <th class="oal-py-[3px] oal-pr-[6px] oal-text-right oal-text-[13px]">{props.head}</th>
          <th class="oal-pr-[6px] oal-text-right">Sell</th>
          <th class="oal-pr-[6px] oal-text-right">Buy</th>
        </tr>
      </thead>
      <tbody>
        {props.rows.map((r, i) => (
          <tr key={r.label} class={cx(i % 2 === 0 && 'oal-bg-[#f5f6f6]')}>
            <td class="oal-py-[3px] oal-pr-[6px] oal-text-right oal-font-bold">{r.label}</td>
            <td class="oal-pr-[6px] oal-text-right">
              {r.sell == null ? (
                <span class="oal-text-[#888]" title="Enter a buy cost">
                  --
                </span>
              ) : (
                <button
                  type="button"
                  class="hover:oal-underline"
                  onClick={() => props.onSell(r.sell!)}
                >
                  {money(r.sell)}
                </button>
              )}
            </td>
            <td class="oal-pr-[6px] oal-text-right">
              {r.buy == null ? (
                '--'
              ) : (
                <button
                  type="button"
                  class="hover:oal-underline"
                  onClick={() => props.onBuy(r.buy!)}
                >
                  {money(r.buy)}
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Segmented<T extends string>(props: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <span class="oal-inline-flex oal-overflow-hidden oal-rounded-[3px] oal-border oal-border-[#ccc] oal-text-[11px]">
      {props.options.map(([v, label]) => (
        <button
          type="button"
          key={v}
          class={cx(
            'oal-px-[7px] oal-py-[2px]',
            props.value === v ? 'oal-bg-[#6b7280] oal-text-white' : 'oal-bg-white',
          )}
          onClick={() => props.onChange(v)}
        >
          {label}
        </button>
      ))}
    </span>
  );
}

export function Targets({ model }: { model: WidgetModel }) {
  const s = model.settings;
  const column = s.targetsFbaFbm;
  const metric = s.targetsMetric;
  const c = column === 'fba' ? model.result.fba.main : model.result.fbm.column;
  if (!c)
    return <div class="oal-p-[8px] oal-text-[12px] oal-text-[#565959]">Enter a sell price.</div>;
  const label = (metricName: 'net' | 'roi' | 'margin', t: number) =>
    t === 0 ? 'BE' : metricName === 'net' ? `$${t}` : `${t}%`;
  const rows = (metricName: 'net' | 'roi' | 'margin', list: string) =>
    targetsTable(c.model, c.price, metricName, parseTargetList(list)).map((r) => ({
      label: label(metricName, r.target),
      sell: r.minSell,
      buy: r.maxBuy,
    }));
  const onSell = (v: number) => model.setSell(column, v);
  const onBuy = (v: number) => model.setBuy(column, v);
  return (
    <div class="oal-px-[8px] oal-pb-[8px]">
      <div class="oal-mb-[6px] oal-flex oal-gap-[10px]">
        <Segmented
          value={column}
          options={[
            ['fba', 'FBA'],
            ['fbm', 'FBM'],
          ]}
          onChange={(v) => model.updateSettings({ targetsFbaFbm: v })}
        />
        <Segmented
          value={metric}
          options={[
            ['margin', 'Margin'],
            ['roi', 'ROI'],
          ]}
          onChange={(v) => model.updateSettings({ targetsMetric: v })}
        />
      </div>
      <div class="oal-grid oal-grid-cols-2 oal-gap-[10px]">
        <TargetTable
          head="Profit"
          rows={rows('net', s.profitPriceTargets)}
          onSell={onSell}
          onBuy={onBuy}
        />
        <TargetTable
          head={metric === 'margin' ? 'Margin' : 'ROI'}
          rows={rows(metric, metric === 'margin' ? s.marginPriceTargets : s.roiPriceTargets)}
          onSell={onSell}
          onBuy={onBuy}
        />
      </div>
    </div>
  );
}

export { SectionPill };
