import type { OrderBookLevel } from '../models/OrderBook.js';

export interface PressureResult {
  spread: number;
  buyPressure: number;
  sellPressure: number;
}

/** Formulas are exact (specs/pressure-spread-formula.md); do not approximate. */
export function calculatePressureAndSpread(
  bids: OrderBookLevel[],
  asks: OrderBookLevel[],
  depth: number
): PressureResult {
  const topBids = bids.slice(0, depth);
  const topAsks = asks.slice(0, depth);

  const highestBid = bids[0]?.price;
  const lowestAsk = asks[0]?.price;
  // Empty book is a transient state right after (re)connect; consumers must treat it as
  // "not yet available" rather than trust spread === 0.
  const spread = highestBid !== undefined && lowestAsk !== undefined ? lowestAsk - highestBid : 0;

  const bidVolume = topBids.reduce((sum, l) => sum + l.quantity, 0);
  const askVolume = topAsks.reduce((sum, l) => sum + l.quantity, 0);
  const totalVolume = bidVolume + askVolume;

  // An empty book has no directional signal; avoid 0/0 NaN with a neutral 50/50.
  const buyPressure = totalVolume === 0 ? 50 : (bidVolume / totalVolume) * 100;
  const sellPressure = 100 - buyPressure; // complement by construction — never independently summed

  return { spread, buyPressure, sellPressure };
}
