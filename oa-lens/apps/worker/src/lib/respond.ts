import type { ApiFail, ApiOk } from '@oa-lens/shared';
import type { CachedResult } from './cache';
import type { ApiError } from './errors';

export function okBody<T>(result: CachedResult<T>): ApiOk<T> {
  return { ok: true, data: result.data, cached: result.cached, fetchedAt: result.fetchedAt };
}

export function liveBody<T>(data: T): ApiOk<T> {
  return { ok: true, data, cached: false, fetchedAt: Date.now() };
}

export function failBody(err: ApiError): ApiFail {
  return { ok: false, error: err.toBody() };
}
