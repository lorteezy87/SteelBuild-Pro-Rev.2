/**
 * money.ts — currency math without floating-point drift (Phase 2 PR-0).
 *
 * RULE: never accumulate currency in floating-point dollars. All arithmetic is
 * done in integer CENTS; conversion to/from dollars rounds explicitly at the
 * boundary. Percent-derived figures (% complete, retainage) are computed in
 * cents and rounded half-up to the nearest cent. Use these helpers for every
 * pay-app / SOV / contract calculation so totals reconcile to the penny.
 */

type Money = number | string | null | undefined;

const n = (v: Money): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/** Dollars → integer cents (rounds half-up at the cent). */
export function toCents(dollars: Money): number {
  return Math.round(n(dollars) * 100);
}

/** Integer cents → dollars (2dp). */
export function toDollars(cents: number): number {
  return Math.round(n(cents)) / 100;
}

/** Add two dollar amounts via cents. */
export function addMoney(a: Money, b: Money): number {
  return toDollars(toCents(a) + toCents(b));
}

/** Subtract (a − b) via cents. */
export function subMoney(a: Money, b: Money): number {
  return toDollars(toCents(a) - toCents(b));
}

/** Sum a list of dollar amounts via cents (no drift across many lines). */
export function sumMoney(values: Money[]): number {
  let cents = 0;
  for (const v of values || []) cents += toCents(v);
  return toDollars(cents);
}

/** `percent` % OF a dollar amount, rounded to the cent (e.g. retainage). */
export function pctOf(amount: Money, percent: Money): number {
  return toDollars(Math.round((toCents(amount) * n(percent)) / 100));
}

/**
 * The dollar value of a completion percentage against a scheduled value —
 * scheduledValue × percent/100, rounded to the cent. The inverse of
 * `percentComplete`.
 */
export function valueAtPercent(scheduledValue: Money, percent: Money): number {
  return pctOf(scheduledValue, percent);
}

/** completed ÷ scheduled as a percent (0 when scheduled is 0), rounded to 3dp. */
export function percentComplete(completed: Money, scheduledValue: Money): number {
  const sched = toCents(scheduledValue);
  if (sched === 0) return 0;
  return Math.round((toCents(completed) / sched) * 100 * 1000) / 1000;
}

/** Clamp a percent into [0, 100]. */
export function clampPercent(p: Money): number {
  return Math.max(0, Math.min(100, n(p)));
}

/** Equal-to-the-cent comparison (avoids float `===`). */
export function moneyEquals(a: Money, b: Money): boolean {
  return toCents(a) === toCents(b);
}

/** Format dollars for display: "$1,234.56" (or "($1,234.56)" for negatives via accounting). */
export function formatMoney(dollars: Money, opts: { accounting?: boolean } = {}): string {
  const value = toDollars(toCents(dollars));
  const abs = Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (value < 0) return opts.accounting ? `($${abs})` : `-$${abs}`;
  return `$${abs}`;
}
