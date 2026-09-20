import type { MarketUpdate } from '../models/MarketUpdate.js';

export interface Broadcaster {
  broadcast(update: MarketUpdate): void;
}
