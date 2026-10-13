import { createApp } from './app';
import type { Env } from './env';

const app = createApp();
const HISTORY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export default {
  fetch: app.fetch,
  scheduled(_controller, env, ctx) {
    // docs/07 §5: drop history older than 30 days.
    ctx.waitUntil(
      env.DB.prepare('DELETE FROM history WHERE viewed_at < ?')
        .bind(Date.now() - HISTORY_RETENTION_MS)
        .run(),
    );
  },
} satisfies ExportedHandler<Env>;
