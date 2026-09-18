# Buy/Sell Pressure & Spread — Formula Spec

Source: ADR-B5, ADR §12.1. Implement in `domain/services/PressureCalculator.ts` as pure
functions — no I/O, no framework dependency, fully unit-testable against a fixture order
book with an exact expected result.

## Formulas (exact — do not approximate or "improve")

```
Spread            = lowest_ask_price − highest_bid_price

Total Bid Volume  = Σ(quantity) across the top N bid levels
Total Ask Volume  = Σ(quantity) across the top N ask levels
                     (N = ORDER_BOOK_PRESSURE_DEPTH, default 10 — a named env-configurable
                      constant, deliberately decoupled from the Binance subscription depth
                      of 20 levels; never hardcode N as a literal in the function body)

Buy Pressure %    = (Total Bid Volume / (Total Bid Volume + Total Ask Volume)) × 100
Sell Pressure %   = 100 − Buy Pressure %
```

**Sell Pressure is always the complement of Buy Pressure by construction** — computed as
`100 - buyPressure`, never independently summed and rounded. This guarantees the two values
always sum to exactly 100% with no rounding drift between them.

## Function signature

```typescript
interface PressureResult {
  spread: number;
  buyPressure: number;
  sellPressure: number;
}

function calculatePressureAndSpread(
  bids: OrderBookLevel[], // sorted descending by price
  asks: OrderBookLevel[], // sorted ascending by price
  depth: number = ORDER_BOOK_PRESSURE_DEPTH
): PressureResult;
```

Bids/asks arrays passed in should already be depth-truncated by the caller if needed, but
the function itself must also only sum the first `depth` entries of whatever it receives —
don't assume the caller always truncates correctly.

## Worked example (for the unit test fixture)

Given an order book snapshot where:
- Highest bid price: `109235.42`
- Lowest ask price: `109238.10`
- Top 10 bid levels sum to `45.200` (quantity)
- Top 10 ask levels sum to `38.700` (quantity)

Expected output:
```
Spread          = 109238.10 - 109235.42 = 2.68
Total            = 45.200 + 38.700 = 83.900
Buy Pressure %   = (45.200 / 83.900) × 100 = 53.8736... → assert to 2 decimal places: 53.87
Sell Pressure %  = 100 - 53.87 = 46.13
```

Write this exact fixture (or an equivalent one with hand-verified arithmetic) as the first
unit test for `PressureCalculator` — a reviewer should be able to check the expected values
by hand against the formula above.

## Edge cases — recommended fix

Both edge cases below should be effectively unreachable in normal operation, because
Binance's `@depth20` stream supplies both sides of the book continuously for any pair
that's actively `TRADING` (ADR-B3 already excludes non-trading symbols at resolution time).
They're handled anyway, defensively, because "unreachable in normal operation" is not the
same as "impossible" — a transient empty snapshot immediately after a (re)connect, before
the first depth update has arrived, is the realistic trigger.

```typescript
function calculatePressureAndSpread(
  bids: OrderBookLevel[],
  asks: OrderBookLevel[],
  depth: number = ORDER_BOOK_PRESSURE_DEPTH
): PressureResult {
  const topBids = bids.slice(0, depth);
  const topAsks = asks.slice(0, depth);

  const highestBid = bids[0]?.price;
  const lowestAsk = asks[0]?.price;
  // Fix: if either side is empty, spread cannot be computed — default to 0 rather than
  // NaN/undefined, and let the caller's emptiness (bids.length === 0 || asks.length === 0)
  // be the actual signal consumers check, not the numeric value of spread itself.
  const spread = highestBid !== undefined && lowestAsk !== undefined
    ? lowestAsk - highestBid
    : 0;

  const bidVolume = topBids.reduce((sum, l) => sum + l.quantity, 0);
  const askVolume = topAsks.reduce((sum, l) => sum + l.quantity, 0);
  const totalVolume = bidVolume + askVolume;

  // Fix: total volume of 0 would otherwise divide-by-zero to NaN. Default to a neutral
  // 50/50 split — "no signal either way" is the honest read of an empty book, not 0% or
  // 100% in either direction, both of which would misleadingly imply one-sided pressure.
  const buyPressure = totalVolume === 0 ? 50 : (bidVolume / totalVolume) * 100;
  const sellPressure = 100 - buyPressure;

  return { spread, buyPressure, sellPressure };
}
```

**Consumer-side rule (applies to the mobile `OrderBookView`/`MarketDetailScreen` spec
too — see `mobile-screens.md`):** treat `bids.length === 0 && asks.length === 0` as "order
book not yet available" and render a loading/placeholder state, rather than trusting
`spread === 0` or `buyPressure === 50` as if they were real market values. The defaults
above exist so the calculation never throws or returns `NaN` — they are not meant to be
displayed to a user as a genuine 0 spread or an even 50/50 market.

**Test cases to add**, beyond the worked example above:
- Empty bids and empty asks together → `{ spread: 0, buyPressure: 50, sellPressure: 50 }`.
- Fewer than `depth` levels on one side (e.g. only 6 ask levels exist while `depth = 10`) —
  sum whatever is actually present; don't pad missing levels with zero-quantity entries or
  throw.
- One side empty, the other populated (e.g. `bids = []`, `asks` has levels) → `spread: 0`
  (can't compute), but `buyPressure`/`sellPressure` still computed correctly from the
  populated side's volume against a `0` bid volume (i.e. `buyPressure: 0, sellPressure: 100`
  in that case) — the two calculations are independent and shouldn't both collapse to the
  same neutral default just because one input was degenerate.
