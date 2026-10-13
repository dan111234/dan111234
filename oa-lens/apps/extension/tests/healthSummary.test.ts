import type { HealthDTO } from '@oa-lens/shared';
import { describe, expect, it } from 'vitest';
import { SUCCESS_HEADLINE, summarizeHealth } from '../lib/healthSummary';

const allSecrets = {
  LWA_CLIENT_ID: true,
  LWA_CLIENT_SECRET: true,
  LWA_REFRESH_TOKEN: true,
  SELLER_ID: true,
  KEEPA_API_KEY: true,
  EXT_SHARED_KEY: true,
};

function ok(data: Partial<HealthDTO>) {
  return {
    ok: true as const,
    cached: false,
    fetchedAt: 0,
    data: { worker: { ok: true as const, version: '0.1.0' }, secrets: allSecrets, ...data },
  };
}

describe('summarizeHealth', () => {
  it('shows the P0 success line when SP-API and seller ID both pass', () => {
    const s = summarizeHealth(
      ok({
        spapi: { ok: true, marketplaces: ['US'] },
        seller: { ok: true, sellerId: 'A1SELLER' },
        keepa: { ok: true, tokensLeft: 20, refillIn: 0 },
      }),
    );
    expect(s.ok).toBe(true);
    expect(s.headline).toBe(SUCCESS_HEADLINE);
    expect(s.headline).toBe('SP-API OK, 셀러 ID 확인');
    expect(s.lines.find((l) => l.label === '셀러 ID')).toMatchObject({
      state: 'ok',
      detail: 'A1SELLER 확인',
    });
  });

  it('flags a seller ID that does not match', () => {
    const s = summarizeHealth(
      ok({
        spapi: { ok: true },
        seller: { ok: false, sellerId: 'A1WRONG', error: { code: 'AUTH', message: 'denied' } },
      }),
    );
    expect(s.ok).toBe(false);
    expect(s.headline).toBe('셀러 ID 확인 필요');
  });

  it('treats a missing Keepa key as a warning only', () => {
    const s = summarizeHealth(
      ok({
        secrets: { ...allSecrets, KEEPA_API_KEY: false },
        spapi: { ok: true },
        seller: { ok: true, sellerId: 'A1' },
        keepa: {
          ok: false,
          error: { code: 'AUTH', message: 'KEEPA_API_KEY is not set on the Worker' },
        },
      }),
    );
    expect(s.ok).toBe(true);
    expect(s.lines.find((l) => l.label === 'Worker secret')?.state).toBe('warn');
    expect(s.lines.find((l) => l.label === 'Keepa')?.state).toBe('warn');
  });

  it('explains connection and key problems', () => {
    expect(
      summarizeHealth({ ok: false, error: { code: 'NETWORK', message: 'Cannot reach the Worker' } })
        .headline,
    ).toContain('연결할 수 없습니다');
    expect(
      summarizeHealth({ ok: false, error: { code: 'KEY_MISMATCH', message: 'x' } }).headline,
    ).toBe('공유키가 Worker와 다릅니다');
    expect(summarizeHealth({ ok: false, error: { code: 'NOT_CONFIGURED', message: 'x' } }).ok).toBe(
      false,
    );
  });
});
