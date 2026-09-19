import type { FastifyPluginAsync } from 'fastify';
import type { GetPairsMeta } from '../../application/GetPairsMeta.js';

export interface PairsRouteOptions {
  getPairsMeta: GetPairsMeta;
}

const pairsRoute: FastifyPluginAsync<PairsRouteOptions> = async (fastify, opts) => {
  fastify.get('/pairs/meta', async () => opts.getPairsMeta.execute());
};

export default pairsRoute;
