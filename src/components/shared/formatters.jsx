import { createLocalDateFromDateOnly, todayLocalISO } from "@/lib/dateOnly";

export const formatCurrency = (value) => {
  const num = Number(value);
  if (value == null || isNaN(num)) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

export const formatCurrencyShort = (value) => {
  const num = Number(value) || 0;
  if (isNaN(num)) return "$0";
  if (Math.abs(num) >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (Math.abs(num) >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
  return `$${num.toFixed(0)}`;
};

export const parseUTCDate = (dateStr) => {
  if (!dateStr) return null;
  const str = String(dateStr).trim();
  const d = createLocalDateFromDateOnly(str) || new Date(str);
  return isNaN(d.getTime()) ? null : d;
};

export const formatDate = (dateStr) => {
  const d = parseUTCDate(dateStr);
  if (!d) return "-";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

export const formatDateShort = (dateStr) => {
  const d = parseUTCDate(dateStr);
  if (!d) return "-";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export const formatPercent = (value, decimals = 0) => {
  const num = Number(value);
  if (value == null || isNaN(num)) return "0%";
  const clamped = Math.min(100, Math.max(0, num));
  return decimals > 0 ? `${Number(clamped.toFixed(decimals))}%` : `${Math.round(clamped)}%`;
};

export const safePct = (num, denom) => {
  const n = Number(num) || 0;
  const d = Number(denom) || 0;
  if (d === 0) return 0;
  return Math.min(100, Math.max(0, Math.round((n / d) * 100)));
};

/** Like safePct but does NOT cap at 100 — use for budget burn / spend ratios. */
export const safeBudgetPct = (num, denom) => {
  const n = Number(num) || 0;
  const d = Number(denom) || 0;
  if (d === 0) return 0;
  return Math.max(0, Math.round((n / d) * 100));
};

/** Like formatPercent but does NOT clamp at 100% — use for budget usage displays. */
export const formatBudgetPercent = (value, decimals = 0) => {
  const num = Number(value);
  if (value == null || isNaN(num)) return "0%";
  const clamped = Math.max(0, num);
  return decimals > 0 ? `${Number(clamped.toFixed(decimals))}%` : `${Math.round(clamped)}%`;
};

export const daysOverdue = (dueDate) => {
  if (!dueDate) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = parseUTCDate(dueDate);
  if (!due) return 0;
  const diff = Math.floor((today - due) / 86400000);
  return diff > 0 ? diff : 0;
};

export const isOverdue = (dueDate, status, closedStatuses = []) => {
  if (!dueDate) return false;
  if (closedStatuses.includes(status)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = parseUTCDate(dueDate);
  return due ? due < today : false;
};

export { todayLocalISO };
