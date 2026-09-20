const LEVERAGED_SUFFIX_PATTERN = /(UP|DOWN|BULL|BEAR)USDT$/;
const EXCLUDED_QUOTE_ADJACENT_BASES = new Set(['USDC', 'FDUSD', 'DAI', 'TUSD', 'USD1', 'PYUSD', 'USDG']);

/** Exchange-agnostic eligibility policy (ADR-B3): excludes leveraged tokens and stablecoin-to-stablecoin pairs. */
export function isEligibleTradingPair(symbol: string, baseAsset: string): boolean {
  return !LEVERAGED_SUFFIX_PATTERN.test(symbol) && !EXCLUDED_QUOTE_ADJACENT_BASES.has(baseAsset);
}
