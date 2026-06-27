/**
 * TransmittalModal — generates a PDF transmittal for the currently
 * selected documents. Collects transmittal # / issued-to / issued-by
 * / purpose / notes, shows the document list being included, and
 * triggers `generateTransmittal` on confirm.
 *
 * Uses the custom fixed-overlay pattern (no Radix Dialog).
 */

import React from "react";
import { generateTransmittal } from "@/lib/generateTransmittal";

const PURPOSES = ["For Review", "For Approval", "For Construction", "For Record", "For Information", "Resubmitted"];

export default function TransmittalModal({
  open,
  project,
  selectedDocs,
  form,
  onFormChange,
  onClose,
  onGenerated,
}) {
  if (!open) return null;

  const handleGenerate = () => {
    generateTransmittal({
      project: project || {},
      docs: selectedDocs,
      issuedTo: form.issuedTo,
      issuedBy: form.issuedBy,
      purpose: form.purpose,
      notes: form.notes,
      transmittalNumber: form.number,
    });
    onGenerated();
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.70)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3000 }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-surface-low)",
          border: "1px solid var(--bg-surface-high)",
          borderTop: "3px solid #10B981",
          borderRadius: 12,
          width: 520,
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 24px 60px rgba(0,0,0,0.75)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--bg-surface-high)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--status-success)", letterSpacing: "0.06em" }}>
              GENERATE TRANSMITTAL
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>
              {selectedDocs.length} document{selectedDocs.length !== 1 ? "s" : ""} selected
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 20, cursor: "pointer" }}>
            {"\u00D7"}
          </button>
        </div>

        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
          {[
            { key: "number",   label: "Transmittal #", placeholder: "e.g. T-001" },
            { key: "issuedTo", label: "Issued To",     placeholder: "Company / Contact name" },
            { key: "issuedBy", label: "Issued By",     placeholder: "Your name" },
          ].map(({ key, label, placeholder }) => (
            <div key={key}>
              <Label>{label}</Label>
              <input
                type="text"
                placeholder={placeholder}
                value={form[key]}
                onChange={(e) => onFormChange(key, e.target.value)}
                style={inputStyle}
              />
            </div>
          ))}
          <div>
            <Label>Purpose</Label>
            <select
              value={form.purpose}
              onChange={(e) => onFormChange("purpose", e.target.value)}
              style={{ ...inputStyle, boxSizing: "border-box" }}
            >
              {PURPOSES.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <textarea
              rows={3}
              placeholder="Any remarks or special instructions..."
              value={form.notes}
              onChange={(e) => onFormChange("notes", e.target.value)}
              style={{ ...inputStyle, resize: "vertical", boxSizing: "border-box" }}
            />
          </div>

          <div style={{ background: "var(--hover-bg)", border: "1px solid var(--bg-surface-high)", borderRadius: 6, padding: "10px 12px" }}>
            <Label>Documents Included</Label>
            {selectedDocs.map((d) => (
              <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: "1px solid var(--divider)" }}>
                <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-primary)" }}>
                  {d.displayName || d.fileName}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>
                  R{d.revisionNumber || "0"}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: "12px 20px", borderTop: "1px solid var(--bg-surface-high)", display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{ padding: "8px 16px", background: "transparent", border: "1px solid var(--border-default)", color: "var(--text-muted)", borderRadius: 6, fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, cursor: "pointer" }}
          >
            CANCEL
          </button>
          <button
            onClick={handleGenerate}
            style={{ padding: "8px 20px", background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.40)", color: "var(--status-success)", borderRadius: 6, fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, cursor: "pointer", letterSpacing: "0.06em" }}
          >
            {"\u2193"} GENERATE PDF
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "8px 10px",
  background: "var(--hover-bg)",
  border: "1px solid var(--border-default)",
  color: "var(--text-primary)",
  borderRadius: 6,
  fontFamily: "var(--font-body)",
  fontSize: 12,
};

function Label({ children }) {
  return (
    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 4 }}>
      {children}
    </div>
  );
}
