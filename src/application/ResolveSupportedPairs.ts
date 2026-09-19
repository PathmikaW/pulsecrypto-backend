import type { PairResolver } from '../domain/ports/PairResolver.js';

/** Runs once per process from the composition root; the required-pairs fallback lives in the PairResolver (ADR-B3). */
export async function resolveSupportedPairs(
  pairResolver: PairResolver,
  requiredSymbols: string[],
  extraCount: number,
  timeoutMs: number
): Promise<string[]> {
  return pairResolver.resolveSupportedPairs(requiredSymbols, extraCount, timeoutMs);
}
