import { describe, expect, it, vi } from 'vitest';
import { workerFetch } from '../lib/workerClient';

const config = { url: 'https://oa-lens.example.workers.dev', key: 'k3y' };

function respond(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return vi.fn(
    async () =>
      new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers }),
  ) as unknown as typeof fetch;
}

describe('workerFetch', () => {
  it('sends the shared key as a Bearer token', async () => {
    const f = respond({ ok: true, data: 1, cached: false, fetchedAt: 1 });
    const res = await workerFetch<number>(config, '/v1/health', {}, f);
    expect(res).toEqual({ ok: true, data: 1, cached: false, fetchedAt: 1 });
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe('https://oa-lens.example.workers.dev/v1/health');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer k3y' });
  });

  it('reports NOT_CONFIGURED without calling fetch', async () => {
    const f = respond({});
    expect(await workerFetch(null, '/v1/health', {}, f)).toMatchObject({
      ok: false,
      error: { code: 'NOT_CONFIGURED' },
    });
    expect(f).not.toHaveBeenCalled();
  });

  it('maps network failures to NETWORK', async () => {
    const f = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    expect(await workerFetch(config, '/v1/health', {}, f)).toMatchObject({
      ok: false,
      error: { code: 'NETWORK' },
    });
  });

  it('maps non-JSON responses (wrong URL) to NETWORK', async () => {
    const f = respond('<html>Not found</html>', 404);
    expect(await workerFetch(config, '/v1/health', {}, f)).toMatchObject({
      ok: false,
      error: { code: 'NETWORK', status: 404 },
    });
  });

  it('tells a wrong shared key apart from SP-API auth errors', async () => {
    const body = { ok: false, error: { code: 'AUTH', message: 'x' } };
    const keyErr = await workerFetch(
      config,
      '/v1/health',
      {},
      respond(body, 401, { 'WWW-Authenticate': 'Bearer realm="oa-lens"' }),
    );
    expect(keyErr).toMatchObject({ ok: false, error: { code: 'KEY_MISMATCH' } });

    const upstream = await workerFetch(config, '/v1/health', {}, respond(body, 401));
    expect(upstream).toMatchObject({ ok: false, error: { code: 'AUTH', status: 401 } });
  });

  it('passes Worker errors through', async () => {
    const f = respond(
      { ok: false, error: { code: 'RATE_LIMIT', message: 'slow down', retryAfter: 2 } },
      429,
    );
    expect(await workerFetch(config, '/v1/x', {}, f)).toEqual({
      ok: false,
      error: { code: 'RATE_LIMIT', message: 'slow down', retryAfter: 2, status: 429 },
    });
  });
});
