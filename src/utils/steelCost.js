/**
 * steelCost.js — steel material cost calculation utilities
 *
 * Supports per-lb, per-cwt (hundredweight = 100 lb), and per-ton (2000 lb) pricing.
 */

export const COST_UNITS = ["/lb", "/cwt", "/ton"];

/** Weight divisor for each unit (how many lbs per pricing unit) */
const LB_PER_UNIT = {
  "/lb": 1,
  "/cwt": 100,
  "/ton": 2000,
};

/**
 * Calculate the cost for a single piece.
 *
 * @param {number} weightLb  - Weight of the piece in pounds
 * @param {number} rate      - Price rate (in dollars per pricing unit)
 * @param {string} unit      - One of COST_UNITS ("/lb", "/cwt", "/ton")
 * @returns {number} Cost in dollars, or 0 for invalid / zero inputs
 */
export function pieceCost(weightLb, rate, unit) {
  const per = LB_PER_UNIT[unit];
  if (
    !per ||
    !Number.isFinite(weightLb) ||
    !Number.isFinite(rate) ||
    weightLb <= 0 ||
    rate <= 0
  ) {
    return 0;
  }
  return (weightLb / per) * rate;
}

/**
 * Sum the cost field across an array of rows.
 *
 * @param {Array<{cost: number|string}>} rows
 * @returns {number} Total cost
 */
export function rollupCost(rows) {
  return rows.reduce((sum, row) => sum + (Number(row.cost) || 0), 0);
}
