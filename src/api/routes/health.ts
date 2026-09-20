import type { FastifyPluginAsync } from 'fastify';

// Liveness only; Binance reachability deliberately does not gate it (ADR-B6).
const healthRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async () => ({ status: 'ok' }));
};

export default healthRoute;
