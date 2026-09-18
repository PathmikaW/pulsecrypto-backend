import { describe, it, expect } from 'vitest';
import { isEligibleTradingPair } from '../../src/domain/services/PairEligibility.js';

describe('isEligibleTradingPair', () => {
  it('excludes leveraged/synthetic token symbols', () => {
    expect(isEligibleTradingPair('BTCUPUSDT', 'BTCUP')).toBe(false);
    expect(isEligibleTradingPair('ETHDOWNUSDT', 'ETHDOWN')).toBe(false);
    expect(isEligibleTradingPair('BTCBULLUSDT', 'BTCBULL')).toBe(false);
    expect(isEligibleTradingPair('BTCBEARUSDT', 'BTCBEAR')).toBe(false);
  });

  it('excludes stablecoin-adjacent base assets', () => {
    expect(isEligibleTradingPair('USDCUSDT', 'USDC')).toBe(false);
    expect(isEligibleTradingPair('FDUSDUSDT', 'FDUSD')).toBe(false);
  });

  it('allows an ordinary spot pair through', () => {
    expect(isEligibleTradingPair('BTCUSDT', 'BTC')).toBe(true);
    expect(isEligibleTradingPair('ADAUSDT', 'ADA')).toBe(true);
  });
});
