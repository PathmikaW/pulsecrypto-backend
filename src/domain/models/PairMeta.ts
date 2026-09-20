export type TradingStatus = 'TRADING' | 'HALTED' | 'UNAVAILABLE';

// Static placeholder: Binance ticker/24hr has no market-cap field (ADR-B6, ADR-M10).
export const MARKET_CAP_PLACEHOLDER = 1_200_000_000_000;

export interface PairMeta {
  symbol: string;
  displayName: string;
  tradingStatus: TradingStatus;
  high24h: number;
  low24h: number;
  volume24h: number;
  marketCap: number;
}

export interface SupportedPairsMeta {
  pairs: PairMeta[];
  /** ISO 8601 — when the backend's pair list was last resolved */
  resolvedAt: string;
}

export function toDisplayName(symbol: string): string {
  const base = symbol.endsWith('USDT') ? symbol.slice(0, -4) : symbol;
  return `${base}/USDT`;
}
