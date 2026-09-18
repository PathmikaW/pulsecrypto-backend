import { describe, it, expect, vi } from 'vitest';
import { processMarketTick } from '../../src/application/ProcessMarketTick.js';
import { createEmptyPairState } from '../../src/domain/models/PairState.js';
import type { Broadcaster } from '../../src/domain/ports/Broadcaster.js';
import type { PairState } from '../../src/domain/models/PairState.js';

function mockBroadcaster(): Broadcaster {
  return { broadcast: vi.fn() };
}

describe('processMarketTick', () => {
  it('broadcasts one MarketUpdate per tracked pair, with lastUpdatedAt set to the tick time', () => {
    const state: PairState = {
      ...createEmptyPairState('BTCUSDT'),
      price: 65000,
      bids: [{ price: 64999, quantity: 1 }],
      asks: [{ price: 65001, quantity: 1 }],
    };
    const stateMap = new Map([['BTCUSDT', state]]);
    const broadcaster = mockBroadcaster();

    processMarketTick(stateMap, broadcaster, 10, 1_700_000_000_000);

    expect(broadcaster.broadcast).toHaveBeenCalledTimes(1);
    const update = (broadcaster.broadcast as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(update.pair).toBe('BTCUSDT');
    expect(update.price).toBe(65000);
    expect(update.lastUpdatedAt).toBe(1_700_000_000_000);
    expect(update.timestamp).toBe(1_700_000_000); // seconds, not ms
    expect(update.spread).toBe(2); // 65001 - 64999
  });

  it('broadcasts independently for every pair in the map, in one tick', () => {
    const stateMap = new Map([
      ['BTCUSDT', createEmptyPairState('BTCUSDT')],
      ['ETHUSDT', createEmptyPairState('ETHUSDT')],
    ]);
    const broadcaster = mockBroadcaster();

    processMarketTick(stateMap, broadcaster, 10);

    expect(broadcaster.broadcast).toHaveBeenCalledTimes(2);
  });

  it('defaults `now` to the real clock when not provided', () => {
    const stateMap = new Map([['BTCUSDT', createEmptyPairState('BTCUSDT')]]);
    const broadcaster = mockBroadcaster();
    const before = Date.now();

    processMarketTick(stateMap, broadcaster, 10);

    const update = (broadcaster.broadcast as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(update.lastUpdatedAt).toBeGreaterThanOrEqual(before);
  });
});
