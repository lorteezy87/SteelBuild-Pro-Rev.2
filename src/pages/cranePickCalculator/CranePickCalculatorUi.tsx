/**
 * Presentational building blocks for Crane Pick Calculator.
 */
// @ts-nocheck
import React from "react";
import { toast } from "sonner";
import {
  lbOrDash,
  tonsOrDash,
  buildSummaryText,
  keycapButtonStyle,
  STATUS_LABEL,
  PICK_TAPE_KEY,
  mono,
  body,
  cardStyle,
  inputStyle,
  selectStyle,
  labelStyle,
  STATUS_COLOR,
  ANGLE_MODES,
  ANGLE_PRESETS,
} from "./cranePickCalculatorHelpers";

export {
  PICK_TAPE_KEY,
  mono,
  body,
  cardStyle,
  inputStyle,
  selectStyle,
  labelStyle,
  STATUS_COLOR,
  ANGLE_MODES,
  ANGLE_PRESETS,
};


export function PickSummaryModal({ onClose, data }) {
  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(buildSummaryText(data));
      toast.success("Copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  const doPrint = () => {
    window.print();
  };

  return (
    <div
      className="pick-summary-print-root"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Pick Summary"
      style={{
        position: "fixed", inset: 0,
        background: "rgba(7,9,14,0.78)", backdropFilter: "blur(4px)",
        zIndex: 1200, display: "flex", alignItems: "center",
        justifyContent: "center", padding: 16,
      }}
    >
      <div
        className="pick-summary-print-area"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(720px, 100%)", maxHeight: "90vh",
          background: "var(--bg-surface)", color: "var(--text-primary)",
          border: "1px solid var(--border-strong)",
          borderRadius: 10, overflow: "hidden", display: "flex",
          flexDirection: "column", boxShadow: "var(--shadow-lg)",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 20px", borderBottom: "1px solid var(--divider)",
          background: "var(--bg-surface-low)",
        }}>
          <div>
            <div style={{ fontFamily: "Space Grotesk, var(--font-display)", fontSize: 16, fontWeight: 800, letterSpacing: "0.04em" }}>
              Pick Summary
            </div>
            <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.10em", marginTop: 2 }}>
              {new Date().toLocaleString()}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{
            background: "transparent", border: "none", color: "var(--text-muted)",
            fontSize: 20, lineHeight: 1, cursor: "pointer", padding: 4,
          }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {/* Disclaimer at top — follows copy-paste */}
          <div style={{
            ...body, fontSize: 12,
            color: "var(--text-primary)",
            background: "rgba(34,211,238,0.08)",
            border: "1px solid rgba(34,211,238,0.35)",
            padding: "8px 12px", borderRadius: 4, marginBottom: 14,
          }}>
            <strong style={{ ...mono, fontSize: 9, letterSpacing: "0.12em", color: "var(--status-info)" }}>PLANNING TOOL ONLY —</strong>
            {" "}Does not replace an engineered lift plan. Verify all values against the crane load chart and rigging capacity ratings.
          </div>

          <SummarySection title="Load">
            <SummaryRow k="Piece Weight"       v={lbOrDash(data.pieceWeight)} />
            <SummaryRow k="Rigging Weight"     v={lbOrDash(data.riggingWeight)} />
            <SummaryRow k="Total Load on Hook" v={`${lbOrDash(data.totalLoad)} (${tonsOrDash(data.totalLoad)})`} bold />
          </SummarySection>

          <SummarySection title="Rigging Configuration">
            <SummaryRow k="Number of Legs" v={String(data.numLegs)} />
            <SummaryRow k="Sling Angle"    v={data.numLegs === 1 ? "Single vertical pick" : `${data.angleDegrees.toFixed(1)}°`} />
            <SummaryRow k="Load Angle Factor (LAF)" v={Number.isFinite(data.laf) ? data.laf.toFixed(3) : "—"} />
            <SummaryRow k={data.numLegs === 1 ? "Tension (single leg)" : "Tension per Leg"} v={`${lbOrDash(data.tensionPerLeg)} (${tonsOrDash(data.tensionPerLeg)})`} bold />
          </SummarySection>

          <SummarySection title="Capacity">
            <SummaryRow k="Rated Crane Capacity" v={lbOrDash(data.craneCapacity)} />
            <SummaryRow
              k="Utilization"
              v={`${data.utilization.toFixed(1)}% (${(STATUS_LABEL[data.capacityStatus] || "—")})`}
              bold
            />
          </SummarySection>

          {(data.craneModel || data.boomLength || data.workingRadius || data.counterweight) && (
            <SummarySection title="Reference">
              {data.craneModel     && <SummaryRow k="Make / Model"     v={data.craneModel} />}
              {data.boomLength     && <SummaryRow k="Boom Length"      v={`${data.boomLength} ft`} />}
              {data.workingRadius  && <SummaryRow k="Working Radius"   v={`${data.workingRadius} ft`} />}
              {data.counterweight  && <SummaryRow k="Counterweight"    v={data.counterweight} />}
            </SummarySection>
          )}

          {data.warnings.length > 0 && (
            <SummarySection title="Warnings">
              {data.warnings.map((w, i) => (
                <div key={i} style={{
                  ...body, fontSize: 12,
                  color: STATUS_COLOR[w.severity] || "var(--text-primary)",
                  marginBottom: 6,
                  paddingLeft: 10,
                  borderLeft: `3px solid ${STATUS_COLOR[w.severity]}`,
                }}>
                  {w.message}
                </div>
              ))}
            </SummarySection>
          )}
        </div>

        {/* Footer actions */}
        <div style={{
          display: "flex", gap: 8, padding: "12px 20px",
          borderTop: "1px solid var(--divider)", background: "var(--bg-surface-low)",
          justifyContent: "flex-end",
        }}>
          <button onClick={onClose}    style={keycapButtonStyle("ghost", { compact: true })}>Close</button>
          <button onClick={copySummary} style={keycapButtonStyle("ghost", { compact: true })}>Copy</button>
          <button onClick={doPrint}     style={keycapButtonStyle("accent", { compact: true })}>Print</button>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────
