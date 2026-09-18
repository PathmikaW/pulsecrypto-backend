import type { BinanceStreamUpdate } from '../models/BinanceStreamUpdate.js';

/** Inbound port: what an exchange adapter must implement. Implemented by BinanceWsAdapter. */
export interface MarketDataSource {
  connect(pairs: string[]): void;
  onMessage(callback: (update: BinanceStreamUpdate) => void): void;
  disconnect(): void;
}
