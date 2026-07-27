import React, { useState, useEffect } from "react";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { getRevisionSuggestions } from "@/lib/drawingUploadUtils";
// ── Step B: Revision Metadata ──────────────────────────────────────
export default function StepRevMeta({ selectedSet, revMeta, setRevMeta, onBack, onNext }) {
  const suggestions = getRevisionSuggestions(selectedSet.revision);
  const set = (k, v) => setRevMeta(p => ({ ...p, [k]: v }));
  const [autoFilled, setAutoFilled] = useState(false);

  useEffect(() => {
    if (!revMeta.revisionLabel && suggestions.length > 0) {
      set("revisionLabel", suggestions[0]);
      setAutoFilled(true);
    }
  }, [revMeta.revisionLabel, suggestions, set]);

  return (
    <div>
      {/* Current state */}
      <div style={{ padding: "10px 14px", borderRadius: 8, background: "var(--hover-bg)", border: "1px solid var(--divider)", marginBottom: 16 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.12em", marginBottom: 4 }}>UPDATING</div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{selectedSet.set_name}</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-warning)", marginTop: 2, letterSpacing: "0.06em" }}>
          {selectedSet.revision || "—"} → <span style={{ color: revMeta.revisionLabel || "var(--text-muted)" }}>{revMeta.revisionLabel || "new revision"}</span>
        </div>
      </div>

      {/* Revision label */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <label style={{ margin: 0 }}>New Revision Label *</label>
          {autoFilled && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-info)", background: "var(--info-muted)", border: "1px solid var(--info-border)", borderRadius: 4, padding: "1px 5px", letterSpacing: "0.08em", fontWeight: 700 }}>
              AUTO
            </span>
          )}
        </div>
        <input value={revMeta.revisionLabel} onChange={e => { set("revisionLabel", e.target.value); setAutoFilled(false); }} placeholder="e.g. IFC Rev 1" style={{ width: "100%", marginBottom: 8 }} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {suggestions.map(s => (
            <button key={s} onClick={() => { set("revisionLabel", s); setAutoFilled(false); }} style={{
              padding: "4px 10px", borderRadius: 6, cursor: "pointer",
              background: revMeta.revisionLabel === s ? "var(--warning-muted)" : "var(--hover-bg)",
              border: `1px solid ${revMeta.revisionLabel === s ? "rgba(245,158,11,0.35)" : "var(--border-default)"}`,
              color: revMeta.revisionLabel === s ? "var(--status-warning)" : "var(--text-muted)",
              fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.06em"
            }}>{s}</button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <label>Issue Date *</label>
          <input type="date" value={revMeta.issueDate} onChange={e => set("issueDate", e.target.value)} style={{ width: "100%" }} />
        </div>
        <div>
          <label>Issued By</label>
          <input value={revMeta.issuedBy} onChange={e => set("issuedBy", e.target.value)} placeholder={selectedSet.issued_by || "Smith Engineering"} style={{ width: "100%" }} />
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label>Notes — What changed?</label>
        <textarea rows={2} value={revMeta.notes} onChange={e => set("notes", e.target.value)} placeholder="e.g. Updated connection details, added embed schedule" style={{ width: "100%", resize: "vertical" }} />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label>Previous Revision Disposition</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {[
            { value: "superseded", label: "Mark as Superseded", desc: "Recommended — old revision clearly replaced" },
            { value: "reference", label: "Keep as Reference Only", desc: "Available but not active" },
          ].map(opt => (
            <div key={opt.value} onClick={() => set("disposition", opt.value)} style={{
              padding: "8px 12px", borderRadius: 8, cursor: "pointer",
              background: revMeta.disposition === opt.value ? "var(--warning-muted)" : "var(--hover-bg)",
              border: `1px solid ${revMeta.disposition === opt.value ? "rgba(245,158,11,0.25)" : "var(--divider)"}`,
              display: "flex", alignItems: "center", gap: 10
            }}>
              <div style={{
                width: 12, height: 12, borderRadius: "50%", flexShrink: 0,
                background: revMeta.disposition === opt.value ? "var(--accent)" : "transparent",
                border: `2px solid ${revMeta.disposition === opt.value ? "var(--accent)" : "var(--text-muted)"}`,
              }} />
              <div>
                <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-primary)", fontWeight: 500 }}>{opt.label}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.06em" }}>{opt.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <button onClick={onBack} style={{ padding: "7px 14px", borderRadius: 8, cursor: "pointer", background: "transparent", border: "1px solid var(--border-default)", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 5 }}>
          <ChevronLeft style={{ width: 13, height: 13 }} /> Back
        </button>
        <button onClick={onNext} disabled={!revMeta.revisionLabel} style={{
          padding: "7px 16px", borderRadius: 8, cursor: revMeta.revisionLabel ? "pointer" : "not-allowed",
          background: revMeta.revisionLabel ? "var(--accent)" : "var(--hover-bg)",
          border: "none", color: revMeta.revisionLabel ? "#fff" : "var(--text-muted)",
          fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
          display: "flex", alignItems: "center", gap: 6
        }}>
          Upload PDF <ChevronRight style={{ width: 13, height: 13 }} />
        </button>
      </div>
    </div>
  );
}
