import React from "react";
import { createPageUrl } from "@/utils";
import { formatCurrency } from "../../shared/formatters";

/**
 * WaitingOnColumn — column 2 of the Priority Command Center ("Waiting On" —
 * items pending an external response). Extracted verbatim from PortfolioView.
 * `waitingOn` comes from pccData; `navigate` is the router push for deep links.
 */
export default function WaitingOnColumn({ waitingOn, navigate }) {
  return (
    <div style={{ borderRight: "1px solid var(--divider)", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", color: "var(--status-warning)", textTransform: "uppercase", marginBottom: 2, display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ width: 3, height: 12, background: "var(--status-warning)", borderRadius: 1 }} />
        Waiting On ({waitingOn.length})
      </div>
      {waitingOn.length === 0 ? (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", padding: 12, textAlign: "center" }}>
          Nothing blocked externally
        </div>
      ) : (
        waitingOn.slice(0, 8).map((item, i) => (
          <div key={i} onClick={() => navigate(createPageUrl(item.nav))} style={{
            padding: "8px 10px", borderBottom: "1px solid var(--divider)", cursor: "pointer", borderRadius: 10,
            background: "color-mix(in srgb, var(--bg-surface) 90%, #000 10%)",
            transition: "background 0.12s, box-shadow 0.12s",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
          }} onMouseEnter={(e) => { e.currentTarget.style.background = "var(--hover-bg)"; e.currentTarget.style.boxShadow = "0 10px 24px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.03)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "color-mix(in srgb, var(--bg-surface) 90%, #000 10%)"; e.currentTarget.style.boxShadow = "inset 0 1px 0 rgba(255,255,255,0.03)"; }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: "var(--status-warning)" }}>{item.type}</span>
                  <span style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-primary)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>{item.title}</span>
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", marginTop: 1 }}>
                  Waiting on: <span style={{ color: "var(--status-warning)" }}>{item.waitingFor}</span>
                  {item.amount ? <span> · {formatCurrency(item.amount).replace(/\.\d+/, "")}</span> : null}
                </div>
              </div>
              {item.days > 0 && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: item.days >= 14 ? "var(--status-error)" : "var(--text-muted)", fontWeight: 600, flexShrink: 0 }}>
                  {item.days}d
                </span>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
