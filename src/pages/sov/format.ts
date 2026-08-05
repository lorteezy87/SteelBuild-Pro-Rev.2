import { downloadTextFile } from "@/lib/exports/fabRelease";
import { roundCurrency } from "@/components/shared/formatters";

export const SOV_COL_COUNT = 16;

export interface SovLineCalc {
  thisPeriod: number;
  toDate: number;
  balance: number;
  retAmt: number;
  netToDate: number;
  retPct: number;
  overBilled: boolean;
}

export interface SovTotals {
  scheduled: number;
  thisPeriod: number;
  toDate: number;
  balance: number;
  retainage: number;
  net: number;
}

/** Row-level SOV billing math — rounded to cents at each step. */
export function calcSovLine(
  s: Record<string, unknown>,
  effectiveRetainage: number | null,
): SovLineCalc {
  const sv = roundCurrency(s.scheduled_value);
  const prevPct = Number(s.previous_percent_complete) || 0;
  const curPct = Number(s.current_percent_complete) || 0;
  const retPct = effectiveRetainage != null
    ? effectiveRetainage
    : (Number(s.retainage_percent) || 0);
  const thisPeriod = roundCurrency(sv * ((curPct - prevPct) / 100));
  const toDate = roundCurrency(sv * (curPct / 100));
  const balance = roundCurrency(sv - toDate);
  const retAmt = roundCurrency(toDate * (retPct / 100));
  const netToDate = roundCurrency(toDate - retAmt);
  const overBilled = curPct > 100 || balance < 0;
  return { thisPeriod, toDate, balance, retAmt, netToDate, retPct, overBilled };
}

export function computeSovTotals(
  lines: Record<string, unknown>[],
  calc: (s: Record<string, unknown>) => SovLineCalc,
): SovTotals {
  const empty: SovTotals = {
    scheduled: 0, thisPeriod: 0, toDate: 0, balance: 0, retainage: 0, net: 0,
  };
  return lines.reduce((a: SovTotals, s) => {
    const c = calc(s);
    a.scheduled  = roundCurrency(a.scheduled  + roundCurrency(s.scheduled_value));
    a.thisPeriod = roundCurrency(a.thisPeriod + c.thisPeriod);
    a.toDate     = roundCurrency(a.toDate     + c.toDate);
    a.balance    = roundCurrency(a.balance    + c.balance);
    a.retainage  = roundCurrency(a.retainage  + c.retAmt);
    a.net        = roundCurrency(a.net        + c.netToDate);
    return a;
  }, empty);
}

export function mismatchTolerance(projectBudget: number): number {
  return Math.max(0.5, projectBudget * 0.001);
}

export function tdTotalStyle(color?: string): Record<string, unknown> {
  return {
    fontFamily: "var(--font-mono)", fontSize: 11,
    color: color || "var(--text-primary)", fontWeight: 700,
    textAlign: "right", padding: "8px 12px",
  };
}

export const SOV_STATUS_STYLE: Record<string, {
  bg: string;
  color: string;
  border: string;
  hasIcon?: boolean;
}> = {
  Draft: {
    bg: "var(--info-muted)", color: "var(--status-info)",
    border: "var(--info-border)",
  },
  Submitted: {
    bg: "var(--warning-muted)", color: "var(--status-warning)",
    border: "var(--warning-border)",
  },
  Certified: {
    bg: "var(--success-muted)", color: "var(--status-success)",
    border: "var(--success-border)", hasIcon: true,
  },
  Paid: {
    bg: "var(--success-muted)", color: "var(--status-success)",
    border: "var(--success-border)", hasIcon: true,
  },
};

export function miniBarColor(pct: number): string {
  return pct > 95 ? "var(--status-error)"
    : pct >= 80 ? "var(--status-warning)"
    : "var(--status-success)";
}

export function buildSovCsvRows(
  lines: Record<string, unknown>[],
  calc: (s: Record<string, unknown>) => SovLineCalc,
): string[][] {
  return lines.map(s => {
    const c = calc(s);
    return [
      String(s.sov_id ?? ""),
      String(s.description ?? ""),
      String(s.project_name ?? ""),
      String(s.application_number ?? ""),
      String(s.scheduled_value ?? ""),
      String(s.previous_percent_complete ?? ""),
      String(s.current_percent_complete ?? ""),
      c.thisPeriod.toFixed(2),
      c.toDate.toFixed(2),
      c.balance.toFixed(2),
      c.retAmt.toFixed(2),
      c.netToDate.toFixed(2),
      String(s.status ?? ""),
    ];
  });
}

export const SOV_CSV_HEADERS = [
  "SOV ID", "Description", "Project", "App #", "Scheduled",
  "Prev %", "Curr %", "This Period", "To Date", "Balance",
  "Retainage", "Net", "Status",
];

export function buildSovCsvString(
  rows: ReturnType<typeof buildSovCsvRows>,
): string {
  return [SOV_CSV_HEADERS, ...rows]
    .map((r) => r.map((c) => `"${c ?? ""}"`).join(","))
    .join("\n");
}

/** Side-effect CSV download for SOV register export. */
export function downloadSovCsv(
  lines: Record<string, unknown>[],
  calc: (s: Record<string, unknown>) => SovLineCalc,
  filename = "sov.csv",
): void {
  downloadTextFile(
    buildSovCsvString(buildSovCsvRows(lines, calc)),
    filename,
    "text/csv;charset=utf-8",
  );
}

