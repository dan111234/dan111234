import { SECRET_NAMES, type HealthDTO } from '@oa-lens/shared';
import type { ClientResult } from './workerClient';

export type CheckState = 'ok' | 'fail' | 'warn';

export interface CheckLine {
  label: string;
  state: CheckState;
  detail: string;
}

export interface HealthSummary {
  /** docs/08 P0: "SP-API OK, 셀러 ID 확인" when both checks pass. */
  headline: string;
  ok: boolean;
  lines: CheckLine[];
}

export const SUCCESS_HEADLINE = 'SP-API OK, 셀러 ID 확인';

/** Turns a deep /v1/health result into the options page's check list. */
export function summarizeHealth(result: ClientResult<HealthDTO>): HealthSummary {
  if (!result.ok) {
    const { code, message } = result.error;
    const lines: CheckLine[] = [];
    if (code === 'NOT_CONFIGURED') {
      return {
        ok: false,
        headline: 'Worker URL과 공유키를 입력하세요',
        lines: [{ label: 'Worker 연결', state: 'fail', detail: '설정되지 않음' }],
      };
    }
    if (code === 'NETWORK') {
      lines.push({ label: 'Worker 연결', state: 'fail', detail: message });
      return { ok: false, headline: 'Worker에 연결할 수 없습니다. URL을 확인하세요', lines };
    }
    lines.push({ label: 'Worker 연결', state: 'ok', detail: '응답 받음' });
    if (code === 'KEY_MISMATCH') {
      lines.push({ label: '공유키', state: 'fail', detail: 'Worker의 EXT_SHARED_KEY와 다릅니다' });
      return { ok: false, headline: '공유키가 Worker와 다릅니다', lines };
    }
    lines.push({ label: 'Worker 응답', state: 'fail', detail: `${code}: ${message}` });
    return { ok: false, headline: `Worker 오류 (${code})`, lines };
  }

  const data = result.data;
  const lines: CheckLine[] = [
    { label: 'Worker 연결', state: 'ok', detail: `v${data.worker.version}` },
    { label: '공유키', state: 'ok', detail: '일치' },
  ];

  const missing = SECRET_NAMES.filter((name) => !data.secrets[name]);
  lines.push(
    missing.length === 0
      ? { label: 'Worker secret', state: 'ok', detail: '6개 모두 설정됨' }
      : {
          label: 'Worker secret',
          // Keepa is only needed from P3 on.
          state: missing.every((n) => n === 'KEEPA_API_KEY') ? 'warn' : 'fail',
          detail: `누락: ${missing.join(', ')}`,
        },
  );

  const spapi = data.spapi;
  lines.push(
    spapi?.ok
      ? {
          label: 'SP-API',
          state: 'ok',
          detail: spapi.marketplaces?.length ? `OK (마켓: ${spapi.marketplaces.join(', ')})` : 'OK',
        }
      : { label: 'SP-API', state: 'fail', detail: spapi?.error?.message ?? '확인되지 않음' },
  );

  const seller = data.seller;
  lines.push(
    seller?.ok
      ? { label: '셀러 ID', state: 'ok', detail: `${seller.sellerId ?? ''} 확인`.trim() }
      : {
          label: '셀러 ID',
          state: 'fail',
          detail: [seller?.sellerId, seller?.error?.message ?? '확인되지 않음']
            .filter(Boolean)
            .join(' - '),
        },
  );

  const keepa = data.keepa;
  lines.push(
    keepa?.ok
      ? { label: 'Keepa', state: 'ok', detail: `남은 토큰 ${keepa.tokensLeft ?? '?'}` }
      : {
          label: 'Keepa',
          state: 'warn',
          detail: keepa?.error?.message ?? '확인되지 않음',
        },
  );

  const ok = Boolean(spapi?.ok && seller?.ok);
  const firstFail = lines.find((l) => l.state === 'fail');
  return {
    ok,
    headline: ok ? SUCCESS_HEADLINE : `${firstFail?.label ?? 'SP-API'} 확인 필요`,
    lines,
  };
}
