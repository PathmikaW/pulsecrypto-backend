import type { PairMeta } from '../models/PairMeta.js';

export interface MetadataProvider {
  getPairsMeta(pairs: string[]): Promise<PairMeta[]>;
}
