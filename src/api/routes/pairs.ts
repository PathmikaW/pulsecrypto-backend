import type { FastifyPluginAsync } from 'fastify';
import type { GetPairsMeta } from '../../application/GetPairsMeta.js';

export interface PairsRouteOptions {
  getPairsMeta: GetPairsMeta;
}

/** GET /pairs/meta → GetPairsMeta use-case (specs/api-contract.md). */
const pairsRoute: FastifyPluginAsync<PairsRouteOptions> = async (fastify, opts) => {
  fastify.get('/pairs/meta', async () => opts.getPairsMeta.execute());
};

export default pairsRoute;
