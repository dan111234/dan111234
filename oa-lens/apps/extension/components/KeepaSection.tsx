// Keepa metric row and 30/90/180 table (docs/02 §B-2, §B-3; screenshots 01, 02).
import { KEEPA_CSV, keepaAverage, rankDrops } from '@oa-lens/core';
import type { KeepaProductDTO, OfferCondition, Settings } from '@oa-lens/shared';
import { Clock, Pin } from 'lucide-preact';
import type { BoughtPastMonth } from '../lib/amazonDom';
import { formatCell, parseRowList, salesValue, tableRows } from '../lib/keepaView';
import type { ClientError } from '../lib/workerClient';
import { cx, SectionPill } from './ui';

export type KeepaState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; product: KeepaProductDTO | null }
  | { status: 'error'; error: ClientError };

interface Props {
  keepa: KeepaState;
  /** Offers-enabled product, once the table asked for it. */
  keepaOffers: KeepaState;
  bought: BoughtPastMonth | null;
  condition: OfferCondition;
  settings: Settings;
  tableOpen: boolean;
  onToggleTable: () => void;
  onPin: (pinned: boolean) => void;
  onPrice: (price: number) => void;
}

function salesLabel(bought: BoughtPastMonth | null): string {
  const period = bought?.period.toLowerCase() ?? 'past month';
  if (period.includes('week')) return '7d Sales';
  if (period.includes('year')) return '1y Sales';
  return '30d Sales';
}

function keepaHint(state: KeepaState): string | undefined {
  if (state.status !== 'error') return undefined;
  if (state.error.code === 'RATE_LIMIT') {
    return `Keepa 토큰 대기 중${state.error.retryAfter ? ` (약 ${state.error.retryAfter}초)` : ''}`;
  }
  return `Keepa 오류: ${state.error.message}`;
}

function Metric(props: {
  label: string;
  value: string;
  orange?: boolean;
  title?: string;
  waiting?: boolean;
  onClick?: () => void;
}) {
  const value = props.waiting ? <Clock size={13} class="oal-text-[#888]" /> : props.value;
  return (
    <div class="oal-flex oal-flex-col oal-items-center" title={props.title}>
      <span class="oal-text-[12px] oal-text-[#565959]">{props.label}</span>
      {props.onClick ? (
        <button
          type="button"
          onClick={props.onClick}
          title="Click to use as the FBA sell price"
          class={cx(
            'oal-text-[13px] oal-font-bold hover:oal-underline',
            props.orange && 'oal-text-[#e47911]',
          )}
        >
          {value}
        </button>
      ) : (
        <span class={cx('oal-text-[13px] oal-font-bold', props.orange && 'oal-text-[#e47911]')}>
          {value}
        </span>
      )}
    </div>
  );
}

export function KeepaMetrics(props: Props) {
  const k = props.keepa.status === 'ready' ? props.keepa.product : null;
  const best =
    props.keepaOffers.status === 'ready' && props.keepaOffers.product
      ? props.keepaOffers.product
      : k;
  const loading = props.keepa.status === 'loading';
  const waiting = props.keepa.status === 'error';
  const hint = keepaHint(props.keepa);
  const s = props.settings;
  const stats = best
    ? {
        avg90: best.avg90,
        salesRankDrops30: best.salesRankDrops30 ?? undefined,
      }
    : null;
  const drops30 = best
    ? rankDrops({ method: s.salesRankDropCalcMethod, range: 30, stats, salesCsv: best.salesCsv })
    : null;
  const rank90 = keepaAverage(stats, 90, KEEPA_CSV.SALES);
  const used = props.condition === 'used';
  const p90 = keepaAverage(stats, 90, used ? KEEPA_CSV.USED : KEEPA_CSV.NEW);
  const amz90 = keepaAverage(stats, 90, KEEPA_CSV.AMAZON);
  const show = (v: string) => (loading ? '…' : v);
  const sales = salesValue(props.bought, best);

  return (
    <div class="oal-mt-[10px] oal-grid oal-grid-cols-[1fr_1fr_1fr_1px_1fr_1fr] oal-items-center">
      <Metric label={salesLabel(props.bought)} value={show(sales)} />
      <Metric
        label="30d Drops"
        value={show(formatCell('count', drops30))}
        waiting={waiting}
        title={hint}
      />
      <Metric
        label="90d Rank"
        value={show(formatCell('rank', rank90))}
        waiting={waiting}
        title={hint}
      />
      <span class="oal-h-[28px] oal-bg-[#e3e6e6]" />
      <Metric
        label={used ? '90d Used' : '90d 3p'}
        value={show(formatCell('price', p90))}
        waiting={waiting}
        title={hint}
        onClick={p90 != null ? () => props.onPrice(p90) : undefined}
      />
      {!used && (
        <Metric
          label="90d Amz"
          value={show(formatCell('price', amz90))}
          orange
          waiting={waiting}
          title={hint}
          onClick={amz90 != null ? () => props.onPrice(amz90) : undefined}
        />
      )}
    </div>
  );
}

