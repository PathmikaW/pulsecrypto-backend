import type { OrderBookLevel } from '../models/OrderBook.js';

export interface PressureResult {
  spread: number;
  buyPressure: number;
  sellPressure: number;
}

/**
 * Pure function — spread and buy/sell pressure from the top N order book levels (ADR-B5).
 * Formulas are exact; see specs/pressure-spread-formula.md. Do not approximate or "improve."
 */
export function calculatePressureAndSpread(
  bids: OrderBookLevel[],
  asks: OrderBookLevel[],
  depth: number
): PressureResult {
  const topBids = bids.slice(0, depth);
  const topAsks = asks.slice(0, depth);

  const highestBid = bids[0]?.price;
  const lowestAsk = asks[0]?.price;
  // Defensive default — see specs/pressure-spread-formula.md "Edge cases". Should be
  // unreachable in normal operation; the realistic trigger is a transient empty snapshot
  // right after a (re)connect. Consumers must treat an empty book as "not yet available,"
  // not trust spread === 0 as a real value.
  const spread = highestBid !== undefined && lowestAsk !== undefined ? lowestAsk - highestBid : 0;

  const bidVolume = topBids.reduce((sum, l) => sum + l.quantity, 0);
  const askVolume = topAsks.reduce((sum, l) => sum + l.quantity, 0);
  const totalVolume = bidVolume + askVolume;

  // totalVolume === 0 would otherwise divide-by-zero to NaN — default to a neutral 50/50
  // split, since an empty book carries no directional signal either way.
  const buyPressure = totalVolume === 0 ? 50 : (bidVolume / totalVolume) * 100;
  const sellPressure = 100 - buyPressure; // complement by construction — never independently summed

  return { spread, buyPressure, sellPressure };
}
