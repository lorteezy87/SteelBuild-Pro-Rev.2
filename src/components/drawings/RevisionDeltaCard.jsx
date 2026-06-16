/**
 * RevisionDeltaCard — one AI-detected revision delta.
 *
 * Shared by the per-sheet compare rail (RevisionCompareModal) and the
 * package-level Revision Impact Report so both render deltas identically.
 * Read-only when `onToggleDismiss` is omitted.
 */
import React from "react";
import { Check, RotateCcw } from "lucide-react";

const mono = "var(--font-mono)";

export const SEV_COLOR = { critical: "#F85149", high: "#F0883E", medium: "#D29922", low: "#3FB950", info: "#8B949E" };
export const DELTA_LABEL = {
  grid_shift: "Grid shift", connection_change: "Connection", dimension_change: "Dimension",
  detail_revised: "Detail", callout_added: "Callout +", callout_removed: "Callout −",
  material_change: "Material", elevation_change: "Elevation", sheet_added: "Sheet +",
  sheet_removed: "Sheet −", other: "Other",
};

export default function RevisionDeltaCard({ delta: d, onToggleDismiss }) {
  if (!d) return null;
  return (
    <div style={{
      border: "1px solid var(--border-default)", borderRadius: 8, padding: "8px 10px",
      background: "var(--bg-input, rgba(255,255,255,0.02))", opacity: d.dismissed ? 0.45 : 1,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: SEV_COLOR[d.severity] || SEV_COLOR.info, flexShrink: 0 }} />
        <span style={{ fontFamily: mono, fontSize: 8.5, fontWeight: 800, letterSpacing: "0.06em", color: SEV_COLOR[d.severity] || SEV_COLOR.info, textTransform: "uppercase" }}>{d.severity}</span>
        <span style={{ fontFamily: mono, fontSize: 8.5, color: "var(--text-muted)", border: "1px solid var(--border-default)", borderRadius: 4, padding: "1px 4px" }}>{DELTA_LABEL[d.delta_type] || d.delta_type}</span>
        {d.sheet_number && <span style={{ fontFamily: mono, fontSize: 8.5, color: "var(--text-muted)" }}>{d.sheet_number}</span>}
        <span style={{ flex: 1 }} />
        {onToggleDismiss && (
          <button type="button" onClick={() => onToggleDismiss(d)} title={d.dismissed ? "Keep" : "Dismiss"}
            style={{ background: "transparent", border: "none", cursor: "pointer", color: d.dismissed ? "var(--text-muted)" : "var(--accent)", display: "inline-flex", padding: 2 }}>
            {d.dismissed ? <RotateCcw size={12} /> : <Check size={12} />}
          </button>
        )}
      </div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-primary)", lineHeight: 1.5, textDecoration: d.dismissed ? "line-through" : "none" }}>{d.description}</div>
      {d.recommended_action && (
        <div style={{ marginTop: 4, fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>
          → {d.recommended_action}
        </div>
      )}
    </div>
  );
}
