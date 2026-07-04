import React from "react";
import { createPageUrl } from "@/utils";

/**
 * PriorityColumn — column 1 of the Priority Command Center ("Today's
 * Priorities"). Extracted verbatim from PortfolioView. `priorities` and
 * `rfiTurnaround` come from pccData / the RFI-turnaround memo; `navigate` is the
 * router push used for the per-item deep links.
 */
export default function PriorityColumn({ priorities, rfiTurnaround, navigate }) {
  return (
    <div style={{ borderRight: "1px solid var(--divider)", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", color: "var(--status-error)", textTransform: "uppercase", marginBottom: 2, display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ width: 3, height: 12, background: "var(--status-error)", borderRadius: 1 }} />
        Today's Priorities
      </div>
      {priorities.length === 0 ? (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--status-success)", fontWeight: 700, padding: 12, textAlign: "center" }}>
          ALL CLEAR — No overdue items
          {rfiTurnaround && <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", fontWeight: 400, marginTop: 4 }}>Avg RFI turnaround: {rfiTurnaround}d</div>}
        </div>
      ) : (
        priorities.slice(0, 8).map((item, i) => {
          const sevColor = item.severity === "critical" ? "var(--status-error)" : item.severity === "high" ? "var(--status-error)" : "var(--status-warning)";
          return (
            <div key={i} onClick={() => navigate(createPageUrl(item.nav))} style={{
              borderLeft: `3px solid ${sevColor}`,
              background: i === 0 ? `color-mix(in srgb, ${sevColor} 12%, var(--bg-surface))` : "color-mix(in srgb, var(--bg-surface) 88%, #000 12%)",
              borderRadius: "0 12px 12px 0", padding: "10px 12px", cursor: "pointer",
              transition: "background 0.12s, box-shadow 0.12s",
              boxShadow: "0 10px 24px rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.03)",
            }} onMouseEnter={(e) => { e.currentTarget.style.background = "var(--hover-bg)"; e.currentTarget.style.boxShadow = "0 14px 28px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.04)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = i === 0 ? `color-mix(in srgb, ${sevColor} 12%, var(--bg-surface))` : "color-mix(in srgb, var(--bg-surface) 88%, #000 12%)"; e.currentTarget.style.boxShadow = "0 10px 24px rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.03)"; }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 800, color: sevColor }}>#{i + 1}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: sevColor, letterSpacing: "0.06em" }}>{item.type} {item.id}</span>
                  </div>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.title}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", marginTop: 1 }}>{item.project}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--accent)", background: "var(--accent-muted)", border: "1px solid var(--accent-border)", borderRadius: 3, padding: "1px 6px" }}>
                      {item.action}
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>
                      Owner: <span style={{ color: "var(--text-primary)" }}>{item.owner}</span>
                    </span>
                  </div>
                </div>
                {item.days > 0 && (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 800, color: "var(--status-error)", background: "var(--danger-muted)", border: "1px solid var(--danger-border)", borderRadius: 3, padding: "2px 6px", flexShrink: 0 }}>
                    {item.days}D
                  </span>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
