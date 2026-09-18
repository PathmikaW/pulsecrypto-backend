import { describe, it, expect } from 'vitest';
import { calculatePressureAndSpread } from '../../src/domain/services/PressureCalculator.js';
import type { OrderBookLevel } from '../../src/domain/models/OrderBook.js';

// Fixture from specs/pressure-spread-formula.md — hand-verifiable by a reviewer.
const bids: OrderBookLevel[] = [
  { price: 109235.42, quantity: 20 },
  { price: 109234.0, quantity: 25.2 },
];
const asks: OrderBookLevel[] = [
  { price: 109238.1, quantity: 18 },
  { price: 109239.0, quantity: 20.7 },
];
// top-10 bid sum = 45.200, top-10 ask sum = 38.700 (depth 10, only 2 levels present each — fine)

describe('calculatePressureAndSpread', () => {
  it('matches the spec worked example exactly', () => {
    const result = calculatePressureAndSpread(bids, asks, 10);
    expect(result.spread).toBeCloseTo(2.68, 5);
    expect(result.buyPressure).toBeCloseTo(53.87, 2);
    expect(result.sellPressure).toBeCloseTo(46.13, 2);
  });

  it('sellPressure is always the exact complement of buyPressure', () => {
    const result = calculatePressureAndSpread(bids, asks, 10);
    expect(result.buyPressure + result.sellPressure).toBe(100);
  });

  it('empty book on both sides returns the neutral defaults, not NaN', () => {
    const result = calculatePressureAndSpread([], [], 10);
    expect(result).toEqual({ spread: 0, buyPressure: 50, sellPressure: 50 });
  });

  it('fewer than depth levels on one side sums whatever is present, no padding', () => {
    const sixAsks: OrderBookLevel[] = Array.from({ length: 6 }, (_, i) => ({
      price: 100 + i,
      quantity: 1,
    }));
    const result = calculatePressureAndSpread([{ price: 99, quantity: 1 }], sixAsks, 10);
    // bidVolume=1, askVolume=6, total=7 -> buyPressure = 1/7*100
    expect(result.buyPressure).toBeCloseTo((1 / 7) * 100, 5);
  });

  it('one side empty, the other populated: spread defaults to 0, pressure is not neutral', () => {
    const result = calculatePressureAndSpread([], asks, 10);
    expect(result.spread).toBe(0);
    expect(result.buyPressure).toBe(0);
    expect(result.sellPressure).toBe(100);
  });

  it('only sums the first `depth` entries even if the caller passes more', () => {
    const manyBids: OrderBookLevel[] = Array.from({ length: 20 }, () => ({ price: 100, quantity: 1 }));
    const manyAsks: OrderBookLevel[] = Array.from({ length: 20 }, () => ({ price: 101, quantity: 1 }));
    const result = calculatePressureAndSpread(manyBids, manyAsks, 5);
    // depth=5 -> bidVolume=5, askVolume=5 -> 50/50 regardless of the extra 15 levels each side
    expect(result.buyPressure).toBe(50);
  });
});
