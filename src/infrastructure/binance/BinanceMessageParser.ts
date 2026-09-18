import type { OrderBookLevel } from '../../domain/models/OrderBook.js';
import type { BinanceStreamUpdate } from '../../domain/models/BinanceStreamUpdate.js';

/**
 * Raw combined-stream envelope: { "stream": "<symbol>@depth20@100ms" | "<symbol>@ticker",
 * "data": <rawPayload> }. Field codes for depth/ticker payloads verified directly against
 * developers.binance.com/docs/binance-spot-api-docs/web-socket-streams. The envelope
 * wrapper itself is stable, long-standing Binance behavior not shown on that specific doc
 * page — confirm against a live connection during integration testing (BinanceWsAdapter).
 */
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

/**
 * Parses one raw combined-stream WebSocket message into a normalized BinanceStreamUpdate.
 * Returns null for anything unrecognized rather than throwing — a single malformed or
 * future/unknown stream type must never take down the ingestion connection.
 */
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
