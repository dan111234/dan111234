import type { ApiErrorBody, ApiErrorCode } from '@oa-lens/shared';

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  AUTH: 401,
  RATE_LIMIT: 429,
  NOT_FOUND: 404,
  UPSTREAM: 502,
  BAD_REQUEST: 400,
};

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get status(): number {
    return STATUS_BY_CODE[this.code];
  }

  toBody(): ApiErrorBody {
    return this.retryAfter == null
      ? { code: this.code, message: this.message }
      : { code: this.code, message: this.message, retryAfter: this.retryAfter };
  }
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new ApiError('UPSTREAM', message);
}

/** Maps an upstream HTTP status to our error code. */
export function codeForStatus(status: number): ApiErrorCode {
  if (status === 401 || status === 403) return 'AUTH';
  if (status === 404) return 'NOT_FOUND';
  if (status === 429) return 'RATE_LIMIT';
  if (status >= 400 && status < 500) return 'BAD_REQUEST';
  return 'UPSTREAM';
}
