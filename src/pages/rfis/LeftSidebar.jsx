/**
 * LeftSidebar — the 270px column that appears only in LIST view.
 * Four stacked sections:
 *   - Ball in Court bar chart (click to filter)
 *   - Aging Analysis (fresh/aging/stale/critical, click to filter)
 *   - Due-within-7-days card list
 *   - Open Impact ($$$ / schedule days)
 *
 * Gets `bicCounts`, `agingBuckets`, `filtered`, `kpis`, `agingFilter`
 * and the relevant setters from the page shell.
 */

import React from "react";
import { parseUTCDate } from "@/components/shared/formatters";
import { mono, BIC_COLORS } from "./constants";
import { isClosed } from "./utils";

const AGING_ROWS = [
  { label: "< 7 days",    key: "fresh",    color: "var(--status-success)" },
  { label: "7–14 days",   key: "aging",    color: "var(--status-warning)" },
  { label: "15–30 days",  key: "stale",    color: "var(--status-error)"   },
  { label: "> 30 days",   key: "critical", color: "var(--status-error)"   },
];

export default function LeftSidebar({
  bicCounts,
  agingBuckets,
  agingFilter,
  setAgingFilter,
  setFilterBIC,
  setSelectedRFI,
  filtered,
  kpis,
}) {
  return (
    <div style={{ width: 270, flexShrink: 0, borderRight: "1px solid var(--divider)", background: "var(--bg-surface-low)", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--divider)", ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.12em" }}>RFI Tracker</div>

      {/* Ball in Court */}
      <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--divider)" }}>
        <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>Ball in Court</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {bicCounts.map(({ party, count }) => {
            const cfg = BIC_COLORS[party] || BIC_COLORS.Contractor;
            return (
              <div key={party} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }} onClick={() => setFilterBIC(party)}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>{party}</div>
                  <div style={{ width: "100%", height: 6, background: "var(--bg-surface-low)", borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ width: `${count === 0 ? 0 : Math.min(100, (count / Math.max(1, kpis.open)) * 100)}%`, height: "100%", background: cfg.text }} />
                  </div>
                </div>
                <span style={{ ...mono, fontSize: 9, fontWeight: 700, color: cfg.text }}>{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Aging Analysis */}
      <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--divider)" }}>
        <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>Aging Analysis</div>
        {AGING_ROWS.map((b) => {
          const isActive = agingFilter === b.key;
          return (
            <div
              key={b.key}
              onClick={() => setAgingFilter(isActive ? null : b.key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 6,
                cursor: "pointer",
                padding: "4px 6px",
                borderRadius: 6,
                borderLeft: isActive ? `3px solid ${b.color}` : "3px solid transparent",
                background: isActive ? "var(--hover-bg)" : "transparent",
                transition: "background 0.15s, border-color 0.15s",
              }}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "var(--hover-bg)"; }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
            >
              <div style={{ fontSize: 10, color: "var(--text-secondary)", minWidth: 80 }}>{b.label}</div>
              <div style={{ flex: 1, height: 6, background: "var(--bg-surface-low)", borderRadius: 999, overflow: "hidden" }}>
                <div style={{ width: `${Math.min(100, (agingBuckets[b.key] / Math.max(1, kpis.open)) * 100)}%`, height: "100%", background: b.color }} />
              </div>
              <span style={{ ...mono, fontSize: 9, fontWeight: 700, color: b.color }}>{agingBuckets[b.key]}</span>
            </div>
          );
        })}
      </div>

      {/* Due within 7 days */}
      <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--divider)", flex: 1, overflowY: "auto" }}>
        <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
          Due within 7 days ({kpis.dueThisWeek})
        </div>
        {filtered
          .filter((r) => !isClosed(r) && r.date_required)
          .filter((r) => {
            const d = parseUTCDate(r.date_required);
            const today = new Date();
            const in7 = new Date();
            in7.setDate(today.getDate() + 7);
            return d >= today && d <= in7;
          })
          .sort((a, b) => new Date(a.date_required + "T00:00:00") - new Date(b.date_required + "T00:00:00"))
          .map((r) => {
            const cfg = BIC_COLORS[r.ball_in_court || "Contractor"] || BIC_COLORS.Contractor;
            const due = parseUTCDate(r.date_required);
            const diff = Math.ceil((due - new Date()) / 86400000);
            const badgeColor = diff <= 3 ? "var(--status-error)" : "var(--status-warning)";
            return (
              <div key={r.id} onClick={() => setSelectedRFI(r)} style={{ border: "1px solid var(--border-default)", borderRadius: 6, padding: "8px 10px", marginBottom: 6, cursor: "pointer", background: "var(--bg-surface)" }}>
                <div style={{ ...mono, fontSize: 10, fontWeight: 700, color: "var(--accent)" }}>{r.rfi_number}</div>
                <div style={{ fontSize: 10, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
                  <span style={{ ...mono, fontSize: 8, background: cfg.bg, color: cfg.text, padding: "2px 6px", borderRadius: 4 }}>{r.ball_in_court || "Contractor"}</span>
                  <span style={{ ...mono, fontSize: 8, color: badgeColor, fontWeight: 700 }}>{diff <= 0 ? "TODAY" : `${diff}d`}</span>
                </div>
              </div>
            );
          })}
        {kpis.dueThisWeek === 0 && <div style={{ ...mono, fontSize: 9, color: "var(--status-success)" }}>✓ No RFIs due this week</div>}
      </div>

      {/* Open Impact */}
      <div style={{ padding: "10px 14px" }}>
        <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>Open Impact</div>
        {kpis.costExposure > 0 && (
          <div style={{ ...mono, fontSize: 11, fontWeight: 700, color: "var(--status-warning)", marginBottom: 4 }}>$ COST · ${kpis.costExposure.toLocaleString()}</div>
        )}
        {kpis.scheduleDays > 0 && (
          <div style={{ ...mono, fontSize: 11, fontWeight: 700, color: "var(--status-error)" }}>⏱ SCHEDULE · {kpis.scheduleDays}d exposure</div>
        )}
        {kpis.costExposure === 0 && kpis.scheduleDays === 0 && <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>No impact flagged</div>}
      </div>
    </div>
  );
}
