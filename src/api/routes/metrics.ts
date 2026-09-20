import type { FastifyPluginAsync } from 'fastify';

export interface MetricsExporter {
  contentType: string;
  metrics(): Promise<string>;
}

const metricsRoute: FastifyPluginAsync<{ exporter: MetricsExporter }> = async (fastify, opts) => {
  fastify.get('/metrics', async (_request, reply) => {
    reply.header('Content-Type', opts.exporter.contentType);
    return opts.exporter.metrics();
  });
};

export default metricsRoute;
