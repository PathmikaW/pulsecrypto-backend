import type { BinanceStreamUpdate } from '../models/BinanceStreamUpdate.js';

export interface MarketDataSource {
  connect(pairs: string[]): void;
  onMessage(callback: (update: BinanceStreamUpdate) => void): void;
  disconnect(): void;
}
