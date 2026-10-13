import { formatRank } from '@oa-lens/core';
import type { CatalogDTO, SalesRank } from '@oa-lens/shared';
import { useCallback, useEffect, useState } from 'preact/hooks';
import { send } from '../lib/messages';
import type { ClientError } from '../lib/workerClient';

interface Props {
  asin: string | null;
  /** #productTitle text, shown until the catalog title arrives (docs/06: CAT -> DOM). */
  domTitle: string | null;
}

type CatalogState =
  | { status: 'loading' }
  | { status: 'ready'; catalog: CatalogDTO }
  | { status: 'error'; error: ClientError };

type ParentRankState =
  { status: 'idle' } | { status: 'loading' } | { status: 'ready'; rank: SalesRank | null };

/** docs/02 §L messages. */
function errorMessage(error: ClientError): string {
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

function Skeleton({ width }: { width: string }) {
  return (
    <span
      class="oal-inline-block oal-h-[12px] oal-animate-pulse oal-rounded oal-bg-gray-200 oal-align-middle"
      style={{ width }}
    />
  );
}

function Row({ label, children }: { label: string; children: preact.ComponentChildren }) {
  return (
    <div class="oal-flex oal-gap-2 oal-py-[2px]">
      <span class="oal-w-[44px] oal-shrink-0 oal-text-[11px] oal-text-gray-500">{label}</span>
      <span class="oal-min-w-0 oal-flex-1 oal-text-[12px] oal-text-gray-900">{children}</span>
    </div>
  );
}

function RankText({ rank }: { rank: SalesRank }) {
  return (
    <span title={rank.category}>
      <b>{formatRank(rank.rank)}</b> in {rank.category}
    </span>
  );
}

export function ProductWidget({ asin, domTitle }: Props) {
  const [state, setState] = useState<CatalogState>({ status: 'loading' });
  const [parentRank, setParentRank] = useState<ParentRankState>({ status: 'idle' });
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!asin) {
      setState({ status: 'error', error: { code: 'NOT_FOUND', message: 'No ASIN on this page' } });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    setParentRank({ status: 'idle' });

    void (async () => {
      const res = await send({ type: 'catalog', asin });
      if (cancelled) return;
      if (!res.ok) {
        setState({ status: 'error', error: res.error });
        return;
      }
      setState({ status: 'ready', catalog: res.data });

      // docs/06: a child ASIN without its own rank shows the parent's rank.
      const parent = res.data.parentAsin;
      if (!res.data.salesRank && parent && parent !== asin) {
        setParentRank({ status: 'loading' });
        const parentRes = await send({ type: 'catalog', asin: parent });
        if (cancelled) return;
        setParentRank({ status: 'ready', rank: parentRes.ok ? parentRes.data.salesRank : null });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [asin, reload]);

  const retry = useCallback(() => setReload((n) => n + 1), []);
  const openOptions = useCallback(() => void send({ type: 'openOptions' }), []);

  const catalog = state.status === 'ready' ? state.catalog : null;
  const loading = state.status === 'loading';
  const title = catalog?.title ?? domTitle;

  let rank: preact.ComponentChildren;
  if (loading) rank = <Skeleton width="160px" />;
  else if (catalog?.salesRank) rank = <RankText rank={catalog.salesRank} />;
  else if (parentRank.status === 'loading')
    rank = <span class="oal-text-gray-500">loading parent rank...</span>;
  else if (parentRank.status === 'ready' && parentRank.rank)
    rank = (
      <span>
        <RankText rank={parentRank.rank} /> <span class="oal-text-gray-500">(parent)</span>
      </span>
    );
  else rank = '--';

  return (
    <div class="oal-my-2 oal-overflow-hidden oal-rounded-md oal-border oal-border-gray-300 oal-bg-white oal-font-sans oal-text-[12px] oal-leading-[1.4] oal-text-gray-900">
      <div class="oal-flex oal-items-center oal-justify-between oal-gap-2 oal-rounded-t-md oal-border-b oal-border-gray-300 oal-bg-gradient-to-b oal-from-gray-50 oal-to-gray-200 oal-px-2 oal-py-1">
        <span class="oal-text-[12px] oal-font-bold oal-tracking-wide oal-text-gray-700">
          OA Lens
        </span>
        <span class="oal-font-mono oal-text-[11px] oal-text-gray-600" title="Active ASIN">
          {asin ?? '--'}
        </span>
      </div>

      {state.status === 'error' && (
        <div class="oal-flex oal-items-center oal-justify-between oal-gap-2 oal-bg-red-50 oal-px-2 oal-py-1 oal-text-[12px] oal-text-red-700">
          <span>{errorMessage(state.error)}</span>
          {state.error.code === 'NOT_CONFIGURED' || state.error.code === 'KEY_MISMATCH' ? (
            <button
              type="button"
              class="oal-shrink-0 oal-rounded oal-border oal-border-red-300 oal-bg-white oal-px-2 oal-py-[1px] hover:oal-bg-red-100"
              onClick={openOptions}
            >
              옵션 열기
            </button>
          ) : (
            <button
              type="button"
              class="oal-shrink-0 oal-rounded oal-border oal-border-red-300 oal-bg-white oal-px-2 oal-py-[1px] hover:oal-bg-red-100"
              onClick={retry}
            >
              재시도
            </button>
          )}
        </div>
      )}

      <div class="oal-px-2 oal-py-1">
        <Row label="ASIN">{asin ?? '--'}</Row>
        <Row label="Title">
          <span class="oal-line-clamp-2" title={title ?? undefined}>
            {title ?? (loading ? <Skeleton width="80%" /> : '--')}
          </span>
        </Row>
        <Row label="Brand">{loading ? <Skeleton width="90px" /> : (catalog?.brand ?? '--')}</Row>
        <Row label="Rank">{rank}</Row>
      </div>
    </div>
  );
}
