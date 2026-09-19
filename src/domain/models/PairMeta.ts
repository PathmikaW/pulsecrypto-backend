export type TradingStatus = 'TRADING' | 'HALTED' | 'UNAVAILABLE';

// Binance's spot ticker/24hr (this app's only metadata source, ADR-B6) has no market-cap or
// circulating-supply field — a real per-pair value would need a second external data source
// (e.g. CoinGecko), which is a bigger scope increase than this field. Explicitly a static
// placeholder, not live data, applied uniformly across every pair — same category as the
// mobile app's other display-only static values (ADR-M10).
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