export function KeepaTablePill(props: Props) {
  const pinned = props.settings.autoKeepaTable;
  return (
    <span class="oal-absolute oal-bottom-[-10px] oal-right-[8px] oal-z-[1] oal-flex oal-items-center oal-gap-[2px] oal-rounded-full oal-bg-white">
      {props.tableOpen && (
        <button
          type="button"
          title={pinned ? 'Unpin (stop opening automatically)' : 'Pin open on every product'}
          class={cx(
            'oal-px-[2px]',
            pinned ? 'oal-text-[#3d8b37]' : 'oal-text-[#999] hover:oal-text-black',
          )}
          onClick={() => props.onPin(!pinned)}
        >
          <Pin size={11} fill={pinned ? 'currentColor' : 'none'} />
        </button>
      )}
      <SectionPill label="30/90/180" open={props.tableOpen} onToggle={props.onToggleTable} />
    </span>
  );
}

export function KeepaTable(props: Props) {
  const base = props.keepa.status === 'ready' ? props.keepa.product : null;
  const withOffers = props.keepaOffers.status === 'ready' ? props.keepaOffers.product : null;
  const product = withOffers ?? base;
  const offersLoading = props.keepaOffers.status === 'loading';
  const rows = tableRows({
    rows: parseRowList(props.settings.keepaMoreTableRows),
    keepa: product,
    sales: salesValue(props.bought, product),
    dropMethod: props.settings.salesRankDropCalcMethod,
  });
  const offersError = keepaHint(props.keepaOffers);

  return (
    <div class="oal-border-b oal-border-[#e3e6e6] oal-text-[13px]">
      {props.keepa.status === 'error' && (
        <div class="oal-px-[10px] oal-py-[4px] oal-text-[12px] oal-text-[#8a5a00]">
          {keepaHint(props.keepa)}
        </div>
      )}
      <table class="oal-w-full oal-border-collapse">
        <thead>
          <tr class="oal-border-b oal-border-[#e3e6e6]">
            <th class="oal-py-[6px] oal-pl-[10px] oal-text-left">Stats</th>
            {['30 Days', '90 Days', '180 Days'].map((h) => (
              <th key={h} class="oal-border-l oal-border-[#e3e6e6] oal-pr-[10px] oal-text-right">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.key} class={cx(i % 2 === 1 && 'oal-bg-[#f5f6f6]')}>
              <td class="oal-py-[5px] oal-pl-[10px]">{r.label}</td>
              {r.values.map((v, j) => (
                <td key={j} class="oal-border-l oal-border-[#e3e6e6] oal-pr-[10px] oal-text-right">
                  {r.needsOffers && v == null && offersLoading ? (
                    <span class="oal-text-[#888]">…</span>
                  ) : r.needsOffers && v == null && offersError ? (
                    <span title={offersError}>
                      <Clock size={12} class="oal-inline oal-text-[#888]" />
                    </span>
                  ) : r.kind === 'price' && typeof v === 'number' ? (
                    <button
                      type="button"
                      class="hover:oal-underline"
                      title="Click to use as the FBA sell price"
                      onClick={() => props.onPrice(v)}
                    >
                      {formatCell(r.kind, v)}
                    </button>
                  ) : (
                    formatCell(r.kind, v)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
