export interface PairResolver {
  resolveSupportedPairs(requiredSymbols: string[], extraCount: number, timeoutMs: number): Promise<string[]>;
}
