const LEVERAGED_SUFFIX_PATTERN = /(UP|DOWN|BULL|BEAR)USDT$/;
const EXCLUDED_QUOTE_ADJACENT_BASES = new Set(['USDC', 'FDUSD', 'DAI', 'TUSD', 'USD1', 'PYUSD', 'USDG']);

/**
 * Domain policy (ADR-B3): which tradable USDT pairs actually belong in a real-time price
 * viewer. Deliberately exchange-agnostic — lives in domain/, not inside the Binance
 * adapter, so a second exchange adapter (ADR-B7's stated extensibility case) reuses this
 * judgment instead of re-implementing or duplicating it.
 *
 * Excludes leveraged/synthetic tokens (index products that behave differently from spot
 * assets) and stablecoin-to-stablecoin pairs (barely move in price, defeating the purpose
 * of a live market display). Both are technically tradable but a poor fit here.
 */
export function isEligibleTradingPair(symbol: string, baseAsset: string): boolean {
  return !LEVERAGED_SUFFIX_PATTERN.test(symbol) && !EXCLUDED_QUOTE_ADJACENT_BASES.has(baseAsset);
}
