import { describe, it, expect } from 'vitest';
import { optimizeCutList } from '../cutListOptimizer';

// All lengths in 32nd-inch ticks.
// 20ft = 20 * 12 * 32 / 12 = 20 * 32 * 12 / 12  → simpler: 20ft * 12in/ft * 32ticks/in = 7680
// 10ft = 3840 ticks
// 7ft  = 7 * 12 * 32 = 2688 ticks  (used in the 3-parts test)

describe('optimizeCutList', () => {
  // ─── Valid cases ────────────────────────────────────────────────────────────

  it('exact-halves: 2x 10ft parts from 20ft stock, no kerf', () => {
    const result = optimizeCutList({ partTicks: 3840, qty: 4, stockTicks: 7680, kerfTicks: 0 });
    expect(result).not.toBeNull();
    expect(result.perStick).toBe(2);
    expect(result.sticksNeeded).toBe(2);
    expect(result.totalStockTicks).toBe(15360);
    expect(result.usedTicks).toBe(15360);
    expect(result.dropTicks).toBe(0);
    expect(result.wastePct).toBe(0);
  });

  it('7ft parts (2688 ticks) x3 from 20ft stock, no kerf — drop expected', () => {
    // 2688*3=8064 used; two sticks = 15360; drop = 15360-8064 = 7296
    const result = optimizeCutList({ partTicks: 2688, qty: 3, stockTicks: 7680, kerfTicks: 0 });
    expect(result).not.toBeNull();
    expect(result.perStick).toBe(2);            // floor(7680/2688) = floor(2.857) = 2
    expect(result.sticksNeeded).toBe(2);        // ceil(3/2) = 2
    expect(result.usedTicks).toBe(3 * 2688);    // 8064
    const expectedDrop = 2 * 7680 - 3 * 2688;  // 15360-8064 = 7296
    expect(result.dropTicks).toBe(expectedDrop);
    const expectedWastePct = (expectedDrop / result.totalStockTicks) * 100;
    expect(result.wastePct).toBeCloseTo(expectedWastePct, 5);
  });

  it('kerf reduces parts-per-stick: 10ft (3840) x2 from 20ft stock with 1in kerf (32 ticks)', () => {
    // Without kerf: floor(7680/3840) = 2  → but kerf formula: floor((7680+32)/(3840+32)) = floor(7712/3872) = floor(1.992) = 1
    const result = optimizeCutList({ partTicks: 3840, qty: 2, stockTicks: 7680, kerfTicks: 32 });
    expect(result).not.toBeNull();
    expect(result.perStick).toBe(1);
    expect(result.sticksNeeded).toBe(2);
  });

  // ─── Invalid / null cases ────────────────────────────────────────────────

  it('returns null when partTicks is 0', () => {
    expect(optimizeCutList({ partTicks: 0, qty: 4, stockTicks: 7680, kerfTicks: 0 })).toBeNull();
  });

  it('returns null when qty is 0', () => {
    expect(optimizeCutList({ partTicks: 3840, qty: 0, stockTicks: 7680, kerfTicks: 0 })).toBeNull();
  });

  it('returns null when part length exceeds stock length', () => {
    expect(optimizeCutList({ partTicks: 8000, qty: 1, stockTicks: 7680, kerfTicks: 0 })).toBeNull();
  });

  // ─── Additional robustness checks ────────────────────────────────────────

  it('returns null for non-finite stockTicks (NaN)', () => {
    expect(optimizeCutList({ partTicks: 3840, qty: 1, stockTicks: NaN, kerfTicks: 0 })).toBeNull();
  });

  it('returns null for negative qty', () => {
    expect(optimizeCutList({ partTicks: 3840, qty: -1, stockTicks: 7680, kerfTicks: 0 })).toBeNull();
  });

  it('single part, no drop', () => {
    const result = optimizeCutList({ partTicks: 7680, qty: 1, stockTicks: 7680, kerfTicks: 0 });
    expect(result).not.toBeNull();
    expect(result.perStick).toBe(1);
    expect(result.sticksNeeded).toBe(1);
    expect(result.dropTicks).toBe(0);
    expect(result.wastePct).toBe(0);
  });
});
