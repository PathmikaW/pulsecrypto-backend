import type { PairResolver } from '../domain/ports/PairResolver.js';

/**
 * Startup use-case: wires the PairResolver port with config, and returns the resolved
 * pair list — required pairs unconditionally included, extra pairs by live liquidity, or
 * required-only on any resolution failure (guarantee lives inside the PairResolver
 * implementation itself — see BinancePairResolver / ADR-B3).
 *
 * Exactly one resolution per process lifetime (specs/pair-resolution-strategy.md) — call
 * this once from the composition root (server.ts, Phase 2), not per request.
 */
export async function resolveSupportedPairs(
  pairResolver: PairResolver,
  requiredSymbols: string[],
  extraCount: number,
  timeoutMs: number
): Promise<string[]> {
  return pairResolver.resolveSupportedPairs(requiredSymbols, extraCount, timeoutMs);
}
