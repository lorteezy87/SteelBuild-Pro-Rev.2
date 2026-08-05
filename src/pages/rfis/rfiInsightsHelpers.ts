/** Pure helpers for RFI Insights strip charts/stats. */

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
