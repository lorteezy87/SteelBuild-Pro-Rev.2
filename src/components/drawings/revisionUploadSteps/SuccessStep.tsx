import React from "react";
import { Check } from "lucide-react";
// ── Success screen ─────────────────────────────────────────────────
export default function StepSuccess(props: any) {
  const { selectedSet, revMeta, stats, onClose } = props;
  return (
    <div style={{ textAlign: "center", padding: "30px 0" }}>
      <div style={{ width: 52, height: 52, borderRadius: "50%", background: "rgba(0,214,143,0.12)", border: "2px solid rgba(0,214,143,0.3)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
        <Check style={{ width: 22, height: 22, color: "var(--status-success-bright)" }} />
      </div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--text-primary)", marginBottom: 16 }}>Revision Applied</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-start", maxWidth: 340, margin: "0 auto 24px", background: "var(--hover-bg)", border: "1px solid var(--divider)", borderRadius: 10, padding: "14px 16px" }}>
        {[
          `✓ "${selectedSet.set_name}" updated ${selectedSet.revision || "—"} → ${revMeta.revisionLabel}`,
          `✓ ${stats.updated} drawing records updated`,
          stats.added > 0 && `✓ ${stats.added} new sheet${stats.added > 1 ? "s" : ""} created`,
          stats.removed > 0 && `✓ ${stats.removed} sheet${stats.removed > 1 ? "s" : ""} marked superseded`,
          `✓ Previous revision archived in history`,
        ].filter(Boolean).map((line, i) => (
          <div key={i} style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", textAlign: "left" }}>{line}</div>
        ))}
      </div>
      <button onClick={onClose} style={{
        padding: "9px 22px", borderRadius: 8, cursor: "pointer",
        background: "var(--accent)", border: "none", color: "var(--on-accent)",
        fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em"
      }}>View Drawing Log</button>
    </div>
  );
}
