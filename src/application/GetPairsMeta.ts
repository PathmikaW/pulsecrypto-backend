import type { MetadataProvider } from '../domain/ports/MetadataProvider.js';
import { MARKET_CAP_PLACEHOLDER, type PairMeta, type SupportedPairsMeta } from '../domain/models/PairMeta.js';
import { toDisplayName } from '../infrastructure/binance/BinanceRestAdapter.js';
import { logger } from '../infrastructure/observability/Logger.js';

/**
 * Wires MetadataProvider + caching, scoped to the resolved pairs (ADR-B7, ADR-B6).
 * Real data cached in-process for 60s; on failure, falls back to mock data for the
 * required pairs only — the additional, dynamically-resolved pairs are simply absent
 * during a fallback rather than mocked (ADR-B6's scoped fallback guarantee).
 */
export class GetPairsMeta {
  private cache: { data: SupportedPairsMeta; expiresAt: number } | null = null;

  constructor(
    private readonly metadataProvider: MetadataProvider,
    private readonly resolvedPairs: string[],
    private readonly requiredPairs: string[],
    /** ISO 8601 timestamp of when the pair list was resolved at startup (ADR-B3) — fixed
     * for the process lifetime, not recomputed per request. */
    private readonly resolvedAt: string,
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
      logger.warn({ err }, 'Metadata fetch failed — falling back to mock data for required pairs only');
      pairs = this.requiredPairs.map(mockPairMeta);
    }

    const result: SupportedPairsMeta = { pairs, resolvedAt: this.resolvedAt };
    this.cache = { data: result, expiresAt: now + this.cacheTtlMs };
    return result;
  }
}

function mockPairMeta(symbol: string): PairMeta {
  // Placeholder values only — the assignment explicitly allows this data to be mocked,
  // and this path is exercised solely when Binance is unreachable (an exceptional case).
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
