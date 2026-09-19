import type { MetadataProvider } from '../../domain/ports/MetadataProvider.js';
import { MARKET_CAP_PLACEHOLDER, toDisplayName, type PairMeta } from '../../domain/models/PairMeta.js';
import { env } from '../../config/env.js';
import { fetchJson, type FetchJsonFn } from './BinancePairResolver.js';

interface Ticker24hr {
  symbol: string;
  highPrice: string;
  lowPrice: string;
  quoteVolume: string;
}

/** Fetch + map only; caching and mock fallback belong to GetPairsMeta (ADR-B7). */
export class BinanceRestAdapter implements MetadataProvider {
  constructor(
    private readonly fetchJsonImpl: FetchJsonFn = fetchJson,
    private readonly restBaseUrl: string = env.BINANCE_REST_BASE_URL
  ) {}

  async getPairsMeta(pairs: string[]): Promise<PairMeta[]> {
    const controller = new AbortController();
    const tickers = await this.fetchJsonImpl<Ticker24hr[]>(
      `${this.restBaseUrl}/api/v3/ticker/24hr`,
      controller.signal
    );

    const pairSet = new Set(pairs);
    return tickers
      .filter((t) => pairSet.has(t.symbol))
      .map((t) => ({
        symbol: t.symbol,
        displayName: toDisplayName(t.symbol),
        // Resolved pairs already passed the TRADING filter at startup.
        tradingStatus: 'TRADING' as const,
        high24h: Number(t.highPrice),
        low24h: Number(t.lowPrice),
        // quoteVolume (USDT) is comparable across pairs and matches ADR-B3's ranking metric.
        volume24h: Number(t.quoteVolume),
        marketCap: MARKET_CAP_PLACEHOLDER,
      }));
  }
}
