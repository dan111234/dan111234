import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { ApiError } from '../lib/errors';
import { liveBody } from '../lib/respond';
import { deleteBuyCost, getBuyCost, putBuyCost } from '../userdata/buycost';
import { asinParam, conditionParam } from './spapi';

const MP = 'us';

function costValue(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new ApiError('BAD_REQUEST', `Invalid cost: ${String(v)}`);
  return n;
}

/** Mounted at /v1/userdata (docs/07 §5). */
export const userdataRoutes = new Hono<AppEnv>()
  .get('/buycost/:asin', async (c) =>
    c.json(liveBody(await getBuyCost(c.env.DB, MP, asinParam(c), conditionParam(c)))),
  )
  .put('/buycost/:asin', async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      fba?: unknown;
      fbm?: unknown;
      condition?: unknown;
    } | null;
    if (!body) throw new ApiError('BAD_REQUEST', 'JSON body required');
    const condition = body.condition === 'used' ? 'used' : 'new';
    const saved = await putBuyCost(c.env.DB, MP, {
      asin: asinParam(c),
      condition,
      fba: costValue(body.fba),
      fbm: costValue(body.fbm),
    });
    return c.json(liveBody(saved));
  })
  .delete('/buycost/:asin', async (c) => {
    await deleteBuyCost(c.env.DB, MP, asinParam(c), conditionParam(c));
    return c.json(liveBody(null));
  });
