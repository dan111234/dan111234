export interface Env {
  DB: D1Database;
  CACHE: KVNamespace;

  /** Comma-separated chrome-extension:// origins. Empty = any extension origin. */
  ALLOWED_ORIGINS?: string;

  // Secrets (`wrangler secret put` / .dev.vars). Never log or return these.
  LWA_CLIENT_ID?: string;
  LWA_CLIENT_SECRET?: string;
  LWA_REFRESH_TOKEN?: string;
  SELLER_ID?: string;
  KEEPA_API_KEY?: string;
  EXT_SHARED_KEY?: string;
}

export type AppEnv = { Bindings: Env };
