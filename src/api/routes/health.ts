import type { FastifyPluginAsync } from 'fastify';

/** GET /health — liveness check only; Binance reachability doesn't gate it (ADR-B6's fallback already handles that). */
const healthRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async () => ({ status: 'ok' }));
};

export default healthRoute;
