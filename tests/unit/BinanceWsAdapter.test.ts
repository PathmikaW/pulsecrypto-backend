import { describe, it, expect } from 'vitest';
import { buildStreamUrl } from '../../src/infrastructure/binance/BinanceWsAdapter.js';

describe('buildStreamUrl', () => {
  it('builds one depth + one ticker stream per pair, joined with "/"', () => {
    const url = buildStreamUrl(['BTCUSDT', 'ETHUSDT'], 'wss://stream.binance.com:9443/stream');

    expect(url).toBe(
      'wss://stream.binance.com:9443/stream?streams=btcusdt@depth20@100ms/btcusdt@ticker/ethusdt@depth20@100ms/ethusdt@ticker'
    );
  });

  it('lowercases symbols regardless of input casing', () => {
    const url = buildStreamUrl(['BTCUSDT'], 'wss://example.com/stream');
    expect(url).toContain('btcusdt@depth20@100ms');
  });

  it('defaults to the configured BINANCE_WS_BASE_URL when no base is passed', () => {
    const url = buildStreamUrl(['BTCUSDT']);
    expect(url.startsWith('wss://stream.binance.com:9443/stream?streams=')).toBe(true);
  });
});
