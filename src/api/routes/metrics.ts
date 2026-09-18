import type { FastifyPluginAsync } from 'fastify';
import { metricsRegistry } from '../../infrastructure/observability/Metrics.js';

/** GET /metrics — Prometheus exposition format (ADR-B8). */
const metricsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/metrics', async (_request, reply) => {
    reply.header('Content-Type', metricsRegistry.contentType);
    return metricsRegistry.metrics();
  });
};

export default metricsRoute;
