import type { PairState } from '../domain/models/PairState.js';
import type { MarketUpdate } from '../domain/models/MarketUpdate.js';
import type { Broadcaster } from '../domain/ports/Broadcaster.js';
import { calculatePressureAndSpread } from '../domain/services/PressureCalculator.js';

/** lastUpdatedAt is set once here to the tick time, never the raw Binance message time. */
export function processMarketTick(
  stateMap: Map<string, PairState>,
  broadcaster: Broadcaster,
  pressureDepth: number,
  now: number = Date.now()
): void {
  const tickTimestampSeconds = Math.floor(now / 1000);

  for (const state of stateMap.values()) {
    const { spread, buyPressure, sellPressure } = calculatePressureAndSpread(
      state.bids,
      state.asks,
      pressureDepth
    );

    const update: MarketUpdate = {
      pair: state.pair,
      timestamp: tickTimestampSeconds,
      lastUpdatedAt: now,
      price: state.price,
      change24h: state.change24h,
      spread,
      buyPressure,
      sellPressure,
      bids: state.bids,
      asks: state.asks,
    };

    broadcaster.broadcast(update);
  }
}
