import { createLocalDateFromDateOnly, todayLocalISO } from "@/lib/dateOnly";
import { formatUserCurrency, formatUserDate, formatUserDateShort } from "@/lib/userPreferences/formatters";
import { getRuntimeUserPreferences } from "@/lib/userPreferences/runtime";

/** Round to 2 decimal places for currency — avoids IEEE 754 float drift */
export const roundCurrency = (value: unknown): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
};

/**
 * Format a value in the user's configured currency. `decimals` defaults to 2;
 * pass 0 when you want whole-unit display (dashboards, KPI tiles). Intl.NumberFormat handles
 * negatives correctly (`-$1,234.00` / `-$1,234`) so callers don't need to
 * Math.abs + prefix their own sign.
 */
export const formatCurrency = (value: unknown, decimals = 2): string => {
  const num = Number(value);
  if (value == null || isNaN(num)) {
    return decimals === 0 ? "$0" : "$0.00";
  }
  return formatUserCurrency(num, decimals);
};

/** Canonical whole-currency display used by KPI and cost-control surfaces. */
export const formatCurrencyWhole = (value: unknown): string => formatCurrency(value, 0);

export const formatCurrencyShort = (value: unknown): string => {
  const num = Number(value) || 0;
  const currency = getRuntimeUserPreferences().currency_format;
  const locale = currency === "EUR" ? "de-DE" : currency === "CAD" ? "en-CA" : "en-US";
  return new Intl.NumberFormat(locale, { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(num);
};

export const parseUTCDate = (dateStr: unknown): Date | null => {
  if (!dateStr) return null;
  const str = String(dateStr).trim();
  const d = createLocalDateFromDateOnly(str) || new Date(str);
  return isNaN(d.getTime()) ? null : d;
};

export const formatDate = (dateStr: unknown): string => {
  const d = parseUTCDate(dateStr);
  if (!d) return "-";
  return formatUserDate(d);
};

export const formatDateShort = (dateStr: unknown): string => {
  const d = parseUTCDate(dateStr);
  if (!d) return "-";
  return formatUserDateShort(d);
};

export const formatPercent = (value: unknown, decimals = 0): string => {
  const num = Number(value);
  if (value == null || isNaN(num)) return "0%";
  const clamped = Math.min(100, Math.max(0, num));
  return decimals > 0 ? `${Number(clamped.toFixed(decimals))}%` : `${Math.round(clamped)}%`;
};

export const safePct = (num: unknown, denom: unknown): number => {
  const n = Number(num) || 0;
  const d = Number(denom) || 0;
  if (d === 0) return 0;
  return Math.min(100, Math.max(0, Math.round((n / d) * 100)));
};

/** Like safePct but does NOT cap at 100 — use for budget burn / spend ratios. */
export const safeBudgetPct = (num: unknown, denom: unknown): number => {
  const n = Number(num) || 0;
  const d = Number(denom) || 0;
  if (d === 0) return 0;
  return Math.max(0, Math.round((n / d) * 100));
};

/** Like formatPercent but does NOT clamp at 100% — use for budget usage displays. */
export const formatBudgetPercent = (value: unknown, decimals = 0): string => {
  const num = Number(value);
  if (value == null || isNaN(num)) return "0%";
  const clamped = Math.max(0, num);
  return decimals > 0 ? `${Number(clamped.toFixed(decimals))}%` : `${Math.round(clamped)}%`;
};

export const daysOverdue = (dueDate: unknown): number => {
  if (!dueDate) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = parseUTCDate(dueDate);
  if (!due) return 0;
  const diff = Math.floor((today.getTime() - due.getTime()) / 86400000);
  return diff > 0 ? diff : 0;
};

export const isOverdue = (
  dueDate: unknown,
  status: unknown,
  closedStatuses: ReadonlyArray<unknown> = [],
): boolean => {
  if (!dueDate) return false;
  if (statusIn(status, closedStatuses)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = parseUTCDate(dueDate);
  return due ? due < today : false;
};

/**
 * Case-insensitive status comparison
 * @param {string|null|undefined} value - The status value to check
 * @param {string} target - The target to compare against
 * @returns {boolean}
 */
export function statusIs(value: unknown, target: unknown): boolean {
  if (!value || !target) return false;
  return String(value).trim().toLowerCase() === String(target).trim().toLowerCase();
}

/**
 * Check if status is one of several values (case-insensitive)
 */
export function statusIn(value: unknown, targets: ReadonlyArray<unknown> | null | undefined): boolean {
  if (!value || !targets) return false;
  const v = String(value).trim().toLowerCase();
  return targets.some(t => String(t).trim().toLowerCase() === v);
}

export { todayLocalISO };
