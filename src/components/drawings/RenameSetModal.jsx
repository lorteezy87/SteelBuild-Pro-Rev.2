import React, { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { mono, surface } from "./drawingsConfig";

/**
 * Small focused modal for renaming a drawing set.
 *
 * Plain fixed overlay — no Radix Dialog, no <form> tag. Submits on Enter
 * via button onClick; validates the new name is non-empty and different
 * from the current name before calling onSave.
 */
export default function RenameSetModal({ open, initialName = "", onClose, onSave, saving = false }) {
  const ref = useRef(null);
  const [name, setName] = useState(initialName);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setErr(null);
      setTimeout(() => ref.current?.focus(), 0);
    }
  }, [open, initialName]);

  if (!open) return null;

  const submit = () => {
    const trimmed = (name || "").trim();
    if (!trimmed) { setErr("Set name is required."); return; }
    if (trimmed === (initialName || "").trim()) { onClose(); return; }
    setErr(null);
    onSave(trimmed);
  };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 1200 }} />
      <div
        className="sbd-card-strong"
        tabIndex={-1}
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
        style={{
          ...surface,
          position: "fixed", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          width: 440, maxWidth: "95vw",
          zIndex: 1201, outline: "none",
          display: "flex", flexDirection: "column",
          padding: 0,
        }}
      >
        <div style={{
          padding: "12px 18px", borderBottom: "1px solid var(--divider)",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <div style={{ flex: 1, ...mono, fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--accent)" }}>
            RENAME DRAWING SET
          </div>
          <button onClick={onClose} aria-label="Close" style={btnIcon}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: "16px 18px" }}>
          <label style={{ ...mono, fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.15em", textTransform: "uppercase", display: "block", marginBottom: 5 }}>
            Set Name
          </label>
          <input
            ref={ref}
            className="sbd-input"
            style={{
              width: "100%", padding: "8px 10px",
              background: "var(--bg-page)", border: "1px solid var(--border-default)", borderRadius: 2,
              color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 13,
              boxSizing: "border-box",
            }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); submit(); }
            }}
            placeholder="e.g. 100% CD Set — Foundations"
            disabled={saving}
          />
          <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 6, letterSpacing: "0.08em" }}>
            All child sheets in this set will be updated to use the new name.
          </div>

          {err && (
            <div style={{
              marginTop: 10, padding: "6px 10px",
              border: "1px solid var(--status-error)",
              background: "color-mix(in srgb, var(--status-error) 10%, transparent)",
              color: "var(--status-error)", ...mono, fontSize: 11,
            }}>
              {err}
            </div>
          )}
        </div>

        <div style={{
          padding: "10px 18px", borderTop: "1px solid var(--divider)",
          display: "flex", gap: 8, justifyContent: "flex-end",
        }}>
          <button onClick={onClose} disabled={saving} style={btnGhost}>CANCEL</button>
          <button
            onClick={submit}
            disabled={saving}
            style={{ ...btnPrimary, opacity: saving ? 0.6 : 1, cursor: saving ? "not-allowed" : "pointer" }}
          >
            {saving ? "SAVING…" : "RENAME"}
          </button>
        </div>
      </div>
    </>
  );
}

const btnPrimary = {
  padding: "7px 18px", background: "var(--accent)", color: "#000",
  border: "none", borderRadius: 2,
  fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
  letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer",
};
const btnGhost = {
  padding: "7px 16px", background: "transparent",
  border: "1px solid var(--border-default)", borderRadius: 2,
  color: "var(--text-muted)",
  fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
  letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer",
};
const btnIcon = {
  background: "transparent", border: "none",
  color: "var(--text-muted)", cursor: "pointer", padding: 4,
  display: "flex", alignItems: "center",
};
