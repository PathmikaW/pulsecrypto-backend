export type TradingStatus = 'TRADING' | 'HALTED' | 'UNAVAILABLE';

export interface PairMeta {
  symbol: string;
  displayName: string;
  tradingStatus: TradingStatus;
  high24h: number;
  low24h: number;
  volume24h: number;
}

export interface SupportedPairsMeta {
  pairs: PairMeta[];
  /** ISO 8601 — when the backend's pair list was last resolved */
  resolvedAt: string;
}
