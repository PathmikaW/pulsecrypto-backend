import type { PairResolver } from '../../domain/ports/PairResolver.js';
import { isEligibleTradingPair } from '../../domain/services/PairEligibility.js';
import { logger } from '../observability/Logger.js';
import { env } from '../../config/env.js';

interface ExchangeInfoSymbol {
  symbol: string;
  status: string;
  quoteAsset: string;
  baseAsset: string;
  isSpotTradingAllowed: boolean;
}

interface ExchangeInfoResponse {
  symbols: ExchangeInfoSymbol[];
}

interface Ticker24hr {
  symbol: string;
  quoteVolume: string;
}

/**
 * Fetches a URL as JSON, aborting via `signal` once the caller's timeout fires — this is
 * the withTimeout behavior from specs/pair-resolution-strategy.md, implemented with
 * AbortController so the underlying HTTP request is actually cancelled, not just abandoned.
 * Exported (rather than inlined) so tests can inject a mock in place of the real network call.
 */
export async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Binance API request failed: ${res.status} ${res.statusText} for ${url}`);
  }
  return (await res.json()) as T;
}

export type FetchJsonFn = typeof fetchJson;

/** Implements PairResolver — full logic and rationale in ADR-B3 / specs/pair-resolution-strategy.md. */
export class BinancePairResolver implements PairResolver {
  constructor(
    private readonly fetchJsonImpl: FetchJsonFn = fetchJson,
    private readonly restBaseUrl: string = env.BINANCE_REST_BASE_URL
  ) {}

  async resolveSupportedPairs(requiredSymbols: string[], extraCount: number, timeoutMs: number): Promise<string[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const [info, tickers] = await Promise.all([
        this.fetchJsonImpl<ExchangeInfoResponse>(`${this.restBaseUrl}/api/v3/exchangeInfo`, controller.signal),
        this.fetchJsonImpl<Ticker24hr[]>(`${this.restBaseUrl}/api/v3/ticker/24hr`, controller.signal),
      ]);

      const tradable = new Set(
        info.symbols
          .filter(
            (s) =>
              s.status === 'TRADING' &&
              s.quoteAsset === 'USDT' &&
              s.isSpotTradingAllowed &&
              isEligibleTradingPair(s.symbol, s.baseAsset)
          )
          .map((s) => s.symbol)
      );

      const rankedByVolume = tickers
        .filter((t) => tradable.has(t.symbol))
        .sort((a, b) => Number(b.quoteVolume) - Number(a.quoteVolume))
        .map((t) => t.symbol);

      const extra = rankedByVolume.filter((s) => !requiredSymbols.includes(s)).slice(0, extraCount);

      return [...requiredSymbols, ...extra];
    } catch (err) {
      logger.warn({ err }, 'Pair resolution failed — proceeding with required pairs only');
      return requiredSymbols;
    } finally {
      clearTimeout(timer);
    }
  }
}
