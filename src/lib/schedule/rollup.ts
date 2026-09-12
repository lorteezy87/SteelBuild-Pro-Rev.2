/**
 * rollup — duration-weighted progress.
 *
 * Audit §2.3. Summary percent-complete was an unweighted mean across direct
 * children, so every task counted the same regardless of how long it was:
 *
 *   child A  "Punch 1 pc"      1 day, 100%   ┐  unweighted mean → 50%
 *   child B  "Erect sequence" 60 days,   0%  ┘  duration-weighted →  2%
 *
 * The same unweighted mean was the HEADLINE project number in the Schedule
 * Command Center hero and KPI strip, and the Look-Ahead's weekly bar did the
 * same thing by count. 50% is what a PM reads off the screen and repeats to an
 * owner on a job that has not started.
 *
 * Weighting by duration is the minimum defensible fix. Weighting by budget
 * hours would be better still — that data lives on the BudgetHours page — and
 * `weightedPercentComplete` takes the weight function precisely so that swap is
 * a one-line change at the call site rather than a rewrite here.
 */

export type PercentFn<T> = (item: T) => number | null | undefined;
export type WeightFn<T> = (item: T) => number | null | undefined;

/**
 * Duration-weighted mean percent-complete, rounded to a whole percent.
 *
 * Returns null when there is nothing to average, so the caller decides what an
 * empty roll-up means rather than receiving a 0 that reads as "no progress".
 *
 * Items with no usable weight fall back to the unweighted mean **as a group**:
 * if no child has a duration there is no basis for weighting and the plain mean
 * is the only honest answer. Mixing the two — treating an undated child as
 * weight 1 alongside a 60-day sibling — would silently near-erase it instead,
 * which is a different lie from the one being fixed.
 *
 * Items whose percent is **unknown** are excluded from the average entirely,
 * rather than counted as 0. `percentOf` returning null says the caller does not
 * know how far along that task is — most often a task just reopened from
 * Complete, whose remaining work nobody has restated yet (§4.3). Averaging it
 * in as zero would drag the roll-up down by asserting no work has been done on
 * it, which is the same "absence is not evidence" error the weighting fixed.
 * When no item has a known percent the result is null: nothing to average.
 */
export function weightedPercentComplete<T>(
  items: readonly T[] | null | undefined,
  percentOf: PercentFn<T>,
  weightOf: WeightFn<T>,
): number | null {
  if (!Array.isArray(items) || items.length === 0) return null;

  let weightedSum = 0;
  let totalWeight = 0;
  let plainSum = 0;
  let known = 0;

  for (const item of items) {
    const pct = clampPercent(percentOf(item));
    if (pct === null) continue;
    known += 1;
    plainSum += pct;

    const weight = Number(weightOf(item));
    if (Number.isFinite(weight) && weight > 0) {
      weightedSum += pct * weight;
      totalWeight += weight;
    }
  }

  if (known === 0) return null;
  if (totalWeight > 0) return Math.round(weightedSum / totalWeight);
  return Math.round(plainSum / known);
}

/**
 * How much of the roll-up is actually weighted, for a caller that wants to
 * qualify the number it shows.
 *
 * A project where only 2 of 400 tasks carry a duration produces a weighted
 * percentage that is technically correct and practically meaningless; this lets
 * the UI say so rather than presenting it as a firm number.
 */
export function weightedCoverage<T>(
  items: readonly T[] | null | undefined,
  weightOf: WeightFn<T>,
): { weighted: number; total: number } {
  if (!Array.isArray(items)) return { weighted: 0, total: 0 };
  let weighted = 0;
  for (const item of items) {
    const w = Number(weightOf(item));
    if (Number.isFinite(w) && w > 0) weighted += 1;
  }
  return { weighted, total: items.length };
}

/**
 * Clamp to 0-100, or null when there is no number to clamp.
 *
 * Null in, null out — the distinction between "0% done" and "we don't know" is
 * the whole reason this returns a nullable.
 */
function clampPercent(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, n));
}
