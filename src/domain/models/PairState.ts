import type { OrderBookLevel } from './OrderBook.js';

export interface PairState {
  pair: string;
  price: number;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  change24h: number;
  /** ms epoch of the last Binance message applied; distinct from lastUpdatedAt (broadcast tick). */
  updatedAt: number;
}

export function createEmptyPairState(pair: string): PairState {
  return { pair, price: 0, bids: [], asks: [], change24h: 0, updatedAt: 0 };
}
