import { describe, it, expect, vi, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import app from '../../src/app.js';
import { GetPairsMeta } from '../../src/application/GetPairsMeta.js';
import { metricsRegistry } from '../../src/infrastructure/observability/Metrics.js';
import { SupportedPairsMetaSchema } from '../../contracts/schemas.js';
import type { MetadataProvider } from '../../src/domain/ports/MetadataProvider.js';
import type { PairMeta } from '../../src/domain/models/PairMeta.js';

const REQUIRED = ['BTCUSDT', 'ETHUSDT'];
const RESOLVED = [...REQUIRED, 'SOLUSDT'];
const RESOLVED_AT = '2026-09-17T10:00:00.000Z';
const silentLogger = { warn: vi.fn() };

const realPairs: PairMeta[] = RESOLVED.map((symbol) => ({
  symbol,
  displayName: `${symbol.slice(0, -4)}/USDT`,
  tradingStatus: 'TRADING',
  high24h: 2,
  low24h: 1,
  volume24h: 10,
  marketCap: 5,
}));

let server: FastifyInstance;

async function buildServer(provider: MetadataProvider): Promise<FastifyInstance> {
  const getPairsMeta = new GetPairsMeta(provider, RESOLVED, REQUIRED, RESOLVED_AT, silentLogger);
  server = Fastify();
  await server.register(app, { getPairsMeta, metricsExporter: metricsRegistry });
  await server.ready();
  return server;
}

afterEach(async () => {
  await server?.close();
});

describe('REST contract', () => {
  it('GET /pairs/meta returns a body that satisfies the shared contract', async () => {
    await buildServer({ getPairsMeta: vi.fn().mockResolvedValue(realPairs) });

    const res = await server.inject({ method: 'GET', url: '/pairs/meta' });

    expect(res.statusCode).toBe(200);
    const body = SupportedPairsMetaSchema.parse(res.json());
    expect(body.resolvedAt).toBe(RESOLVED_AT);
    expect(body.pairs.map((p) => p.symbol)).toEqual(RESOLVED);
  });

  it('GET /pairs/meta falls back to the required pairs only when Binance is unreachable', async () => {
    await buildServer({ getPairsMeta: vi.fn().mockRejectedValue(new Error('Binance down')) });

    const res = await server.inject({ method: 'GET', url: '/pairs/meta' });

    expect(res.statusCode).toBe(200);
    const body = SupportedPairsMetaSchema.parse(res.json());
    expect(body.pairs.map((p) => p.symbol)).toEqual(REQUIRED);
  });

  it('GET /health reports liveness without depending on Binance', async () => {
    await buildServer({ getPairsMeta: vi.fn().mockRejectedValue(new Error('Binance down')) });

    const res = await server.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
  });

  it('GET /metrics exposes the Prometheus metrics named in ADR-B8', async () => {
    await buildServer({ getPairsMeta: vi.fn().mockResolvedValue(realPairs) });

    const res = await server.inject({ method: 'GET', url: '/metrics' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    for (const name of [
      'pulsecrypto_ws_connections_active',
      'pulsecrypto_ws_messages_broadcast_total',
      'pulsecrypto_ws_messages_dropped_total',
      'pulsecrypto_binance_messages_received_total',
      'pulsecrypto_supported_pairs_count',
    ]) {
      expect(res.body).toContain(name);
    }
  });
});
