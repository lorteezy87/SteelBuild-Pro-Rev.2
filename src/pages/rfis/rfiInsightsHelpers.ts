/** Pure helpers for RFI Insights strip charts/stats. */

import { isOverdue } from "./utils";
import { oldestOpenRFIAgeDays, rfiAgingBuckets } from "../dashboard/projectMetrics";

export function avgAgeDays(
  openRfis: Array<{ submitted_date?: string | null; created_at?: string | null }>,
  now: Date = new Date(),
): number {
  if (!(openRfis || []).length) return 0;
  let sum = 0;
  let n = 0;
  for (const r of openRfis) {
    const created = r.submitted_date || r.created_at;
    if (!created) continue;
    const d = new Date(created);
    if (Number.isNaN(d.getTime())) continue;
    sum += Math.floor((now.getTime() - d.getTime()) / 86400000);
    n += 1;
  }
  return n ? Math.round(sum / n) : 0;
}

const BIC_PALETTE: Record<string, string> = {
  Architect: "var(--status-info)",
  Engineer: "var(--status-warning)",
  GC: "var(--accent)",
  Owner: "var(--status-info)",
  Internal: "var(--text-muted)",
  Contractor: "var(--accent)",
};

export function ballInCourtSegments(
  openRfis: Array<{ ball_in_court?: string | null }>,
): Array<{ label: string; value: number; color: string }> {
  const counts: Record<string, number> = {};
  for (const r of openRfis || []) {
    const k = r.ball_in_court || "Internal";
    counts[k] = (counts[k] || 0) + 1;
  }
  return Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([label, value]) => ({
      label,
      value,
      color: BIC_PALETTE[label] || "var(--text-muted)",
    }));
}

export function rfisByMonth(
  rfis: Array<{ submitted_date?: string | null; created_at?: string | null }>,
  now: Date = new Date(),
): Array<{ key: string; label: string; value: number }> {
  const out: Array<{ key: string; label: string; value: number }> = [];
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleString("default", { month: "short" }),
      value: 0,
    });
  }
  for (const r of rfis || []) {
    const created = r.submitted_date || r.created_at;
    if (!created) continue;
    const d = new Date(created);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const slot = out.find((m) => m.key === key);
    if (slot) slot.value += 1;
  }
  return out;
}

const CLOSED_FOR_OPEN = new Set(["Answered", "Closed"]);

export function filterOpenRfisForInsights<
  T extends { status?: string | null },
>(rfis: T[]): T[] {
  return (rfis || []).filter((r) => !CLOSED_FOR_OPEN.has(String(r.status || "")));
}

export function buildRfiInsightsStats(
  rfis: Array<Record<string, any>> = [],
  now: Date = new Date(),
) {
  const openRfis = filterOpenRfisForInsights(rfis);
  const overdue = (rfis || []).filter((r) => isOverdue(r));
  const critical = (rfis || []).filter(
    (r) => r.priority === "Critical" && r.status !== "Closed",
  );
  return {
    totalOpen: openRfis.length,
    avgAge: avgAgeDays(openRfis, now),
    oldest: oldestOpenRFIAgeDays(rfis),
    overdue: overdue.length,
    critical: critical.length,
    buckets: rfiAgingBuckets(rfis),
    bicSegments: ballInCourtSegments(openRfis),
    monthly: rfisByMonth(rfis, now),
  };
}

export const RFI_INSIGHT_CARD = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-card)",
  padding: "12px 14px",
} as const;

