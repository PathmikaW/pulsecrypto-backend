import type { OrderBookLevel } from './OrderBook.js';

/**
 * Normalized shape produced by BinanceMessageParser from a raw combined-stream message.
 * The combined stream (@depth20@100ms + @ticker per symbol) carries two distinct payload
 * shapes for the same pair — kept as a discriminated union rather than one merged type, so
 * ConflationEngine.applyUpdate only ever touches the fields a given message actually carries.
 */
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
