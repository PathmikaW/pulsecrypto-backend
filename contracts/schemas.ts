import { z } from 'zod';

// Source-of-truth wire-format schemas for this repo (ADR-X1). The mobile repo mirrors
// this file into src/contracts/ and CI-diffs it against this file's raw GitHub URL —
// treat any change here as a breaking change for that repo until its mirror is updated.

export const OrderBookLevelSchema = z.object({
  price: z.number(),
  quantity: z.number(),
});

/** The WebSocket broadcast payload — one per pair, per tick (specs/api-contract.md). */
export const MarketUpdateSchema = z.object({
  pair: z.string(),
  timestamp: z.number(),
  lastUpdatedAt: z.number(),
  price: z.number(),
  change24h: z.number(),
  spread: z.number(),
  buyPressure: z.number(),
  sellPressure: z.number(),
  bids: z.array(OrderBookLevelSchema),
  asks: z.array(OrderBookLevelSchema),
});

export const TradingStatusSchema = z.enum(['TRADING', 'HALTED', 'UNAVAILABLE']);

export const PairMetaSchema = z.object({
  symbol: z.string(),
  displayName: z.string(),
  tradingStatus: TradingStatusSchema,
  high24h: z.number(),
  low24h: z.number(),
  volume24h: z.number(),
  // Static placeholder, not live data — Binance's ticker/24hr has no market-cap field
  // (see domain/models/PairMeta.ts's MARKET_CAP_PLACEHOLDER for why).
  marketCap: z.number(),
});

/** GET /pairs/meta response envelope (specs/api-contract.md). */
export const SupportedPairsMetaSchema = z.object({
  pairs: z.array(PairMetaSchema),
  resolvedAt: z.string(),
});

export type OrderBookLevel = z.infer<typeof OrderBookLevelSchema>;
export type MarketUpdate = z.infer<typeof MarketUpdateSchema>;
export type TradingStatus = z.infer<typeof TradingStatusSchema>;
export type PairMeta = z.infer<typeof PairMetaSchema>;
export type SupportedPairsMeta = z.infer<typeof SupportedPairsMetaSchema>;
