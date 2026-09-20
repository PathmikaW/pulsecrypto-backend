import type { OrderBookLevel } from '../../domain/models/OrderBook.js';
import type { BinanceStreamUpdate } from '../../domain/models/BinanceStreamUpdate.js';

/** Combined-stream envelope: { stream, data }. Payload field codes verified against Binance's WS streams docs. */
interface RawDepthPayload {
  bids: [string, string][];
  asks: [string, string][];
}

interface RawTickerPayload {
  s: string; // symbol
  c: string; // last price
  P: string; // price change percent
}

interface RawEnvelope {
  stream: string;
  data: RawDepthPayload | RawTickerPayload;
}

function toLevels(raw: [string, string][]): OrderBookLevel[] {
  return raw.map(([price, quantity]) => ({ price: Number(price), quantity: Number(quantity) }));
}

/** Returns null for unrecognized messages so a malformed or unknown stream type never kills the connection. */
export function parseStreamMessage(raw: string): BinanceStreamUpdate | null {
  let envelope: RawEnvelope;
  try {
    envelope = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!envelope?.stream || !envelope?.data) return null;

  const symbol = envelope.stream.split('@')[0]?.toUpperCase();
  if (!symbol) return null;

  if (envelope.stream.includes('@depth')) {
    const data = envelope.data as RawDepthPayload;
    if (!Array.isArray(data.bids) || !Array.isArray(data.asks)) return null;
    return { type: 'depth', pair: symbol, bids: toLevels(data.bids), asks: toLevels(data.asks) };
  }

  if (envelope.stream.includes('@ticker')) {
    const data = envelope.data as RawTickerPayload;
    if (data.c === undefined || data.P === undefined) return null;
    return { type: 'ticker', pair: symbol, price: Number(data.c), change24h: Number(data.P) };
  }

  return null;
}