export function SectionHeader({ n, label }) {
  return (
    <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--divider)", background: "var(--bg-surface-low)", display: "flex", alignItems: "center", gap: 10 }}>
      {/* Keycap-style step badge — ties the section card to the device kit. */}
      <span style={{
        ...mono, fontSize: 9, fontWeight: 800, color: "var(--accent)",
        letterSpacing: "0.10em",
        minWidth: 22, height: 22, display: "inline-flex",
        alignItems: "center", justifyContent: "center",
        borderRadius: 6, border: "1px solid var(--accent)",
        background: "color-mix(in srgb, var(--accent) 12%, transparent)",
        boxShadow: "0 1px 0 var(--border-strong), inset 0 1px 0 rgba(255,255,255,0.04)",
      }}>{String(n).padStart(2, "0")}</span>
      <span style={{
        ...mono, fontSize: 9, fontWeight: 700, color: "var(--text-muted)",
        letterSpacing: "0.14em", textTransform: "uppercase",
      }}>{label}</span>
    </div>
  );
}

export function ResultRow({ label, primary, secondary }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6, gap: 10 }}>
      <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>{label}</span>
      <span style={{ textAlign: "right" }}>
        <span style={{ ...mono, fontSize: 14, fontWeight: 800, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
          {primary}
        </span>
        {secondary && (
          <span style={{ ...mono, fontSize: 10, color: "var(--text-muted)", marginLeft: 6 }}>{secondary}</span>
        )}
      </span>
    </div>
  );
}

export function StatusPill({ status }) {
  const c = STATUS_COLOR[status] || "var(--text-muted)";
  return (
    <span style={{
      ...mono, fontSize: 8, fontWeight: 800, letterSpacing: "0.14em",
      padding: "2px 6px", borderRadius: 3,
      color: c, border: `1px solid ${c}`,
      background: `color-mix(in srgb, ${c} 14%, transparent)`,
      textTransform: "uppercase",
    }}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

export function WarningRow({ severity, message }) {
  const c = STATUS_COLOR[severity] || "var(--text-primary)";
  return (
    <div style={{
      ...body, fontSize: 11, lineHeight: 1.45,
      color: "var(--text-primary)",
      background: `color-mix(in srgb, ${c} 10%, transparent)`,
      border: `1px solid ${c}`,
      borderLeft: `4px solid ${c}`,
      padding: "8px 10px",
      borderRadius: 4,
    }}>
      <span style={{ ...mono, fontSize: 8, fontWeight: 800, letterSpacing: "0.14em", color: c, marginRight: 6 }}>
        {STATUS_LABEL[severity]}
      </span>
      {message}
    </div>
  );
}

export function SummarySection({ title, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ ...mono, fontSize: 9, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 6 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

export function SummaryRow({ k, v, bold }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 3 }}>
      <span style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>{k}</span>
      <span style={{
        ...mono, fontSize: bold ? 12 : 11, fontWeight: bold ? 800 : 500,
        color: "var(--text-primary)", fontVariantNumeric: "tabular-nums",
      }}>
        {v}
      </span>
    </div>
  );
}

