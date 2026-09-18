import type { MetadataProvider } from '../../domain/ports/MetadataProvider.js';
import type { PairMeta } from '../../domain/models/PairMeta.js';
import { env } from '../../config/env.js';
import { fetchJson, type FetchJsonFn } from './BinancePairResolver.js';

interface Ticker24hr {
  symbol: string;
  highPrice: string;
  lowPrice: string;
  quoteVolume: string;
}

/**
 * Implements MetadataProvider. Pure fetch + map — no caching, no mock fallback; those are
 * the application layer's job (GetPairsMeta, per ADR-B7), not this adapter's.
 */
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
        // Every resolved pair already passed the TRADING filter at startup
        // (BinancePairResolver) — by construction, anything reaching here is tradable.
        tradingStatus: 'TRADING' as const,
        high24h: Number(t.highPrice),
        low24h: Number(t.lowPrice),
        // quoteVolume (USDT-denominated), not base-asset volume — comparable across pairs,
        // and consistent with the ranking metric ADR-B3's pair resolution already uses.
        volume24h: Number(t.quoteVolume),
      }));
  }
}

/** "BTCUSDT" -> "BTC/USDT". Every resolved pair is USDT-quoted by construction (ADR-B3). */
export function toDisplayName(symbol: string): string {
  const base = symbol.endsWith('USDT') ? symbol.slice(0, -4) : symbol;
  return `${base}/USDT`;
}
