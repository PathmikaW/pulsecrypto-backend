import type { OrderBookLevel } from './OrderBook.js';

/** The WebSocket broadcast payload — one per pair, per tick. Wired up in Phase 2. */
export interface MarketUpdate {
  pair: string;
  /** unix seconds — broadcast tick time */
  timestamp: number;
  /** ms epoch — same tick's wall-clock time, set ONCE by the conflation engine at broadcast time */
  lastUpdatedAt: number;
  price: number;
  spread: number;
  buyPressure: number;
  sellPressure: number;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}
