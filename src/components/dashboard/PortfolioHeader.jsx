import React from "react";
import { Button } from "@/components/design-system";
import { selectWatchlist } from "./portfolioDerive";

export default function PortfolioHeader({
  today,
  navigate,
  projects: _projects,
  enrichedMetrics,
  openProjectDashboard,
}) {
  const sorted = selectWatchlist(enrichedMetrics);
  const hasRisks = sorted.length > 0;

  return (
    <>
      {/* Brand Header */}
      <div
        style={{
          background: "linear-gradient(180deg, color-mix(in srgb, var(--bg-surface-low) 78%, #000 22%) 0%, color-mix(in srgb, var(--bg-surface) 94%, #000 6%) 100%)",
          borderBottom: "1px solid var(--divider)",
          padding: "22px 24px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
          boxShadow: "0 14px 34px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden>
            <rect x="4" y="4" width="28" height="5" rx="1" fill="var(--accent)" />
            <rect x="15" y="9" width="6" height="18" rx="0" fill="var(--accent)" />
            <rect x="4" y="27" width="28" height="5" rx="1" fill="var(--accent)" />
          </svg>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span
              style={{
                fontFamily: "Space Grotesk, var(--font-display)",
                fontWeight: 800,
                fontSize: 22,
                letterSpacing: "-0.02em",
                color: "var(--text-primary)",
                textTransform: "uppercase",
              }}
            >
              SteelBuild Pro
            </span>
            <span
              style={{
                fontFamily: "IBM Plex Mono, var(--font-mono)",
                fontSize: 9,
                color: "var(--text-muted)",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              Structural Steel Construction Management — S&H Steel
            </span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              fontFamily: "IBM Plex Mono, var(--font-mono)",
              fontSize: 10,
              color: "var(--text-muted)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {today.replace(/,/g, " ·")}
          </div>
          <Button variant="primary" icon="plus" onClick={() => navigate("/Projects")}>
            New Project
          </Button>
        </div>
      </div>

      {/* ── Priority Watchlist — surfaces the top 3 projects in worst health,
           each with a 1-line "what's wrong" narrative. Click-to-drill opens
           that project's dashboard. When every project is On Track we show an
           all-clear state so the slot doesn't collapse and feel like a bug.
           Consumes enrichedMetrics, which already carries healthScore +
           healthReasons, so zero extra computation. */}
      <div
        style={{
          background: "linear-gradient(180deg, color-mix(in srgb, var(--bg-surface-low) 72%, #000 28%) 0%, color-mix(in srgb, var(--bg-surface) 96%, #000 4%) 100%)",
          borderBottom: "1px solid var(--divider)",
          padding: "14px 24px",
          display: "flex",
          alignItems: "stretch",
          gap: 12,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 160 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: hasRisks ? "var(--status-error)" : "var(--status-success)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
            {hasRisks ? "Priority Watchlist" : "All Clear"}
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginTop: 2, lineHeight: 1.25 }}>
            {hasRisks ? "Top projects needing your attention" : "No projects flagged this hour"}
          </div>
        </div>
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: `repeat(${Math.max(sorted.length, 1)}, minmax(0, 1fr))`, gap: 10 }}>
          {hasRisks ? sorted.map((p) => {
            const sev = p.effectiveHealth === "At Risk" ? "error" : p.effectiveHealth === "Watch" ? "warning" : "info";
            const sevColor = sev === "error" ? "var(--status-error)" : sev === "warning" ? "var(--status-warning)" : "var(--status-info)";
            const reasons = (p.healthReasons || []).slice(0, 2);
            return (
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                aria-label={`Open ${p.name || p.project_name || "project"} dashboard — ${p.effectiveHealth}`}
                onClick={() => openProjectDashboard(p.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openProjectDashboard(p.id); } }}
                className="sbd-card sbd-card-hover"
                style={{
                  background: "linear-gradient(180deg, color-mix(in srgb, var(--bg-surface-high) 76%, #000 24%) 0%, var(--bg-surface) 100%)",
                  border: "1px solid var(--border-default)",
                  borderLeft: `3px solid ${sevColor}`,
                  borderRadius: 14,
                  padding: "10px 12px",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  transition: "border-color 0.12s, transform 0.12s, box-shadow 0.12s",
                  boxShadow: "0 10px 24px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.04)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--accent)";
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow = "0 16px 30px rgba(0,0,0,0.24), 0 0 20px color-mix(in srgb, var(--accent) 12%, transparent), inset 0 1px 0 rgba(255,255,255,0.05)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--border-default)";
                  e.currentTarget.style.transform = "none";
                  e.currentTarget.style.boxShadow = "0 10px 24px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.04)";
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.06em" }}>
                    {p.project_number || "—"}
                  </span>
                  <span style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                    {p.name || p.project_name || "—"}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 800, padding: "1px 6px", borderRadius: 3, background: `color-mix(in srgb, ${sevColor} 14%, transparent)`, color: sevColor, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                    {p.effectiveHealth}
                  </span>
                </div>
                <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.4, overflow: "hidden" }}>
                  {reasons.length > 0 ? reasons.join(" · ") : "No specific signals available"}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.06em" }}>
                    Health {p.healthScore ?? "—"}/100
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.06em" }}>
                    Open →
                  </span>
                </div>
              </div>
            );
          }) : (
            <div
              style={{
                background: "var(--success-muted)",
                border: "1px solid var(--success-border)",
                borderRadius: 4,
                padding: "10px 14px",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--status-success)" }}>✓</span>
              <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-primary)" }}>
                Every project is tracking on schedule. Keep an eye on pending COs and long-lead deliveries to stay ahead.
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
