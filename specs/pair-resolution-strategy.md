# Trading-Pair Resolution — Implementation Spec

Source: ADR-B3. Runs once at startup, before the Binance WebSocket adapter connects.

## Algorithm

```typescript
const LEVERAGED_SUFFIX_PATTERN = /(UP|DOWN|BULL|BEAR)USDT$/;
const EXCLUDED_QUOTE_ADJACENT_BASES = new Set(
  ['USDC', 'FDUSD', 'DAI', 'TUSD', 'USD1', 'PYUSD', 'USDG']
);

async function resolveSupportedPairs(
  requiredSymbols: string[],   // from REQUIRED_PAIRS env var
  extraCount: number,          // EXTRA_PAIRS_COUNT, default 3
  timeoutMs: number            // PAIR_RESOLUTION_TIMEOUT_MS, default 5000
): Promise<string[]> {
  try {
    const [info, tickers] = await withTimeout(
      Promise.all([
        fetchJson('https://api.binance.com/api/v3/exchangeInfo'),
        fetchJson('https://api.binance.com/api/v3/ticker/24hr'),
      ]),
      timeoutMs
    );

    const tradable = new Set(
      info.symbols
        .filter(s =>
          s.status === 'TRADING' &&
          s.quoteAsset === 'USDT' &&
          s.isSpotTradingAllowed &&
          !LEVERAGED_SUFFIX_PATTERN.test(s.symbol) &&
          !EXCLUDED_QUOTE_ADJACENT_BASES.has(s.baseAsset)
        )
        .map(s => s.symbol)
    );

    const rankedByVolume = tickers
      .filter(t => tradable.has(t.symbol))
      .sort((a, b) => Number(b.quoteVolume) - Number(a.quoteVolume))
      .map(t => t.symbol);

    const extra = rankedByVolume
      .filter(s => !requiredSymbols.includes(s))
      .slice(0, extraCount);

    return [...requiredSymbols, ...extra];
  } catch (err) {
    logger.warn({ err }, 'Pair resolution failed — proceeding with required pairs only');
    return requiredSymbols;
  }
}
```

## Invariants to test explicitly

1. **Required pairs are always present in the output**, in every code path — success,
   partial failure, and total failure. Write a test that asserts this even when the mocked
   Binance response deliberately omits one of the required symbols from `exchangeInfo`
   (i.e. the required list is unconditionally appended, not filtered through the tradable
   check).
2. **Exclusion filters work correctly**: a symbol like `BTCUPUSDT` must never appear in the
   resolved list; a symbol with base asset `USDC` (e.g. `ETHUSDC` — note: not USDT-quoted
   so wouldn't pass the quote filter anyway, use a synthetic fixture symbol that would
   otherwise pass) must be excluded by the base-asset check specifically.
3. **Fallback on timeout**: mock `fetchJson` to hang past `timeoutMs`; assert the function
   resolves to `requiredSymbols` only, and that a `warn`-level log was emitted.
4. **Fallback on error**: mock `fetchJson` to reject (network error, non-200); same
   assertion as above.
5. **Ranking correctness**: given tickers with known `quoteVolume` values, assert the
   returned extra pairs are the correct top-N by volume, excluding anything already in
   `requiredSymbols`.

## Startup sequence (see also ADR-B7's composition-root ordering)

1. `server.ts` loads/validates env config (Zod).
2. Calls `ResolveSupportedPairs` (this module, via the `PairResolver` port).
3. Only after resolution completes does `BinanceWsAdapter` build its combined stream URL
   from the resolved list and connect.
4. `GetPairsMeta` and `ProcessMarketTick` are both wired with the same resolved list —
   there should be exactly one resolution per process lifetime, not one per request.
5. Set the `pulsecrypto_supported_pairs_count` gauge (ADR-B8) once resolution completes, to
   the length of the resolved list — this is how a fallback is observable in production
   without grepping logs.

## Background retry (fallback recovery)

If the initial resolution fell back to required-only, a background retry (interval TBD by
implementer — a reasonable default is every 5 minutes) re-attempts full resolution without
requiring a process restart. On success, update the in-memory resolved list and the
`ws` adapter's subscription (reconnecting the combined stream with the expanded pair set),
and update the `supported_pairs_count` gauge. This is a "nice to have" relative to the
assignment's mandatory scope — if time is constrained, document it as a known limitation
(fallback is permanent until restart) rather than skipping the required-pairs guarantee
itself.
