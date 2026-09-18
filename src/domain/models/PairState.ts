import type { OrderBookLevel } from './OrderBook.js';

/** The conflation map's value type — one entry per tracked pair, mutated in place by incoming Binance messages. */
export interface PairState {
  pair: string;
  price: number;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  change24h: number;
  /** ms epoch — last time this entry was mutated by an incoming Binance message. Not lastUpdatedAt (broadcast-tick time, set separately in Phase 2). */
  updatedAt: number;
}

export function createEmptyPairState(pair: string): PairState {
  return { pair, price: 0, bids: [], asks: [], change24h: 0, updatedAt: 0 };
}
