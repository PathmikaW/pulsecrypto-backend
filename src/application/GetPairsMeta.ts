import type { MetadataProvider } from '../domain/ports/MetadataProvider.js';
import type { Logger } from '../domain/ports/Logger.js';
import {
  MARKET_CAP_PLACEHOLDER,
  toDisplayName,
  type PairMeta,
  type SupportedPairsMeta,
} from '../domain/models/PairMeta.js';

/** On fetch failure, serves mock data for the required pairs only (ADR-B6). */
export class GetPairsMeta {
  private cache: { data: SupportedPairsMeta; expiresAt: number } | null = null;

  constructor(
    private readonly metadataProvider: MetadataProvider,
    private readonly resolvedPairs: string[],
    private readonly requiredPairs: string[],
    /** Fixed at startup (ADR-B3), not recomputed per request. */
    private readonly resolvedAt: string,
    private readonly logger: Logger,
    private readonly cacheTtlMs: number = 60_000
  ) {}

  async execute(now: number = Date.now()): Promise<SupportedPairsMeta> {
    if (this.cache && this.cache.expiresAt > now) {
      return this.cache.data;
    }

    let pairs: PairMeta[];
    try {
      pairs = await this.metadataProvider.getPairsMeta(this.resolvedPairs);
    } catch (err) {
      this.logger.warn({ err }, 'Metadata fetch failed — falling back to mock data for required pairs only');
      pairs = this.requiredPairs.map(mockPairMeta);
    }

    const result: SupportedPairsMeta = { pairs, resolvedAt: this.resolvedAt };
    this.cache = { data: result, expiresAt: now + this.cacheTtlMs };
    return result;
  }
}

function mockPairMeta(symbol: string): PairMeta {
  // Placeholder values; reached only when Binance is unreachable.
  return {
    symbol,
    displayName: toDisplayName(symbol),
    tradingStatus: 'TRADING',
    high24h: 0,
    low24h: 0,
    volume24h: 0,
    marketCap: MARKET_CAP_PLACEHOLDER,
  };
}
