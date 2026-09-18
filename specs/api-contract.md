# API Contract

Source: ADR-B1, ADR-B2, ADR-B6, ADR-X1. Types referenced below are defined in
`data-models.md` and implemented as Zod schemas in `contracts/schemas.ts` — that file is
the runtime-enforced source of truth; this document is the human-readable spec of the same
contract.

## WebSocket — `ws://<host>:3000` (root path)

**Connection.** Standard WebSocket upgrade. Origin is validated against an allowlist
(ADR-B9). No subscribe/unsubscribe message required — every connected client receives the
identical broadcast, for every currently-tracked pair, every tick.

**Broadcast message**, sent once per pair per tick, at `BROADCAST_INTERVAL_MS` (default
100ms):

```json
{
  "pair": "BTCUSDT",
  "timestamp": 1720802025,
  "lastUpdatedAt": 1720802025123,
  "price": 109235.42,
  "spread": 0.41,
  "buyPressure": 63,
  "sellPressure": 37,
  "bids": [{ "price": 109235.0, "quantity": 1.203 }, "... up to 20 levels"],
  "asks": [{ "price": 109235.41, "quantity": 0.884 }, "... up to 20 levels"]
}
```

One message per pair (not one message batching all pairs) — this keeps message size small
and constant regardless of how many pairs are tracked, and matches the assignment's
example payload shape directly (one object, one `pair` field).

**No heartbeat/ping-pong message of any kind.** Liveness is inferred by the client from
broadcast cadence itself (ADR-M6, ADR §12.5). Do not implement a ping/pong exchange here.

**Disconnection.** Server-initiated disconnect uses close code `1013` ("Try again later"),
sent only when a client has been skipped for `MAX_CONSECUTIVE_SKIPS` consecutive ticks
(ADR-B4).

## REST — Fastify, `http://<host>:3000`

### `GET /pairs/meta`

Returns metadata for every currently-tracked pair (the resolved list from ADR-B3 — not
necessarily just the five required pairs).

**Response 200:**
```json
{
  "pairs": [
    {
      "symbol": "BTCUSDT",
      "displayName": "BTC/USDT",
      "tradingStatus": "TRADING",
      "high24h": 110500.00,
      "low24h": 107200.00,
      "volume24h": 18234.552
    }
  ],
  "resolvedAt": "2026-09-17T10:00:00.000Z"
}
```
- Source: real data from Binance `GET /api/v3/ticker/24hr`, filtered to the resolved pair
  list, cached in-process for 60 seconds (ADR-B6).
- Fallback: if Binance is unreachable, return mock data for the five required pairs only;
  omit any unresolved additional pairs rather than mocking them.
- This is the endpoint the mobile app's pull-to-refresh calls — it must not touch or
  interrupt the WebSocket connection.

### `GET /health`

**Response 200:** `{ "status": "ok" }` — liveness check only, no dependency checks (Binance
reachability is not health-gating; the pair-resolution fallback already handles that).

### `GET /metrics`

Prometheus exposition format. Metrics listed in full in the backend `CLAUDE.md` /
ADR-B8 — `pulsecrypto_ws_connections_active`, `pulsecrypto_ws_messages_broadcast_total`,
`pulsecrypto_ws_messages_dropped_total`, `pulsecrypto_ws_broadcast_latency_seconds`,
`pulsecrypto_binance_messages_received_total`, `pulsecrypto_supported_pairs_count`.

## Error responses (all REST routes)

Standard shape, validated by Fastify's JSON Schema integration:
```json
{ "statusCode": 400, "error": "Bad Request", "message": "..." }
```
