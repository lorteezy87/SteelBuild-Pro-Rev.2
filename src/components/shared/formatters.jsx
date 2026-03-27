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

// Safe UTC date parser — avoids timezone off-by-one for YYYY-MM-DD strings
export const parseUTCDate = (dateStr) => {
  if (!dateStr) return null;
  const str = String(dateStr).trim();
  const d = str.length === 10 ? new Date(str + "T00:00:00Z") : new Date(str);
  return isNaN(d.getTime()) ? null : d;
};

export const formatDate = (dateStr) => {
  const d = parseUTCDate(dateStr);
  if (!d) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
};

// Short format: "Mar 23"
export const formatDateShort = (dateStr) => {
  const d = parseUTCDate(dateStr);
  if (!d) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
};

export const formatPercent = (value, decimals = 0) => {
  const num = Number(value);
  if (value == null || isNaN(num)) return "0%";
  const clamped = Math.min(100, Math.max(0, num));
  return decimals > 0 ? `${Number(clamped.toFixed(decimals))}%` : `${Math.round(clamped)}%`;
};

// Safely compute percentage with divide-by-zero guard, clamped 0-100
export const safePct = (num, denom) => {
  const n = Number(num) || 0;
  const d = Number(denom) || 0;
  if (d === 0) return 0;
  return Math.min(100, Math.max(0, Math.round((n / d) * 100)));
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