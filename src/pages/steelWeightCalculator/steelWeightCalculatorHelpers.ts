/**
 * Pure helpers for Steel Weight Calculator.
 */
import { parseLength, ticksToDecimalFeet } from "@/utils/lengthMath";

export const LS_RATE = "calc:steelweight:rate";
export const LS_UNIT = "calc:steelweight:unit";
export const LS_ROWS = "calc:steelweight:rows";

export const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const LENGTH_MODES = {
  FT_IN: "ft-in",
  DECIMAL: "decimal",
} as const;

export function parseLengthFeet(raw: unknown, mode: string): number | null {
  if (raw == null || String(raw).trim() === "") return null;
  if (mode === LENGTH_MODES.DECIMAL) {
    const n = parseFloat(String(raw));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  // Default: feet-inches mode. parseLength returns 32nd-inch ticks.
  const ticks = parseLength(raw as string);
  if (ticks == null || ticks <= 0) return null;
  return ticksToDecimalFeet(ticks);
}

export function readLS(key: string, fallback: string): string {
  try {
    const raw = window.localStorage.getItem(key);
    return raw == null ? fallback : raw;
  } catch {
    return fallback;
  }
}

export function writeLS(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* quota / private-mode — ignore */
  }
}

export function readRows(): unknown[] {
  try {
    const raw = window.localStorage.getItem(LS_ROWS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** CSV-cell escaping: wrap in quotes + double any embedded quotes when needed. */
export function csvCell(value: unknown): string {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function parsePositiveRate(rate: string): number {
  const n = parseFloat(rate);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function computeWeightTotals(lbPerFt: number, lengthFt: number, qty: number) {
  const piece = lbPerFt * lengthFt;
  const total = piece * qty;
  return { piece, total };
}

export function buildTakeoffCsv(
  runningTotal: Array<{
    shape?: string;
    qty?: number;
    lengthDisplay?: string | number;
    lbPerFt?: number;
    totalWeight?: number;
    cost?: number | null;
  }>,
): string {
  const header = ["shape", "qty", "length", "lb_per_ft", "weight_lb", "cost"];
  const lines = [header.join(",")];
  for (const r of runningTotal) {
    lines.push(
      [
        csvCell(r.shape),
        csvCell(r.qty),
        csvCell(r.lengthDisplay),
        csvCell((r.lbPerFt ?? 0).toFixed(3)),
        csvCell((r.totalWeight ?? 0).toFixed(2)),
        csvCell((Number(r.cost) || 0).toFixed(2)),
      ].join(","),
    );
  }
  return lines.join("\n");
}
