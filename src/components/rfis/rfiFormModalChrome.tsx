// @ts-nocheck — presentational extract; props are runtime form shapes
/**
 * Presentational chrome for RFIFormModal (section labels, preflight, selects).
 */
import React, { useEffect, useRef, useState } from "react";
import {
  labelStyle,
  darkSelectButtonStyle,
  darkSelectMenuStyle,
  darkSelectOptionStyle,
  attachmentRowStyle,
  attachmentActionStyle,
} from "./rfiFormModalStyleHelpers";

export const SectionLabel = ({ children }) => (
  <div style={{ gridColumn: "span 3", borderLeft: "3px solid var(--accent)", paddingLeft: 8, marginTop: 16, marginBottom: 8 }}>
    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", color: "var(--accent)", textTransform: "uppercase", fontWeight: 700 }}>{children}</span>
  </div>
);
export const Field = ({ label, span = 1, children }) => (
  <div style={{ gridColumn: `span ${span}` }}>
    <label style={labelStyle}>{label}</label>
    {children}
  </div>
);

// Deterministic RFI preflight scorecard (always on). Renders the checks
// from buildRfiPreflight() with a score; required failures read as blockers.
export const PreflightScorecard = ({ result }) => {
  if (!result) return null;
  const scoreColor = result.passed
    ? "var(--status-success)"
    : result.score >= 60 ? "var(--status-warning)" : "var(--status-error)";
  return (
    <div style={{ gridColumn: "span 3", border: "1px solid var(--border-default)", borderRadius: 6, padding: 12, background: "var(--bg-surface-low)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 700 }}>
          RFI Preflight
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 800, color: scoreColor }}>
          {result.score}%{result.passed ? " · Ready" : ` · ${result.blockers.length} to fix`}
        </span>
      </div>
      <div style={{ display: "grid", gap: 4 }}>
        {result.checks.map((c) => {
          const tone = c.pass ? "var(--status-success)" : c.required ? "var(--status-error)" : "var(--status-warning)";
          return (
            <div key={c.key} style={{ display: "flex", alignItems: "flex-start", gap: 8 }} title={c.hint || ""}>
              <span style={{ color: tone, fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: "16px", width: 12, flexShrink: 0 }}>
                {c.pass ? "✓" : c.required ? "✕" : "!"}
              </span>
              <span style={{ fontSize: 11, color: c.pass ? "var(--text-secondary)" : "var(--text-primary)", lineHeight: "16px" }}>
                {c.label}{!c.pass && c.required ? " (required)" : ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Non-blocking duplicate-RFI warning (always on). Surfaces likely prior RFIs
// so the author links instead of re-asking (the RFI 007/008 pain).
export const DuplicateWarning = ({ matches }) => {
  if (!matches || matches.length === 0) return null;
  return (
    <div style={{ gridColumn: "span 3", border: "1px solid var(--status-warning)", borderRadius: 6, padding: 12, background: "var(--warning-muted)" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--status-warning)", fontWeight: 700, marginBottom: 8 }}>
        Possible duplicate{matches.length > 1 ? "s" : ""} — review before submitting
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {matches.map((m) => (
          <div key={m.rfi.id} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 800, color: "var(--accent)", flexShrink: 0, minWidth: 64 }}>
              {m.rfi.rfi_number || "RFI"}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {m.rfi.title || "Untitled RFI"}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>
                {m.reasons.join(" · ")}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export function DarkSelect({ value, options, onChange, placeholder = "Select..." }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    const close = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" onClick={() => setOpen((next) => !next)} style={darkSelectButtonStyle}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: selected ? "var(--text-primary)" : "var(--text-muted)" }}>
          {selected?.label || placeholder}
        </span>
        <span style={{ color: "var(--text-muted)", transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.12s" }}>v</span>
      </button>
      {open && (
        <div style={darkSelectMenuStyle}>
          {placeholder && (
            <button type="button" onClick={() => { onChange(""); setOpen(false); }} style={darkSelectOptionStyle(!value)}>
              {placeholder}
            </button>
          )}
          {options.map((option) => (
            <button key={option.value} type="button" onClick={() => { onChange(option.value); setOpen(false); }} style={darkSelectOptionStyle(option.value === value)}>
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function AttachmentRow({ name, meta, onOpen, onRemove }) {
  return (
    <div style={attachmentRowStyle}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 800, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {name}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>
          {meta}
        </div>
      </div>
      {onOpen && (
        <button type="button" onClick={onOpen} style={attachmentActionStyle}>
          Open
        </button>
      )}
      {onRemove && (
        <button type="button" onClick={onRemove} style={{ ...attachmentActionStyle, color: "var(--status-error)", borderColor: "var(--danger-border)" }}>
          Remove
        </button>
      )}
    </div>
  );
}
