import type { OrderBookLevel } from './OrderBook.js';

/** Discriminated union so applyUpdate only touches the fields a given message carries. */
export type BinanceStreamUpdate = BinanceDepthUpdate | BinanceTickerUpdate;

export interface BinanceDepthUpdate {
  type: 'depth';
  pair: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

export interface BinanceTickerUpdate {
  type: 'ticker';
  pair: string;
  price: number;
  change24h: number;
}
