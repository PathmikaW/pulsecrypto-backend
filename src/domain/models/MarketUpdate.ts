import type { OrderBookLevel } from './OrderBook.js';

export interface MarketUpdate {
  pair: string;
  /** unix seconds — broadcast tick time */
  timestamp: number;
  /** ms epoch — set once per broadcast tick */
  lastUpdatedAt: number;
  price: number;
  /** percentage, from the @ticker stream — signed, e.g. -2.5 for a 2.5% drop */
  change24h: number;
  spread: number;
  buyPressure: number;
  sellPressure: number;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}
