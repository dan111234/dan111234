// Worker response envelope (docs/07 §1).

export type ApiErrorCode = 'AUTH' | 'RATE_LIMIT' | 'NOT_FOUND' | 'UPSTREAM' | 'BAD_REQUEST';

export interface ApiErrorBody {
  code: ApiErrorCode;
  message: string;
  /** Seconds to wait before retrying (RATE_LIMIT only). */
  retryAfter?: number;
}

export interface ApiOk<T> {
  ok: true;
  data: T;
  cached: boolean;
  /** Unix ms when the upstream data was fetched (not when it was served from cache). */
  fetchedAt: number;
}

export interface ApiFail {
  ok: false;
  error: ApiErrorBody;
}

export type ApiResult<T> = ApiOk<T> | ApiFail;

/** Per-part result inside bundled responses (docs/07 §3). */
export type PartResult<T> = { ok: true; data: T } | { ok: false; error: ApiErrorBody };

export const SECRET_NAMES = [
  'LWA_CLIENT_ID',
  'LWA_CLIENT_SECRET',
  'LWA_REFRESH_TOKEN',
  'SELLER_ID',
  'KEEPA_API_KEY',
  'EXT_SHARED_KEY',
] as const;

export type SecretName = (typeof SECRET_NAMES)[number];

export interface HealthCheck {
  ok: boolean;
  error?: ApiErrorBody;
}

export interface HealthDTO {
  worker: { ok: true; version: string };
  /** Which secrets are set (values are never returned). */
  secrets: Record<SecretName, boolean>;
  /** Present only with `?deep=1`. LWA token + Sellers API call. */
  spapi?: HealthCheck & { marketplaces?: string[] };
  /** Present only with `?deep=1`. Listings Restrictions call with SELLER_ID. */
  seller?: HealthCheck & { sellerId?: string };
  /** Present only with `?deep=1`. Keepa /token (costs no tokens). */
  keepa?: HealthCheck & { tokensLeft?: number; refillIn?: number };
}
