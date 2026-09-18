import Fastify from 'fastify';
import { env } from './config/env.js';
import { REQUIRED_PAIRS } from './config/pairs.js';
import { logger } from './infrastructure/observability/Logger.js';
import { metrics } from './infrastructure/observability/Metrics.js';
import { resolveSupportedPairs } from './application/ResolveSupportedPairs.js';
import { BinancePairResolver } from './infrastructure/binance/BinancePairResolver.js';
import { BinanceRestAdapter } from './infrastructure/binance/BinanceRestAdapter.js';
import { BinanceWsAdapter } from './infrastructure/binance/BinanceWsAdapter.js';
import { GetPairsMeta } from './application/GetPairsMeta.js';
import { processMarketTick } from './application/ProcessMarketTick.js';
import { ClientRegistry } from './infrastructure/websocket/ClientRegistry.js';
import { WsBroadcaster } from './infrastructure/websocket/WsBroadcaster.js';
import { createWsServer } from './infrastructure/websocket/WsServer.js';
import { applyUpdate } from './domain/services/ConflationEngine.js';
import { createEmptyPairState } from './domain/models/PairState.js';
import type { PairState } from './domain/models/PairState.js';
import app from './app.js';

async function main(): Promise<void> {
  // 1. Env already loaded/validated at import time (config/env.ts throws on invalid config).

  // 2. Resolve the supported pair list — the only step with a graceful fallback path (ADR-B3).
  const pairResolver = new BinancePairResolver();
  const resolvedPairs = await resolveSupportedPairs(
    pairResolver,
    REQUIRED_PAIRS,
    env.EXTRA_PAIRS_COUNT,
    env.PAIR_RESOLUTION_TIMEOUT_MS
  );
  const resolvedAt = new Date().toISOString();

  // 5. Observable in production whether the fallback path was taken (ADR-B8).
  metrics.supportedPairsCount.set(resolvedPairs.length);
  logger.info({ resolvedPairs, resolvedAt }, 'Supported pairs resolved');

  // 3. Only now are the remaining adapters instantiated — they need the resolved list.
  const stateMap = new Map<string, PairState>(
    resolvedPairs.map((pair) => [pair, createEmptyPairState(pair)])
  );

  const clientRegistry = new ClientRegistry();
  const broadcaster = new WsBroadcaster(clientRegistry);

  const wsAdapter = new BinanceWsAdapter();
  wsAdapter.onMessage((update) => {
    const current = stateMap.get(update.pair);
    if (!current) return; // message for a pair we're not tracking — ignore, don't throw
    stateMap.set(update.pair, applyUpdate(current, update));
    metrics.binanceMessagesReceived.inc();
  });

  // 4. GetPairsMeta and the broadcast tick are both wired with the same resolved list.
  const restAdapter = new BinanceRestAdapter();
  const getPairsMeta = new GetPairsMeta(restAdapter, resolvedPairs, REQUIRED_PAIRS, resolvedAt);

  // loggerInstance (not logger — that only accepts a plain config object, not a
  // pre-built pino instance; confirmed against Fastify's own logger-factory.js source
  // after hitting FST_ERR_LOG_INVALID_LOGGER_CONFIG running this for real).
  const fastify = Fastify({ loggerInstance: logger });
  await fastify.register(app, { getPairsMeta });
  await fastify.listen({ port: env.PORT, host: '0.0.0.0' });

  createWsServer(fastify.server, clientRegistry, {
    allowedOrigins: env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',') : [],
    maxConnectionsPerIp: env.MAX_CONNECTIONS_PER_IP,
  });

  setInterval(() => {
    processMarketTick(stateMap, broadcaster, env.ORDER_BOOK_PRESSURE_DEPTH);
  }, env.BROADCAST_INTERVAL_MS);

  wsAdapter.connect(resolvedPairs);

  logger.info({ port: env.PORT }, 'PulseCrypto backend started');
}

main().catch((err) => {
  logger.error({ err }, 'Fatal startup error');
  process.exit(1);
});
