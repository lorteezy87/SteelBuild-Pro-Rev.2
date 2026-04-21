/**
 * QuickUpdateRail — "suggested next steps" card on the Dashboard.
 * Shows a list of AI/rule-derived action suggestions (nudge a BIC,
 * advance a stalled WP, confirm an arriving delivery, etc.).
 *
 * Items come from `suggestions = [{ id, type, label, from, cta, onClick }]`.
 * `type` picks an icon (wp / rfi / delivery / default).
 */

import React from "react";
import { Icon } from "@/components/design-system";

export default function QuickUpdateRail({ suggestions = [], onSettings }) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-card)",
        padding: "14px 16px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              color: "var(--accent)",
              letterSpacing: "0.14em",
            }}
          >
            AI ACTIONS · QUICK UPDATE RAIL
          </div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
            Suggested next steps
          </div>
        </div>
        <div onClick={onSettings} style={{ cursor: onSettings ? "pointer" : "default" }}>
          <Icon name="ai" size={14} color="var(--accent)" />
        </div>
      </div>

      {suggestions.length === 0 ? (
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--text-muted)",
            padding: "16px 0",
            textAlign: "center",
            letterSpacing: "0.08em",
          }}
        >
          — NOTHING URGENT —
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {suggestions.map((q) => (
            <div
              key={q.id}
              onClick={q.onClick}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                borderRadius: 6,
                background: "var(--bg-surface-low)",
                border: "1px solid var(--border-default)",
                cursor: q.onClick ? "pointer" : "default",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--accent-border)";
                e.currentTarget.style.background = "var(--accent-muted)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border-default)";
                e.currentTarget.style.background = "var(--bg-surface-low)";
              }}
            >
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 4,
                  background: "var(--accent-muted)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon
                  name={q.type === "wp" ? "wp" : q.type === "rfi" ? "rfi" : q.type === "delivery" ? "delivery" : "arrow"}
                  size={11}
                  color="var(--accent)"
                />
              </div>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    letterSpacing: "0.04em",
                  }}
                >
                  {q.label}
                </div>
                {q.from && (
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>
                    {q.from}
                  </div>
                )}
              </div>
              {q.cta && (
                <div
                  style={{
                    padding: "3px 8px",
                    borderRadius: 4,
                    background: "var(--accent)",
                    color: "#0B0E11",
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                  }}
                >
                  {q.cta}
                </div>
              )}
              <Icon name="chevronRight" size={10} color="var(--text-muted)" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
