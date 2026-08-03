import React from "react";
// ── Processing screen ──────────────────────────────────────────────
export default function StepProcessing(props: any) {
  const { message, progress } = props;
  return (
    <div style={{ padding: "40px 0", textAlign: "center" }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>✦</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>Applying Revision Update</div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", marginBottom: 24 }}>{message}</div>
      <div style={{ background: "var(--bg-surface-high)", borderRadius: 20, height: 6, overflow: "hidden", maxWidth: 360, margin: "0 auto" }}>
        <div style={{ height: "100%", background: "var(--accent)", borderRadius: 20, width: `${progress}%`, transition: "width 0.4s ease" }} />
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-warning)", marginTop: 6 }}>{progress}%</div>
    </div>
  );
}
