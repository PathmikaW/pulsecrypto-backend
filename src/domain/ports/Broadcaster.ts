import type { MarketUpdate } from '../models/MarketUpdate.js';

/** Outbound port: what a transport adapter must implement. Implemented by WsBroadcaster. */
export interface Broadcaster {
  broadcast(update: MarketUpdate): void;
}
