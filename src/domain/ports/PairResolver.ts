/** Outbound port: resolves the supported pair list at startup. Implemented by BinancePairResolver (ADR-B3). */
export interface PairResolver {
  resolveSupportedPairs(
    requiredSymbols: string[],
    extraCount: number,
    timeoutMs: number
  ): Promise<string[]>;
}
