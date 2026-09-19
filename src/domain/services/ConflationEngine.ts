import type { PairState } from '../models/PairState.js';
import type { BinanceStreamUpdate } from '../models/BinanceStreamUpdate.js';

/** Returns a new state; the input is never mutated (ADR-B4). `now` is injectable for tests. */
export function applyUpdate(
  state: PairState,
  update: BinanceStreamUpdate,
  now: number = Date.now()
): PairState {
  if (update.type === 'depth') {
    return { ...state, bids: update.bids, asks: update.asks, updatedAt: now };
  }
  return { ...state, price: update.price, change24h: update.change24h, updatedAt: now };
}
