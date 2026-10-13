import type { ApiErrorCode, ApiOk, ApiResult } from '@oa-lens/shared';
import type { WorkerConfig } from './settings';

export type ClientErrorCode = ApiErrorCode | 'NETWORK' | 'NOT_CONFIGURED' | 'KEY_MISMATCH';

export interface ClientError {
  code: ClientErrorCode;
  message: string;
  retryAfter?: number;
  status?: number;
}

export type ClientResult<T> = ApiOk<T> | { ok: false; error: ClientError };

export const DEFAULT_TIMEOUT_MS = 15_000;

export function clientError(
  code: ClientErrorCode,
  message: string,
  extra: Partial<ClientError> = {},
) {
  return { ok: false as const, error: { code, message, ...extra } };
}

/**
 * Calls the Worker with the shared key. Never throws: network failures, timeouts and non-JSON
 * responses come back as `{ ok: false }` so the UI can show the matching docs/02 §L message.
 */
export async function workerFetch<T>(
  config: WorkerConfig | null,
  path: string,
  init: { method?: string; body?: unknown; timeoutMs?: number } = {},
  fetchImpl: typeof fetch = fetch,
): Promise<ClientResult<T>> {
  if (!config) {
    return clientError('NOT_CONFIGURED', 'Worker URL and shared key are not set');
  }

  let res: Response;
  try {
    res = await fetchImpl(`${config.url}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${config.key}`,
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(init.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === 'TimeoutError';
    return clientError(
      'NETWORK',
      timedOut ? 'Worker did not respond in time' : 'Cannot reach the Worker',
    );
  }

  let body: ApiResult<T>;
  try {
    body = (await res.json()) as ApiResult<T>;
  } catch {
    return clientError('NETWORK', `Unexpected response from the Worker (HTTP ${res.status})`, {
      status: res.status,
    });
  }
  if (typeof body !== 'object' || body === null || typeof body.ok !== 'boolean') {
    return clientError('NETWORK', `Unexpected response from the Worker (HTTP ${res.status})`, {
      status: res.status,
    });
  }
  if (body.ok) return body;

  // The Worker marks its own key check with a Bearer challenge; upstream auth errors do not.
  if (res.status === 401 && res.headers.get('WWW-Authenticate')?.startsWith('Bearer')) {
    return clientError('KEY_MISMATCH', body.error.message, { status: res.status });
  }
  return { ok: false, error: { ...body.error, status: res.status } };
}
