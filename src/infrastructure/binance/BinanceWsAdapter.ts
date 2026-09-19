import WebSocket from 'ws';
import type { MarketDataSource } from '../../domain/ports/MarketDataSource.js';
import type { BinanceStreamUpdate } from '../../domain/models/BinanceStreamUpdate.js';
import { parseStreamMessage } from './BinanceMessageParser.js';
import { logger } from '../observability/Logger.js';
import { env } from '../../config/env.js';

// Fixed backoff timing; not deployment-configurable (same as ADR-M6).
const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;

/** Builds the combined-stream URL: <symbol>@depth20@100ms/<symbol>@ticker per resolved pair (ADR-B3). */
export function buildStreamUrl(pairs: string[], baseUrl: string = env.BINANCE_WS_BASE_URL): string {
  const streams = pairs.flatMap((p) => [`${p.toLowerCase()}@depth20@100ms`, `${p.toLowerCase()}@ticker`]);
  return `${baseUrl}?streams=${streams.join('/')}`;
}

export class BinanceWsAdapter implements MarketDataSource {
  private ws: WebSocket | null = null;
  private pairs: string[] = [];
  private listeners: Array<(update: BinanceStreamUpdate) => void> = [];
  private reconnectAttempt = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private closedByCaller = false;

  connect(pairs: string[]): void {
    this.pairs = pairs;
    this.closedByCaller = false;
    this.open();
  }

  onMessage(callback: (update: BinanceStreamUpdate) => void): void {
    this.listeners.push(callback);
  }

  disconnect(): void {
    this.closedByCaller = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  private open(): void {
    const url = buildStreamUrl(this.pairs);
    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      this.reconnectAttempt = 0;
      logger.info({ pairCount: this.pairs.length }, 'Connected to Binance combined stream');
    });

    this.ws.on('message', (data: Buffer) => {
      const update = parseStreamMessage(data.toString());
      if (update) this.listeners.forEach((cb) => cb(update));
    });

    this.ws.on('close', () => {
      if (!this.closedByCaller) this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      logger.warn({ err }, 'Binance WebSocket error');
    });
  }

  private scheduleReconnect(): void {
    const backoff = Math.min(INITIAL_BACKOFF_MS * 2 ** this.reconnectAttempt, MAX_BACKOFF_MS);
    this.reconnectAttempt += 1;
    logger.warn(
      { backoffMs: backoff, attempt: this.reconnectAttempt },
      'Binance connection lost — reconnecting'
    );
    this.reconnectTimer = setTimeout(() => this.open(), backoff);
  }
}
