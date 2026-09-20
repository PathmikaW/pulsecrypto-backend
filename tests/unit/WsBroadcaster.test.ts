import { describe, it, expect, vi } from 'vitest';
import { WsBroadcaster } from '../../src/infrastructure/websocket/WsBroadcaster.js';
import { ClientRegistry } from '../../src/infrastructure/websocket/ClientRegistry.js';
import type { MarketUpdate } from '../../src/domain/models/MarketUpdate.js';

// Mock `ws` object exposing a controllable bufferedAmount — no real socket needed
// (specs/buffering-strategy.md's own testability section calls for exactly this).
function mockWs(bufferedAmount: number) {
  return {
    bufferedAmount,
    send: vi.fn(),
    close: vi.fn(),
  } as unknown as import('ws').default;
}

const update: MarketUpdate = {
  pair: 'BTCUSDT',
  timestamp: 1,
  lastUpdatedAt: 1,
  price: 1,
  change24h: 0,
  spread: 1,
  buyPressure: 50,
  sellPressure: 50,
  bids: [],
  asks: [],
};

describe('WsBroadcaster.broadcast', () => {
  it('sends to a client under the buffered-bytes threshold and resets its skip counter', () => {
    const registry = new ClientRegistry();
    const ws = mockWs(0);
    const entry = registry.add(ws);
    entry.consecutiveSkips = 3; // pretend it had skipped before

    const broadcaster = new WsBroadcaster(registry, 65536, 10);
    broadcaster.broadcast(update);

    expect(ws.send).toHaveBeenCalledWith(JSON.stringify(update));
    expect(entry.consecutiveSkips).toBe(0);
  });

  it('skips a client over the threshold without closing it, on a single skip', () => {
    const registry = new ClientRegistry();
    const ws = mockWs(100_000); // over the 65536 default threshold
    const entry = registry.add(ws);

    const broadcaster = new WsBroadcaster(registry, 65536, 10);
    broadcaster.broadcast(update);

    expect(ws.send).not.toHaveBeenCalled();
    expect(ws.close).not.toHaveBeenCalled();
    expect(entry.consecutiveSkips).toBe(1);
    expect(registry.size).toBe(1); // still registered
  });

  it('evicts a client after MAX_CONSECUTIVE_SKIPS consecutive skips, close code 1013', () => {
    const registry = new ClientRegistry();
    const ws = mockWs(100_000);
    registry.add(ws);

    const broadcaster = new WsBroadcaster(registry, 65536, 3);
    broadcaster.broadcast(update); // skip 1
    broadcaster.broadcast(update); // skip 2
    expect(registry.size).toBe(1);
    broadcaster.broadcast(update); // skip 3 -> evict

    expect(ws.close).toHaveBeenCalledWith(1013, 'Try again later');
    expect(registry.size).toBe(0); // removed from the registry
  });

  it('broadcasts independently to multiple clients in one tick', () => {
    const registry = new ClientRegistry();
    const fastClient = mockWs(0);
    const slowClient = mockWs(100_000);
    registry.add(fastClient);
    registry.add(slowClient);

    const broadcaster = new WsBroadcaster(registry, 65536, 10);
    broadcaster.broadcast(update);

    expect(fastClient.send).toHaveBeenCalled();
    expect(slowClient.send).not.toHaveBeenCalled();
  });
});
