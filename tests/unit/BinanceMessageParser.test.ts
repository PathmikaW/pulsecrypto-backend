import { describe, it, expect } from 'vitest';
import { parseStreamMessage } from '../../src/infrastructure/binance/BinanceMessageParser.js';

describe('parseStreamMessage', () => {
  it('parses a depth message into a normalized BinanceDepthUpdate', () => {
    const raw = JSON.stringify({
      stream: 'btcusdt@depth20@100ms',
      data: { bids: [['64239.50', '0.45220']], asks: [['64241.50', '0.11200']] },
    });

    const result = parseStreamMessage(raw);

    expect(result).toEqual({
      type: 'depth',
      pair: 'BTCUSDT',
      bids: [{ price: 64239.5, quantity: 0.4522 }],
      asks: [{ price: 64241.5, quantity: 0.112 }],
    });
  });

  it('parses a ticker message into a normalized BinanceTickerUpdate', () => {
    const raw = JSON.stringify({
      stream: 'btcusdt@ticker',
      data: { s: 'BTCUSDT', c: '64238.17', P: '2.45' },
    });

    const result = parseStreamMessage(raw);

    expect(result).toEqual({ type: 'ticker', pair: 'BTCUSDT', price: 64238.17, change24h: 2.45 });
  });

  it('returns null for invalid JSON rather than throwing', () => {
    expect(parseStreamMessage('not json')).toBeNull();
  });

  it('returns null for an unrecognized stream type', () => {
    const raw = JSON.stringify({ stream: 'btcusdt@aggTrade', data: {} });
    expect(parseStreamMessage(raw)).toBeNull();
  });

  it('returns null for a well-formed envelope missing expected fields', () => {
    const raw = JSON.stringify({ stream: 'btcusdt@depth20@100ms', data: { bids: [] } }); // no asks
    expect(parseStreamMessage(raw)).toBeNull();
  });
});
