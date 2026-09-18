# Data Models

Source: ADR-B5, ADR-B7, ADR-X1. These are the TypeScript shapes that back
`contracts/schemas.ts` (Zod schemas + inferred types). Domain models in `domain/models/`
should match these field-for-field; the Zod schemas in `contracts/` are the runtime-validated
version of the same shapes.

## `OrderBookLevel`

```typescript
interface OrderBookLevel {
  price: number;    // quote currency (USDT)
  quantity: number; // base asset quantity at this level
}
```

## `OrderBook`

```typescript
interface OrderBook {
  bids: OrderBookLevel[]; // sorted descending by price, top 20 (Binance @depth20)
  asks: OrderBookLevel[]; // sorted ascending by price, top 20
}
```

## `PairState` (internal, backend-only — the conflation map's value type)

```typescript
interface PairState {
  pair: string;           // e.g. "BTCUSDT"
  price: number;          // last trade / mark price
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  change24h: number;      // percentage, from @ticker stream
  updatedAt: number;      // ms epoch — last time this pair's state was mutated by an
                           // incoming Binance message (NOT the same as lastUpdatedAt below,
                           // which is set at broadcast time — see buffering-strategy.md)
}
```

## `MarketUpdate` (the WebSocket broadcast payload — one per pair, per tick)

This is the wire format. Field names and shape match the assignment's example payload
exactly, plus `lastUpdatedAt` which the assignment leaves to our discretion and this
project requires (ADR §12.2).

```typescript
interface MarketUpdate {
  pair: string;           // "BTCUSDT"
  timestamp: number;      // unix seconds — broadcast tick time (see buffering-strategy.md)
  lastUpdatedAt: number;  // ms epoch — same tick's wall-clock time, set ONCE by the
                           // conflation engine, never recomputed client-side (ADR-B4, §12.2)
  price: number;
  spread: number;         // ADR-B5 formula
  buyPressure: number;    // 0-100, ADR-B5 formula
  sellPressure: number;   // 0-100, = 100 - buyPressure, always
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}
```

## `PairMeta` (one entry in `GET /pairs/meta`'s response array)

```typescript
interface PairMeta {
  symbol: string;         // "BTCUSDT"
  displayName: string;    // "BTC/USDT"
  tradingStatus: 'TRADING' | 'HALTED' | 'UNAVAILABLE';
  high24h: number;
  low24h: number;
  volume24h: number;
}
```

## `SupportedPairsMeta` (the full `/pairs/meta` response envelope)

```typescript
interface SupportedPairsMeta {
  pairs: PairMeta[];
  resolvedAt: string;     // ISO 8601 — when the backend's pair list was last resolved
                           // (startup time, or the last successful background retry — ADR-B3)
}
```

## Mobile-side model (`core/domain/models/MarketData.ts`)

The mobile domain model is a direct mapping of `MarketUpdate` — no restructuring at the
mapper layer beyond type narrowing. `lastUpdatedAt` is passed through unmodified.

```typescript
interface MarketData {
  pair: string;
  price: number;
  spread: number;
  buyPressure: number;
  sellPressure: number;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  lastUpdatedAt: number; // copied directly from MarketUpdate.lastUpdatedAt, no recomputation
}
```
