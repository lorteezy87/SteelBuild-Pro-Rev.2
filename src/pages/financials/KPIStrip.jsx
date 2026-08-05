import React from "react";
import { mono, body } from "./utils";

export { KpiStrip as KPIStrip } from "@/components/command/KpiStrip";

export function SummaryCard({ label, value, detail, tone = "var(--accent)" }) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-card)",
        padding: "14px 16px",
        borderTop: `2px solid ${tone}`,
      }}
    >
      <div style={{ ...mono, fontSize: 8, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ ...mono, fontSize: 18, fontWeight: 700, color: tone, marginBottom: 4 }}>
        {value}
      </div>
      {detail ? <div style={{ ...body, fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5 }}>{detail}</div> : null}
    </div>
  );
}
