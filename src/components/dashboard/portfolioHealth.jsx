import React from "react";

/* ── Aggressive health scoring — real signals, not optimistic defaults ────── */
export function computeWeightedHealth(p) {
  const reasons = [];

  // Factor 1: RFI health (30%) — any overdue = immediate penalty
  let rfiScore = 100;
  if (p.overdueRFIs > 0) {
    rfiScore = p.overdueRFIs >= 3 ? 10 : p.overdueRFIs >= 2 ? 30 : 50;
    reasons.push(`${p.overdueRFIs} overdue RFI${p.overdueRFIs > 1 ? "s" : ""}`);
  } else if (p.openRFIs > 5) {
    rfiScore = 65;
    reasons.push(`${p.openRFIs} open RFIs (backlog)`);
  }

  // Factor 2: Budget health (25%) — burn rate matters
  let budgetScore = 100;
  if (p.hasBudgetData && p.budget > 0) {
    const burnPct = p.actual / p.budget;
    if (burnPct > 1.10) { budgetScore = 0; reasons.push("Budget exceeded by 10%+"); }
    else if (burnPct > 1.05) { budgetScore = 25; reasons.push("Over budget"); }
    else if (burnPct > 0.95) { budgetScore = 55; reasons.push("Budget burn > 95%"); }
    else if (burnPct > 0.85) budgetScore = 80;
  } else if (!p.hasBudgetData) {
    budgetScore = 70; // Unknown = not healthy, penalize missing data
    reasons.push("No budget set up");
  }

  // Factor 3: Delivery performance (25%) — late = critical in steel
  let delScore = 100;
  if (p.lateDeliveries > 0) {
    delScore = p.lateDeliveries >= 3 ? 10 : p.lateDeliveries >= 2 ? 35 : 55;
    reasons.push(`${p.lateDeliveries} late deliver${p.lateDeliveries > 1 ? "ies" : "y"}`);
  }

  // Factor 4: Production health (20%) — stalled = blocked job
  let prodScore = 100;
  if (p.stalledWPs > 0) {
    prodScore = Math.max(0, 100 - p.stalledWPs * 30);
    reasons.push(`${p.stalledWPs} stalled WP${p.stalledWPs > 1 ? "s" : ""}`);
  }
  if (p.avgProgress < 15 && p.stalledWPs > 0) prodScore = Math.min(prodScore, 30);

  // CO exposure penalty (bonus factor) — pending COs = financial risk
  const coPenalty = p.pendingCOs?.length >= 3 ? 10 : p.pendingCOs?.length >= 1 ? 5 : 0;
  if (p.pendingCOs?.length > 0) reasons.push(`${p.pendingCOs.length} pending CO${p.pendingCOs.length > 1 ? "s" : ""}`);

  const raw = Math.round(
    rfiScore    * 0.30 +
    budgetScore * 0.25 +
    delScore    * 0.25 +
    prodScore   * 0.20
  ) - coPenalty;
  const score = Math.min(100, Math.max(0, raw));

  let label;
  if (score >= 75) label = "On Track";
  else if (score >= 50) label = "Watch";
  else label = "At Risk";

  return {
    score,
    label,
    reasons,
    factors: { rfi: rfiScore, budget: budgetScore, delivery: delScore, production: prodScore },
  };
}

/* ── Health pill with score + reason tooltip ──────────────────────────────── */
export function HealthPill({ status, score, reasons }) {
  const cfg = {
    "On Track": { bg: "var(--status-success)", text: "#fff", label: "ON TRACK", badge: "sbd-badge-success" },
    "Watch":    { bg: "var(--status-warning)", text: "#000", label: "WATCH",    badge: "sbd-badge-warning" },
    "At Risk":  { bg: "var(--status-error)",   text: "#fff", label: "AT RISK",  badge: "sbd-badge-error" },
  };
  const s = cfg[status] || cfg["On Track"];
  const tip = reasons?.length > 0 ? reasons.join(" · ") : "All signals healthy";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }} title={tip}>
      {score != null && (
        <span className="sbd-num" style={{
          fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 800,
          color: s.bg, lineHeight: 1, minWidth: 20, textAlign: "right",
        }}>
          {score}
        </span>
      )}
      <span
        className={`sbd-badge ${s.badge}`}
        style={{
          background: s.bg, color: s.text,
          fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
          letterSpacing: "0.08em", padding: "3px 10px",
          borderRadius: 999, whiteSpace: "nowrap",
        }}
      >
        {s.label}
      </span>
    </div>
  );
}

export const HEALTH_ORDER = { "At Risk": 0, "Watch": 1, "On Track": 2 };

export function healthColor(status) {
  switch (status) {
    case "On Track": return "var(--status-success)";
    case "Watch": return "var(--status-warning)";
    case "At Risk": return "var(--status-error)";
    default: return "var(--text-muted)";
  }
}

/* ── PSR-snapshot provenance for portfolio health ──────────────────────────
 * A project's health_status is set from PSR-spreadsheet snapshot imports
 * (projects.metadata.psr), which drift from the live rfis/submittals tables —
 * e.g. a snapshot keeps a project "At Risk / 13 open RFIs" weeks after they're
 * all closed. This pure helper reports whether a project's health came from
 * such a snapshot and how old it is, so the UI can flag a stale verdict instead
 * of presenting it as current. `now` is injectable for deterministic tests. */
export const PSR_STALE_DAYS = 14;

export function psrHealthProvenance(project, now = new Date()) {
  const psr = project?.metadata?.psr;
  // The import nests the verdict under `latest` (an older shape stored it at the
  // psr root — tolerate both); the import timestamp lives at the psr root.
  const snapshotHealth = psr?.latest?.proposed_health_status ?? psr?.proposed_health_status ?? null;
  const importedAt = psr?.last_imported_at ?? psr?.latest?.imported_at ?? null;
  if (!psr || !snapshotHealth || !importedAt) {
    return { fromSnapshot: false, snapshotHealth: null, importedAt: null, ageDays: null, stale: false, driftRisk: false };
  }
  const ts = new Date(importedAt).getTime();
  if (Number.isNaN(ts)) {
    return { fromSnapshot: true, snapshotHealth, importedAt: null, ageDays: null, stale: false, driftRisk: false };
  }
  const ageDays = Math.max(0, Math.floor((now.getTime() - ts) / 86400000));
  const stale = ageDays > PSR_STALE_DAYS;
  // driftRisk = the displayed health IS this stale snapshot — the project's
  // current health_status still equals the snapshot's verdict (it hasn't been
  // refreshed against live RFIs/submittals). This is the actionable case to flag;
  // a project whose health_status has since diverged from the snapshot isn't.
  const driftRisk = stale && project?.health_status != null && project.health_status === snapshotHealth;
  return { fromSnapshot: true, snapshotHealth, importedAt, ageDays, stale, driftRisk };
}
