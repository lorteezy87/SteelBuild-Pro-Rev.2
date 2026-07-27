/**
 * OverdueBar — the pulsing red strip that appears under the KPI row
 * when there are overdue RFIs. Shows up to three overdue chips with
 * RFI #, subject, ball-in-court, and days-late. Clicking a chip calls
 * `onSelect(rfi)` so the page shell can open the detail panel.
 *
 * Renders nothing when `overdueList` is empty.
 */

import React from "react";
import { parseUTCDate } from "@/components/shared/formatters";
import { mono, BIC_COLORS } from "./constants";

export default function OverdueBar({ overdueList, overdueCount, onSelect }) {
  if (!overdueList?.length) return null;
  return (
    <div style={{ background: "linear-gradient(90deg, var(--danger-muted) 0%, color-mix(in srgb, var(--status-error) 6%, transparent) 100%)", borderBottom: "2px solid var(--danger-border)", padding: "8px 16px", display: "flex", alignItems: "center", gap: 10, overflowX: "auto", flexShrink: 0 }}>
      <div style={{ ...mono, fontSize: 9, fontWeight: 800, color: "var(--status-error)", letterSpacing: "0.10em", textTransform: "uppercase", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--status-error)", animation: "gentlePulse 2s ease-in-out infinite" }} />
        {overdueCount} OVERDUE
      </div>
      <div style={{ width: 1, height: 20, background: "var(--danger-border)", flexShrink: 0 }} />
      {overdueList.map((r) => {
        const due = r.date_required ? parseUTCDate(r.date_required) : null;
        const lateDays = due ? Math.abs(Math.ceil((due - new Date()) / 86400000)) : 0;
        const bic = BIC_COLORS[r.ball_in_court || "Contractor"] || BIC_COLORS.Contractor;
        return (
          <div
            key={r.id}
            onClick={() => onSelect(r)}
            style={{
              background: "var(--danger-muted)",
              border: "1px solid var(--danger-border)",
              borderRadius: "var(--radius-badge, 6px)",
              padding: "6px 12px",
              cursor: "pointer",
              whiteSpace: "nowrap",
              display: "flex",
              alignItems: "center",
              gap: 8,
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "color-mix(in srgb, var(--status-error) 20%, transparent)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "var(--danger-muted)")}
          >
            <span style={{ ...mono, fontSize: 10, fontWeight: 800, color: "var(--status-error)" }}>{r.rfi_number}</span>
            <span style={{ ...mono, fontSize: 9, color: "var(--text-secondary)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>{r.title}</span>
            <span style={{ ...mono, fontSize: 8, fontWeight: 700, color: bic.text, background: bic.bg, padding: "1px 5px", borderRadius: 3 }}>{r.ball_in_court || "CTR"}</span>
            <span style={{ ...mono, fontSize: 9, fontWeight: 800, color: "var(--status-error)" }}>{lateDays}d late</span>
          </div>
        );
      })}
    </div>
  );
}
