import { SECRET_NAMES, type HealthCheck, type HealthDTO, type SecretName } from '@oa-lens/shared';
import { Hono } from 'hono';
import pkg from '../../package.json';
import type { AppEnv, Env } from '../env';
import { getKeepaTokenStatus } from '../keepa/client';
import { toApiError } from '../lib/errors';
import { liveBody } from '../lib/respond';
import { getParticipatingMarketplaces, verifySellerId } from '../spapi/account';
import { getAccessToken } from '../spapi/lwa';

type Settled<T> = { ok: true; value: T } | { ok: false; check: HealthCheck };

async function settle<T>(work: () => Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, value: await work() };
  } catch (err) {
    return { ok: false, check: { ok: false, error: toApiError(err).toBody() } };
  }
}

async function deepChecks(env: Env): Promise<Pick<HealthDTO, 'spapi' | 'seller' | 'keepa'>> {
  const keepaPromise = settle(() => getKeepaTokenStatus(env));
  const sellerId = env.SELLER_ID;

  const token = await settle(() => getAccessToken(env));
  let spapi: HealthDTO['spapi'];
  let seller: HealthDTO['seller'];
  if (!token.ok) {
    spapi = token.check;
    seller = { ...token.check, sellerId };
  } else {
    const [participations, verified] = await Promise.all([
      settle(() => getParticipatingMarketplaces(env)),
      settle(() => verifySellerId(env, 'us')),
    ]);
    seller = verified.ok ? { ok: true, sellerId } : { ...verified.check, sellerId };
    if (participations.ok) {
      spapi = { ok: true, marketplaces: participations.value };
    } else {
      // The Sellers API needs no special role, but if it is refused while Listings worked the
      // connection itself is fine; keep the error for display.
      spapi = { ok: verified.ok, error: participations.check.error };
    }
  }

  const keepa = await keepaPromise;
  return {
    spapi,
    seller,
    keepa: keepa.ok
      ? { ok: true, tokensLeft: keepa.value.tokensLeft, refillIn: keepa.value.refillIn }
      : keepa.check,
  };
}

export const healthRoutes = new Hono<AppEnv>().get('/health', async (c) => {
  const secrets = Object.fromEntries(
    SECRET_NAMES.map((name) => [name, Boolean(c.env[name])]),
  ) as Record<SecretName, boolean>;
  const data: HealthDTO = { worker: { ok: true, version: pkg.version }, secrets };
  if (c.req.query('deep') === '1') Object.assign(data, await deepChecks(c.env));
  return c.json(liveBody(data));
});
