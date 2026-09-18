import { describe, it, expect } from 'vitest';
import { applyUpdate } from '../../src/domain/services/ConflationEngine.js';
import { createEmptyPairState } from '../../src/domain/models/PairState.js';
import type { BinanceStreamUpdate } from '../../src/domain/models/BinanceStreamUpdate.js';

describe('ConflationEngine.applyUpdate', () => {
  it('applies a depth update: replaces bids/asks, leaves price/change24h untouched', () => {
    const state = { ...createEmptyPairState('BTCUSDT'), price: 100, change24h: 1.5 };
    const update: BinanceStreamUpdate = {
      type: 'depth',
      pair: 'BTCUSDT',
      bids: [{ price: 99, quantity: 1 }],
      asks: [{ price: 101, quantity: 1 }],
    };

    const result = applyUpdate(state, update, 12345);

    expect(result.bids).toEqual(update.bids);
    expect(result.asks).toEqual(update.asks);
    expect(result.price).toBe(100);
    expect(result.change24h).toBe(1.5);
    expect(result.updatedAt).toBe(12345);
  });

  it('applies a ticker update: replaces price/change24h, leaves bids/asks untouched', () => {
    const state = {
      ...createEmptyPairState('BTCUSDT'),
      bids: [{ price: 99, quantity: 1 }],
      asks: [{ price: 101, quantity: 1 }],
    };
    const update: BinanceStreamUpdate = { type: 'ticker', pair: 'BTCUSDT', price: 65000, change24h: 2.3 };

    const result = applyUpdate(state, update, 99999);

    expect(result.price).toBe(65000);
    expect(result.change24h).toBe(2.3);
    expect(result.bids).toEqual(state.bids);
    expect(result.asks).toEqual(state.asks);
    expect(result.updatedAt).toBe(99999);
  });

  it('does not mutate the input state object', () => {
    const state = createEmptyPairState('BTCUSDT');
    const frozen = Object.freeze({ ...state });
    const update: BinanceStreamUpdate = { type: 'ticker', pair: 'BTCUSDT', price: 1, change24h: 1 };

    expect(() => applyUpdate(frozen, update)).not.toThrow();
  });

  it('defaults `now` to the real clock when not provided', () => {
    const before = Date.now();
    const result = applyUpdate(createEmptyPairState('BTCUSDT'), {
      type: 'ticker',
      pair: 'BTCUSDT',
      price: 1,
      change24h: 1,
    });
    const after = Date.now();
    expect(result.updatedAt).toBeGreaterThanOrEqual(before);
    expect(result.updatedAt).toBeLessThanOrEqual(after);
  });
});
