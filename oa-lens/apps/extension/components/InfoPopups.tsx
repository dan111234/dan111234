// Order Totals, Prep, LTSF and weight popups (docs/02 §K-3, §K-10, §K-13, §K-14; screenshots 06, 07).
import { ltsfRows, orderTotals } from '@oa-lens/core';
import type { PrepDTO } from '@oa-lens/shared';
import { useEffect, useState } from 'preact/hooks';
import { send } from '../lib/messages';
import type { ClientError } from '../lib/workerClient';
import type { WidgetModel } from './model';
import { cx, money, MoneyInput } from './ui';

export function OrderTotalsPopup({ model }: { model: WidgetModel }) {
  const [units, setUnits] = useState<number | null>(1);
  const [total, setTotal] = useState<number | null>(model.values.buyFba || null);
  const n = units && units > 0 ? Math.floor(units) : 0;
  const perUnit = n > 0 && total != null ? total / n : null;
  const fba = model.result.fba.main;
  const fbm = model.result.fbm.column;
  const totals = (c: typeof fba | typeof fbm) =>
    c && n > 0 ? orderTotals(c.model, c.price, n, total ?? 0) : null;
  const tFba = totals(fba);
  const tFbm = totals(fbm);

  const apply = (nextUnits: number | null, nextTotal: number | null) => {
    setUnits(nextUnits);
    setTotal(nextTotal);
    const u = nextUnits && nextUnits > 0 ? Math.floor(nextUnits) : 0;
    if (u > 0 && nextTotal != null) {
      const cost = Math.round((nextTotal / u) * 100) / 100;
      model.setBuy('fba', cost);
      model.setBuy('fbm', cost);
    }
  };

  const netClass = (v: number | null | undefined) =>
    (v ?? 0) < 0 ? 'oal-text-[#cc0c39]' : 'oal-text-[#3d8b37]';

  return (
    <div class="oal-px-[12px] oal-pb-[10px] oal-pt-[6px] oal-text-[13px]">
      <div class="oal-flex oal-items-center oal-justify-between oal-py-[4px]">
        <span>Units</span>
        <span class="oal-w-[110px]">
          <MoneyInput
            value={units}
            decimals={0}
            clearable={false}
            onChange={(v) => apply(v, total)}
          />
        </span>
      </div>
      <div class="oal-flex oal-items-center oal-justify-between oal-py-[4px]">
        <span>Total buy cost</span>
        <span class="oal-w-[110px]">
          <MoneyInput value={total} clearable={false} onChange={(v) => apply(units, v)} />
        </span>
      </div>
      <div class="oal-text-right oal-text-[11px] oal-text-[#565959]">
        {money(perUnit ?? 0)} per unit
      </div>
      <div class="oal-mt-[8px] oal-border-t oal-border-[#e3e6e6] oal-pt-[6px]">
        <div class="oal-grid oal-grid-cols-[1fr_80px_80px] oal-text-[12px] oal-text-[#565959]">
          <span>Totals</span>
          <span class="oal-text-right">FBM</span>
          <span class="oal-text-right">FBA</span>
        </div>
        <div class="oal-grid oal-grid-cols-[1fr_80px_80px] oal-py-[2px]">
          <span>Sales total</span>
          <span class="oal-text-right">{money(tFbm?.sales)}</span>
          <span class="oal-text-right">{money(tFba?.sales)}</span>
        </div>
        <div class="oal-grid oal-grid-cols-[1fr_80px_80px] oal-py-[2px] oal-font-bold">
          <span>Net profit</span>
          <span class={cx('oal-text-right', netClass(tFbm?.net))}>{money(tFbm?.net)}</span>
          <span class={cx('oal-text-right', netClass(tFba?.net))}>{money(tFba?.net)}</span>
        </div>
      </div>
      <p class="oal-mt-[8px] oal-border-t oal-border-[#e3e6e6] oal-pt-[6px] oal-text-[11px] oal-leading-snug oal-text-[#565959]">
        Uses your current calculator fees and settings. Buy Cost in the main calculator updates per
        unit.
      </p>
    </div>
  );
}

type PrepState =
  | { status: 'loading' }
  | { status: 'ready'; prep: PrepDTO }
  | { status: 'error'; error: ClientError };

