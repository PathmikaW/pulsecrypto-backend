# Stream Processing & Backpressure — Implementation Spec

Source: ADR-B4. Implements the assignment's requirement to buffer/batch updates, emit at a
configurable interval, and prevent slow consumers from causing unbounded memory growth.

## Conflation (the buffering model)

**State:** a single `Map<string, PairState>` in `domain` state (owned by `application`,
wired via `server.ts`), keyed by the resolved pair list (ADR-B3). Not one map per client —
one map, period. Size is fixed at the resolved pair count regardless of connected client
count or Binance message rate.

**Ingestion:** every incoming Binance message updates the corresponding `PairState` entry
in place — this is `ConflationEngine.applyUpdate(state, incomingMessage): PairState`, a
pure function (state in, new state out — no direct mutation inside the function itself,
even though the caller stores the result back into the map).

**Emission:** a `setInterval` (or equivalent) timer fires every `BROADCAST_INTERVAL_MS`
(default 100ms, configurable via env). On each tick:

1. Iterate the map.
2. For each pair, compute the broadcast payload: run `PressureCalculator` on the current
   order book, assemble the `MarketUpdate` shape (see `data-models.md`), and set
   `lastUpdatedAt = Date.now()` — **the tick's own timestamp, not any timestamp carried on
   the underlying Binance message.** This is the single point in the codebase where
   `lastUpdatedAt` is set; nowhere else should compute or override it.
3. Call the per-client backpressure check (below) and write to each surviving client.

This is what bounds memory structurally: no matter how fast Binance emits updates upstream,
only one snapshot per pair exists at any moment, and only one broadcast per pair goes out
per tick — intermediate updates between ticks are absorbed into the next snapshot, not
queued.

## Backpressure (the single mechanism — do not add a second one)

For each connected client, on each tick, before writing:

```typescript
if (client.ws.bufferedAmount > MAX_BUFFERED_BYTES) {
  client.consecutiveSkips += 1;
  if (client.consecutiveSkips >= MAX_CONSECUTIVE_SKIPS) {
    client.ws.close(1013, 'Try again later');
    metrics.wsMessagesDropped.inc(); // eviction counts as a drop too
    registry.remove(client);
  }
  metrics.wsMessagesDropped.inc();
  return; // skip this client for this tick — no queuing, no retry of the skipped message
}
client.consecutiveSkips = 0;
client.ws.send(payload);
metrics.wsMessagesBroadcast.inc();
```

`MAX_BUFFERED_BYTES` default `65536` (64KB). `MAX_CONSECUTIVE_SKIPS` default `10` (~1s at
the default 100ms interval).

**Do not implement:**

- A per-client message queue (bounded or unbounded).
- A separate time-based "lag" timeout independent of `bufferedAmount`.

Both were evaluated in ADR-B4 and rejected as redundant — the latest-state conflation model
already guarantees at most one pending logical message per pair per client, so
`bufferedAmount` alone is a sufficient and sole signal.

## `ClientRegistry`

Tracks: the `ws` instance, `consecutiveSkips` counter, connection timestamp. One instance
shared across the process (not per-pair, not per-tick) — `infrastructure/websocket/ClientRegistry.ts`.

## Testability

- `ConflationEngine.applyUpdate` — pure function, unit test with fixture Binance messages.
- The tick handler's backpressure branch — unit test with a mock `ws` object exposing a
  controllable `bufferedAmount`, asserting skip/eviction behavior without a real socket.
- No live Binance connection needed for either.
