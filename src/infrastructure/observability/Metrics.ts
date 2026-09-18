import { Counter, Gauge, Histogram, register } from '@prometheus-io/client';

// @prometheus-io/client is the official Prometheus org package — prom-client (the
// community package this project originally planned per ADR-B8) is deprecated in its
// favor as of this scaffold. Same lineage/API (it was previously published as
// prom-client), not a rewrite, so this is a safe substitution.

export const metrics = {
  wsConnectionsActive: new Gauge({
    name: 'pulsecrypto_ws_connections_active',
    help: 'Current connected WebSocket client count',
  }),
  wsMessagesBroadcast: new Counter({
    name: 'pulsecrypto_ws_messages_broadcast_total',
    help: 'Successful broadcast messages sent',
  }),
  wsMessagesDropped: new Counter({
    name: 'pulsecrypto_ws_messages_dropped_total',
    help: 'Messages dropped due to backpressure (skip or eviction) — ADR-B4',
  }),
  wsBroadcastLatency: new Histogram({
    name: 'pulsecrypto_ws_broadcast_latency_seconds',
    help: 'Time from tick start to broadcast completion',
  }),
  binanceMessagesReceived: new Counter({
    name: 'pulsecrypto_binance_messages_received_total',
    help: 'Inbound messages from the Binance stream',
  }),
  supportedPairsCount: new Gauge({
    name: 'pulsecrypto_supported_pairs_count',
    help: 'Number of pairs resolved at startup — confirms whether the ADR-B3 fallback path was taken',
  }),
};

export { register as metricsRegistry };
