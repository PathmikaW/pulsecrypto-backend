import type { PairState } from '../models/PairState.js';
import type { BinanceStreamUpdate } from '../models/BinanceStreamUpdate.js';

/**
 * Applies one incoming Binance message to a pair's current state, returning a new state
 * object (no mutation of the input — ADR-B4/specs/buffering-strategy.md). `now` is
 * injectable so tests can assert `updatedAt` exactly, defaulting to the real clock in
 * production use.
 */
export function applyUpdate(state: PairState, update: BinanceStreamUpdate, now: number = Date.now()): PairState {
  if (update.type === 'depth') {
    return { ...state, bids: update.bids, asks: update.asks, updatedAt: now };
  }
  return { ...state, price: update.price, change24h: update.change24h, updatedAt: now };
}
