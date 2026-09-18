import type { PairMeta } from '../models/PairMeta.js';

/** Outbound port: what a metadata source must implement. Implemented by BinanceRestAdapter. */
export interface MetadataProvider {
  getPairsMeta(pairs: string[]): Promise<PairMeta[]>;
}
