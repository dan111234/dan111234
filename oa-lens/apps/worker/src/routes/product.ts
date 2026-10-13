import type { PartResult, ProductBundleDTO, RestrictionDTO } from '@oa-lens/shared';
import { Hono } from 'hono';
import { toApiError } from '../lib/errors';
import { liveBody } from '../lib/respond';
import { loaders } from '../spapi/loaders';
import { NEW_CONDITIONS, USED_CONDITIONS } from '../spapi/restrictions';
import { getBuyCost } from '../userdata/buycost';
import { asinParam, conditionParam, requireMp, type MpEnv } from './spapi';

async function part<T>(work: () => Promise<T>): Promise<PartResult<T>> {
  try {
    return { ok: true, data: await work() };
  } catch (err) {
    return { ok: false, error: toApiError(err).toBody() };
  }
}

/**
 * GET /v1/:mp/product/:asin?condition=new|used (docs/07 §3). Every part is fetched in parallel and
 * reported on its own, so one failure does not hide the rest. `fresh=1` re-checks restrictions.
 */
export const productRoutes = new Hono<MpEnv>().use('*', requireMp).get('/:asin', async (c) => {
  const mp = c.get('mp');
  const asin = asinParam(c);
  const condition = conditionParam(c);
  const fresh = c.req.query('fresh') === '1';
  const env = c.env;
  const conditionTypes = condition === 'new' ? NEW_CONDITIONS : USED_CONDITIONS;

  const [catalog, offers, feesTiered, restrictions, eligibility, buyCost] = await Promise.all([
    part(async () => (await loaders.catalog(env, mp, asin)).data),
    part(async () => (await loaders.offers(env, mp, asin, condition)).data),
    part(async () => (await loaders.feesTiered(env, mp, asin)).data),
    part(async (): Promise<RestrictionDTO[]> =>
      Promise.all(
        conditionTypes.map(
          async (t) => (await loaders.restriction(env, mp, asin, t, { fresh })).data,
        ),
      ),
    ),
    part(async () => (await loaders.eligibility(env, mp, asin)).data),
    part(() => getBuyCost(env.DB, mp, asin, condition)),
  ]);

  const data: ProductBundleDTO = {
    asin,
    condition,
    catalog,
    offers,
    feesTiered,
    restrictions,
    eligibility,
    buyCost,
  };
  return c.json(liveBody(data));
});
