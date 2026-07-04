import React from "react";

/**
 * RiskWatchColumn — column 3 of the Priority Command Center ("Risk Watchlist" —
 * projects trending toward trouble). Extracted verbatim from PortfolioView.
 * `riskWatch` comes from pccData; `openProjectDashboard` opens a project's
 * dashboard on click.
 */
export default function RiskWatchColumn({ riskWatch, openProjectDashboard }) {
  return (
    <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 2, display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ width: 3, height: 12, background: "var(--text-muted)", borderRadius: 1 }} />
        Risk Watchlist
      </div>
      {riskWatch.length === 0 ? (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--status-success)", padding: 12, textAlign: "center", fontWeight: 700 }}>
          ALL PROJECTS HEALTHY
        </div>
      ) : (
        riskWatch.map((p, i) => {
          const color = p.status === "At Risk" ? "var(--status-error)" : "var(--status-warning)";
          return (
            <div key={i} onClick={() => openProjectDashboard(p.projectId)} style={{
              borderLeft: `3px solid ${color}`,
              background: `color-mix(in srgb, ${color} 10%, var(--bg-surface))`, borderRadius: "0 12px 12px 0",
              padding: "8px 10px", cursor: "pointer", boxShadow: "0 10px 24px rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.03)",
            }} onMouseEnter={(e) => e.currentTarget.style.background = "var(--hover-bg)"} onMouseLeave={(e) => e.currentTarget.style.background = `color-mix(in srgb, ${color} 10%, var(--bg-surface))`}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600, color: "var(--text-primary)" }}>{p.project}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 800, color }}>{p.score}</span>
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color, marginTop: 2 }}>
                {p.topReason}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
