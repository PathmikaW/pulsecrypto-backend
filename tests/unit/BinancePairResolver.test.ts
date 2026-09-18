import { describe, it, expect, vi } from 'vitest';
import { BinancePairResolver, type FetchJsonFn } from '../../src/infrastructure/binance/BinancePairResolver.js';

const REQUIRED = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'DOGEUSDT', 'XRPUSDT'];

function exchangeInfoSymbol(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    symbol: 'ADAUSDT',
    status: 'TRADING',
    quoteAsset: 'USDT',
    baseAsset: 'ADA',
    isSpotTradingAllowed: true,
    ...overrides,
  };
}

describe('BinancePairResolver.resolveSupportedPairs', () => {
  it('always includes the required pairs, even when exchangeInfo omits one of them', async () => {
    const mockFetch: FetchJsonFn = vi.fn(async (url: string) => {
      if (url.includes('exchangeInfo')) {
        // deliberately omit BTCUSDT from the tradable set
        return { symbols: [exchangeInfoSymbol({ symbol: 'ADAUSDT' })] };
      }
      return [{ symbol: 'ADAUSDT', quoteVolume: '1000000' }];
    });

    const resolver = new BinancePairResolver(mockFetch);
    const result = await resolver.resolveSupportedPairs(REQUIRED, 3, 5000);

    for (const symbol of REQUIRED) {
      expect(result).toContain(symbol);
    }
  });

  it('excludes leveraged-token symbols by suffix pattern', async () => {
    const mockFetch: FetchJsonFn = vi.fn(async (url: string) => {
      if (url.includes('exchangeInfo')) {
        return {
          symbols: [
            exchangeInfoSymbol({ symbol: 'BTCUPUSDT', baseAsset: 'BTCUP' }),
            exchangeInfoSymbol({ symbol: 'ADAUSDT' }),
          ],
        };
      }
      return [
        { symbol: 'BTCUPUSDT', quoteVolume: '99999999' },
        { symbol: 'ADAUSDT', quoteVolume: '1000000' },
      ];
    });

    const resolver = new BinancePairResolver(mockFetch);
    const result = await resolver.resolveSupportedPairs(REQUIRED, 3, 5000);

    expect(result).not.toContain('BTCUPUSDT');
    expect(result).toContain('ADAUSDT');
  });

  it('excludes stablecoin-adjacent base assets even when otherwise tradable', async () => {
    const mockFetch: FetchJsonFn = vi.fn(async (url: string) => {
      if (url.includes('exchangeInfo')) {
        return {
          symbols: [
            // synthetic fixture symbol: USDT-quoted with a stablecoin-adjacent base, which
            // would otherwise pass every other filter
            exchangeInfoSymbol({ symbol: 'USDCUSDT', baseAsset: 'USDC' }),
            exchangeInfoSymbol({ symbol: 'ADAUSDT' }),
          ],
        };
      }
      return [
        { symbol: 'USDCUSDT', quoteVolume: '99999999' },
        { symbol: 'ADAUSDT', quoteVolume: '1000000' },
      ];
    });

    const resolver = new BinancePairResolver(mockFetch);
    const result = await resolver.resolveSupportedPairs(REQUIRED, 3, 5000);

    expect(result).not.toContain('USDCUSDT');
  });

  it('falls back to required pairs only when fetchJson rejects', async () => {
    const mockFetch: FetchJsonFn = vi.fn(async () => {
      throw new Error('network error');
    });

    const resolver = new BinancePairResolver(mockFetch);
    const result = await resolver.resolveSupportedPairs(REQUIRED, 3, 5000);

    expect(result).toEqual(REQUIRED);
  });

  it('falls back to required pairs only when the request times out', async () => {
    const mockFetch: FetchJsonFn = vi.fn(
      (_url: string, signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')));
        })
    );

    const resolver = new BinancePairResolver(mockFetch);
    const result = await resolver.resolveSupportedPairs(REQUIRED, 3, 50);

    expect(result).toEqual(REQUIRED);
  });

  it('ranks extra pairs by quoteVolume descending, excluding anything already required', async () => {
    const mockFetch: FetchJsonFn = vi.fn(async (url: string) => {
      if (url.includes('exchangeInfo')) {
        return {
          symbols: [
            exchangeInfoSymbol({ symbol: 'BTCUSDT', baseAsset: 'BTC' }), // already required
            exchangeInfoSymbol({ symbol: 'LOWVOLUSDT', baseAsset: 'LOWVOL' }),
            exchangeInfoSymbol({ symbol: 'MIDVOLUSDT', baseAsset: 'MIDVOL' }),
            exchangeInfoSymbol({ symbol: 'HIGHVOLUSDT', baseAsset: 'HIGHVOL' }),
          ],
        };
      }
      return [
        { symbol: 'BTCUSDT', quoteVolume: '999999999' },
        { symbol: 'LOWVOLUSDT', quoteVolume: '100' },
        { symbol: 'MIDVOLUSDT', quoteVolume: '5000' },
        { symbol: 'HIGHVOLUSDT', quoteVolume: '9000' },
      ];
    });

    const resolver = new BinancePairResolver(mockFetch);
    const result = await resolver.resolveSupportedPairs(REQUIRED, 2, 5000);
    const extras = result.filter((s) => !REQUIRED.includes(s));

    expect(extras).toEqual(['HIGHVOLUSDT', 'MIDVOLUSDT']);
  });
});
