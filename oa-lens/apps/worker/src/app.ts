import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppEnv } from './env';
import { allowedOrigin, bearerAuth } from './lib/auth';
import { ApiError, toApiError } from './lib/errors';
import { failBody } from './lib/respond';
import { healthRoutes } from './routes/health';
import { keepaRoutes, quotaRoutes } from './routes/keepa';
import { privacyRoutes } from './routes/privacy';
import { productRoutes } from './routes/product';
import { spapiRoutes } from './routes/spapi';
import { userdataRoutes } from './routes/userdata';

export function createApp() {
  const app = new Hono<AppEnv>();

  // CORS first so preflight requests (which carry no Authorization header) are answered.
  app.use(
    '*',
    cors({
      origin: (origin, c) => allowedOrigin(origin, c.env.ALLOWED_ORIGINS),
      allowHeaders: ['Authorization', 'Content-Type'],
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      exposeHeaders: ['WWW-Authenticate', 'Retry-After'],
      maxAge: 86400,
    }),
  );
  app.use('/v1/*', bearerAuth);

  app.route('/privacy', privacyRoutes);
  app.route('/v1', healthRoutes);
  app.route('/v1/userdata', userdataRoutes);
  app.route('/v1/quota', quotaRoutes);
  app.route('/v1/:mp/spapi', spapiRoutes);
  app.route('/v1/:mp/product', productRoutes);
  app.route('/v1/:mp/keepa', keepaRoutes);

  app.notFound((c) => c.json(failBody(new ApiError('NOT_FOUND', 'Route not found')), 404));
  app.onError((err, c) => {
    const apiErr = toApiError(err);
    if (apiErr.code === 'UPSTREAM' && !(err instanceof ApiError)) {
      console.error('Unhandled error', err instanceof Error ? err.stack : err);
    }
    if (apiErr.retryAfter != null) c.header('Retry-After', String(apiErr.retryAfter));
    return c.json(failBody(apiErr), apiErr.status as 400);
  });

  return app;
}
