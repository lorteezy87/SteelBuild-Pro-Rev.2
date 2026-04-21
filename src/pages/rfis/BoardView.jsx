/**
 * BoardView — kanban-style columns, one per workflow status. Cards
 * show RFI #, priority pill, title, drawing ref, BIC pill, due date,
 * and days-open. Clicking a card opens it in the detail panel.
 */

import React from "react";
import { mono, statusColumns, PRIORITY_CFG, BIC_COLORS } from "./constants";
import { isOverdue, daysOpen } from "./utils";
import { Pill } from "./subcomponents";

export default function BoardView({ filtered, onSelect }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, padding: 12, width: "100%", overflow: "auto" }}>
      {statusColumns.map((st) => {
        const col = filtered.filter((r) => r.status === st);
        return (
          <div key={st} style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 4, display: "flex", flexDirection: "column", maxHeight: "100%", overflow: "hidden" }}>
            <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--divider)", ...mono, fontSize: 10, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.10em", textTransform: "uppercase" }}>
              {st} · {col.length}
            </div>
            <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }}>
              {col.map((r) => {
                const pr = PRIORITY_CFG[r.priority] || PRIORITY_CFG.Medium;
                const bic = BIC_COLORS[r.ball_in_court || "Contractor"] || BIC_COLORS.Contractor;
                const overdue = isOverdue(r);
                return (
                  <div
                    key={r.id}
                    onClick={() => onSelect(r)}
                    style={{
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border-default)",
                      borderLeft: overdue ? "3px solid var(--status-error)" : r.priority === "Critical" ? "3px solid var(--status-warning)" : "3px solid transparent",
                      borderRadius: 4,
                      padding: "10px 12px",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <div style={{ ...mono, fontSize: 10, fontWeight: 800, color: "var(--accent)" }}>{r.rfi_number}</div>
                      <Pill label={r.priority} color={pr.color} bg={pr.bg} />
                    </div>
                    <div style={{ fontFamily: "var(--font-body)", fontSize: 12.5, fontWeight: 500, color: "var(--text-primary)", lineHeight: 1.3, marginBottom: 4, maxHeight: 38, overflow: "hidden" }}>
                      {r.title}
                    </div>
                    {r.drawing_reference && <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)" }}>{r.drawing_reference}</div>}
                    <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8 }}>
                      <Pill label={r.ball_in_court || "Contractor"} color={bic.text} bg={bic.bg} />
                      <span style={{ ...mono, fontSize: 8, color: overdue ? "var(--status-error)" : "var(--text-muted)", fontWeight: overdue ? 700 : 500 }}>
                        {r.date_required ? new Date(r.date_required + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                      </span>
                      <span style={{ ...mono, fontSize: 8, color: "var(--text-secondary)" }}>{daysOpen(r)}d</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
