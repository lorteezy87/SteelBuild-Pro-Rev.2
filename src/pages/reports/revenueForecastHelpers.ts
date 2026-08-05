/** Pure month-bucket helpers for Revenue Forecast report. */
import { formatLocalDate } from "@/utils/dates";

export function monthKey(date: Date | string | number): string {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return formatLocalDate(y, m - 1, 1, "en-US", { month: "short", year: "2-digit" });
}

export function lastNMonthKeys(n: number, now: Date = new Date()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(monthKey(d));
  }
  return out;
}

export function nextNMonthKeys(n: number, now: Date = new Date()): string[] {
  const out: string[] = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    out.push(monthKey(d));
  }
  return out;
}

export type PeriodDeltaLike = {
  periodTo?: string | null;
  submittedDate?: string | null;
  delta?: number | null;
};

/** Bucket certified period deltas into historical month keys. */
export function bucketMonthlyBilled(
  deltas: PeriodDeltaLike[],
  histKeys: string[],
): Record<string, number> {
  const buckets = Object.fromEntries((histKeys || []).map((k) => [k, 0]));
  for (const d of deltas || []) {
    const dateSrc = d.periodTo || d.submittedDate;
    if (!dateSrc) continue;
    const k = monthKey(dateSrc);
    if (k in buckets) buckets[k] += Number(d.delta) || 0;
  }
  return buckets;
}

export function trailingAverage(
  keys: string[],
  monthlyBilled: Record<string, number>,
  n = 3,
): number {
  const last = (keys || []).slice(-n);
  if (!last.length) return 0;
  const sum = last.reduce((s, k) => s + (monthlyBilled[k] || 0), 0);
  return sum / last.length;
}

export type ForecastPoint = {
  label: string;
  monthKey: string;
  value: number;
  forecast: boolean;
};

export function buildRevenueForecastSeries(
  histKeys: string[],
  fcastKeys: string[],
  monthlyBilled: Record<string, number>,
  trailing3: number,
): ForecastPoint[] {
  const hist = (histKeys || []).map((k) => ({
    label: monthLabel(k),
    monthKey: k,
    value: monthlyBilled[k] || 0,
    forecast: false,
  }));
  const fcast = (fcastKeys || []).map((k) => ({
    label: monthLabel(k),
    monthKey: k,
    value: trailing3,
    forecast: true,
  }));
  return [...hist, ...fcast];
}
