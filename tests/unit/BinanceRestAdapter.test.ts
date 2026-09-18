import { describe, it, expect, vi } from 'vitest';
import { BinanceRestAdapter, toDisplayName } from '../../src/infrastructure/binance/BinanceRestAdapter.js';
import type { FetchJsonFn } from '../../src/infrastructure/binance/BinancePairResolver.js';

describe('toDisplayName', () => {
  it('formats a USDT-quoted symbol as BASE/USDT', () => {
    expect(toDisplayName('BTCUSDT')).toBe('BTC/USDT');
    expect(toDisplayName('DOGEUSDT')).toBe('DOGE/USDT');
  });
});

describe('BinanceRestAdapter.getPairsMeta', () => {
  it('maps ticker fields to PairMeta, filtered to the requested pairs only', async () => {
    const mockFetch: FetchJsonFn = vi.fn(async () => [
      { symbol: 'BTCUSDT', highPrice: '65000.00', lowPrice: '64000.00', quoteVolume: '123456.78' },
      { symbol: 'ETHUSDT', highPrice: '3500.00', lowPrice: '3400.00', quoteVolume: '98765.43' },
      { symbol: 'NOTRACKEDUSDT', highPrice: '1', lowPrice: '1', quoteVolume: '1' },
    ]);

    const adapter = new BinanceRestAdapter(mockFetch);
    const result = await adapter.getPairsMeta(['BTCUSDT', 'ETHUSDT']);

    expect(result).toHaveLength(2);
    expect(result.map((p) => p.symbol)).toEqual(['BTCUSDT', 'ETHUSDT']);
    expect(result[0]).toEqual({
      symbol: 'BTCUSDT',
      displayName: 'BTC/USDT',
      tradingStatus: 'TRADING',
      high24h: 65000,
      low24h: 64000,
      volume24h: 123456.78,
    });
  });
});