export function PrepPopup({ asin }: { asin: string }) {
  const [state, setState] = useState<PrepState>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    void send({ type: 'prep', asin }).then((res) => {
      if (cancelled) return;
      setState(
        res.ok ? { status: 'ready', prep: res.data } : { status: 'error', error: res.error },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [asin]);

  return (
    <div class="oal-px-[12px] oal-pb-[10px] oal-text-[13px]">
      <div class="oal-mb-[6px] oal-border-b oal-border-[#e3e6e6] oal-pb-[6px] oal-pt-[2px] oal-text-[15px] oal-font-bold">
        FBA Prep Requirements
      </div>
      {state.status === 'loading' && <div class="oal-text-[#565959]">Loading…</div>}
      {state.status === 'ready' &&
        (state.prep.instructions.length ? (
          <ul class="oal-list-disc oal-pl-[18px] oal-font-bold">
            {state.prep.instructions.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : (
          <div class="oal-font-bold">None Listed</div>
        ))}
      {state.status === 'error' && (
        <div class="oal-text-[#b12704]">
          {state.error.code === 'AUTH'
            ? 'SP-API 권한 없음: 앱에 "Amazon Fulfillment" 역할을 추가하고 다시 승인하세요.'
            : state.error.message}
        </div>
      )}
      <p class="oal-mt-[6px] oal-text-[12px] oal-leading-snug oal-text-[#565959]">
        We try to show the currently listed requirements for this ASIN, though sometimes
        requirements are added or changed.
      </p>
      <a
        class="oal-mt-[4px] oal-inline-block oal-text-[12px] oal-text-[#007185] hover:oal-underline"
        href={`https://sellercentral.amazon.com/fba/inbound-shipment/prep-guidance?asin=${asin}`}
        target="_blank"
        rel="noreferrer"
      >
        Check in Seller Central
      </a>
    </div>
  );
}

export function LtsfPopup({ cubicFeet }: { cubicFeet: number }) {
  const rows = ltsfRows(cubicFeet);
  return (
    <div class="oal-text-[13px]">
      <div class="oal-px-[12px] oal-pt-[2px]">
        <div class="oal-text-[15px] oal-font-bold">
          FBA Aged Inventory Surcharge - Monthly Estimate
        </div>
        <div class="oal-text-[12px] oal-text-[#565959]">*Formerly Called LTSF</div>
      </div>
      <table class="oal-mt-[8px] oal-w-full oal-border-collapse">
        <thead>
          <tr class="oal-border-y oal-border-[#e3e6e6] oal-text-[12px]">
            <th class="oal-py-[6px] oal-pl-[12px] oal-text-left">Days</th>
            <th class="oal-border-l oal-border-[#e3e6e6] oal-pr-[10px] oal-text-right">
              Monthly Fee
            </th>
            <th class="oal-border-l oal-border-[#e3e6e6] oal-pr-[12px] oal-text-right">
              {cubicFeet.toFixed(3)} Cubic Foot
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.days} class={cx(i % 2 === 0 && 'oal-bg-[#f5f6f6]')}>
              <td class="oal-py-[6px] oal-pl-[12px]">{r.days}</td>
              <td class="oal-border-l oal-border-[#e3e6e6] oal-pr-[10px] oal-text-right oal-text-[#3d8b37]">
                {money(r.monthly)}
              </td>
              <td class="oal-border-l oal-border-[#e3e6e6] oal-pr-[12px] oal-text-right">
                {money(r.perCubicFoot)}/cubic foot
                {r.minPerUnit != null && <div>Min {money(r.minPerUnit)}/unit</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div class="oal-border-t oal-border-[#e3e6e6] oal-px-[12px] oal-py-[6px] oal-text-[12px] oal-text-[#565959]">
        *LTSF are in addition to monthly storage fees
      </div>
    </div>
  );
}

function lbOz(lb: number): string {
  const whole = Math.floor(lb);
  const oz = Math.round((lb - whole) * 16 * 10) / 10;
  return `${whole} lb ${oz} oz`;
}

export function WeightPopup({ model }: { model: WidgetModel }) {
  const dims = model.overrides.dims ?? null;
  const r = model.result;
  const item = dims?.weight ?? model.catalog?.packageDimensions?.weight ?? null;
  const usesDim = r.dimWeight != null && item != null && r.dimWeight > item;
  return (
    <div class="oal-px-[12px] oal-pb-[10px] oal-pt-[2px] oal-text-[13px]">
      <div class="oal-mb-[6px] oal-text-[15px] oal-font-bold">Weight</div>
      <div class="oal-grid oal-grid-cols-[auto_1fr] oal-gap-x-[12px] oal-gap-y-[3px]">
        <span class="oal-text-[#565959]">Item Weight</span>
        <span>{item != null ? `${item.toFixed(2)} lb (${lbOz(item)})` : '--'}</span>
        <span class="oal-text-[#565959]">Dimensional Weight</span>
        <span>{r.dimWeight != null ? `${r.dimWeight.toFixed(2)} lb` : '--'}</span>
        <span class="oal-text-[#565959]">Ship Weight</span>
        <span>{r.outbound != null ? `${r.outbound.toFixed(2)} lb` : '--'}</span>
      </div>
      <p class="oal-mt-[6px] oal-text-[12px] oal-text-[#565959]">
        {usesDim
          ? 'D = dimensional weight. It is larger than the item weight, so FBA bills on it.'
          : 'FBA bills on the item weight (it is at least the dimensional weight).'}
      </p>
    </div>
  );
}
