/**
 * Cut List Optimizer
 *
 * Calculates how many parts fit per stock stick and how many sticks are needed,
 * accounting for kerf (saw blade width) between cuts.
 *
 * All lengths are in 32nd-inch ticks (e.g. 20ft = 7680 ticks, 10ft = 3840 ticks).
 *
 * @param {object} params
 * @param {number} params.partTicks   - length of one part in 32nd-inch ticks
 * @param {number} params.qty         - number of parts needed
 * @param {number} params.stockTicks  - length of one stock stick in 32nd-inch ticks
 * @param {number} [params.kerfTicks=0] - kerf (saw blade width) in 32nd-inch ticks
 * @returns {{ perStick, sticksNeeded, totalStockTicks, usedTicks, dropTicks, wastePct } | null}
 */
export function optimizeCutList({ partTicks, qty, stockTicks, kerfTicks = 0 }) {
  const p = Number(partTicks);
  const n = Number(qty);
  const s = Number(stockTicks);
  const k = Number(kerfTicks);

  // Guard: all inputs must be finite
  if (!isFinite(p) || !isFinite(n) || !isFinite(s) || !isFinite(k)) return null;

  // Guard: dimensions must be positive
  if (p <= 0 || n <= 0 || s <= 0) return null;

  // Guard: part cannot exceed stock length
  if (p > s) return null;

  // How many parts fit in one stock stick?
  // The first part needs no leading kerf; each additional part needs one kerf before it.
  // Formula: floor((s + k) / (p + k))  — algebraically adds a "phantom leading kerf"
  // so the arithmetic divides evenly, then floor gives the count.
  const perStick = Math.max(1, Math.floor((s + k) / (p + k)));

  const sticksNeeded = Math.ceil(n / perStick);
  const totalStockTicks = sticksNeeded * s;
  const usedTicks = n * p;
  const dropTicks = totalStockTicks - usedTicks;
  const wastePct = totalStockTicks > 0 ? (dropTicks / totalStockTicks) * 100 : 0;

  return { perStick, sticksNeeded, totalStockTicks, usedTicks, dropTicks, wastePct };
}
