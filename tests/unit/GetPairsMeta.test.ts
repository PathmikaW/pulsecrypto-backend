import { describe, it, expect, vi } from 'vitest';
import { GetPairsMeta } from '../../src/application/GetPairsMeta.js';
import type { MetadataProvider } from '../../src/domain/ports/MetadataProvider.js';
import type { PairMeta } from '../../src/domain/models/PairMeta.js';

const silentLogger = { warn: vi.fn() };
const REQUIRED = ['BTCUSDT', 'ETHUSDT'];
const RESOLVED = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
const RESOLVED_AT = '2026-09-17T10:00:00.000Z';

const realPairs: PairMeta[] = RESOLVED.map((symbol) => ({
  symbol,
  displayName: `${symbol.slice(0, -4)}/USDT`,
  tradingStatus: 'TRADING',
  high24h: 1,
  low24h: 1,
  volume24h: 1,
  marketCap: 1,
}));

describe('GetPairsMeta.execute', () => {
  it('returns real data with the fixed resolvedAt from pair resolution, not the fetch time', async () => {
    const provider: MetadataProvider = { getPairsMeta: vi.fn().mockResolvedValue(realPairs) };
    const useCase = new GetPairsMeta(provider, RESOLVED, REQUIRED, RESOLVED_AT, silentLogger);

    const result = await useCase.execute(Date.now());

    expect(result.pairs).toEqual(realPairs);
    expect(result.resolvedAt).toBe(RESOLVED_AT, silentLogger);
  });

  it('caches for the configured TTL — a second call within the window does not refetch', async () => {
    const getPairsMeta = vi.fn().mockResolvedValue(realPairs);
    const provider: MetadataProvider = { getPairsMeta };
    const useCase = new GetPairsMeta(provider, RESOLVED, REQUIRED, RESOLVED_AT, silentLogger, 60_000);

    await useCase.execute(1000);
    await useCase.execute(1000 + 59_000); // still within the 60s window

    expect(getPairsMeta).toHaveBeenCalledTimes(1);
  });

  it('refetches once the cache TTL has expired', async () => {
    const getPairsMeta = vi.fn().mockResolvedValue(realPairs);
    const provider: MetadataProvider = { getPairsMeta };
    const useCase = new GetPairsMeta(provider, RESOLVED, REQUIRED, RESOLVED_AT, silentLogger, 60_000);

    await useCase.execute(1000);
    await useCase.execute(1000 + 60_001); // past the window

    expect(getPairsMeta).toHaveBeenCalledTimes(2);
  });

  it('falls back to mock data scoped to the required pairs only, on fetch failure', async () => {
    const provider: MetadataProvider = { getPairsMeta: vi.fn().mockRejectedValue(new Error('Binance down')) };
    const useCase = new GetPairsMeta(provider, RESOLVED, REQUIRED, RESOLVED_AT, silentLogger);

    const result = await useCase.execute();

    expect(result.pairs.map((p) => p.symbol)).toEqual(REQUIRED);
    // the dynamically-resolved extra pair (SOLUSDT) must NOT appear in the fallback
    expect(result.pairs.map((p) => p.symbol)).not.toContain('SOLUSDT');
  });
});
