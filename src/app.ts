import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import type { FastifyPluginAsync, FastifyServerOptions } from 'fastify';
import type { GetPairsMeta } from './application/GetPairsMeta.js';
import pairsRoute from './api/routes/pairs.js';
import healthRoute from './api/routes/health.js';
import metricsRoute from './api/routes/metrics.js';
import { env } from './config/env.js';

export interface AppOptions extends FastifyServerOptions {
  getPairsMeta: GetPairsMeta;
}

/**
 * Fastify app setup (ADR-B7) — the composition root (server.ts) instantiates this with
 * the GetPairsMeta use-case already wired, since pair resolution has to complete first.
 */
const app: FastifyPluginAsync<AppOptions> = async (fastify, opts) => {
  await fastify.register(sensible);

  // ADR-B9 defense in depth
  await fastify.register(cors, {
    origin: env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',') : true,
  });
  await fastify.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
  });

  await fastify.register(healthRoute);
  await fastify.register(metricsRoute);
  await fastify.register(pairsRoute, { getPairsMeta: opts.getPairsMeta });
};

export default app;
export { app };
