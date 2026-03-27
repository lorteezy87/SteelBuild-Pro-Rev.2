import React, { useState, useRef, useEffect } from "react";
import { COST_CODES_GROUPED, COST_CODES, getCostCodeLabel } from "./shared/costCodes";

/**
 * CostCodeSelect
 * A styled grouped dropdown for selecting a cost code.
 * onChange(code, name) — saves both the code number and name.
 */
export default function CostCodeSelect({
  value,
  onChange,
  placeholder,
  required,
  disabled,
  showAll,
  style,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selectedCode = COST_CODES.find(c => c.code === value);
  const displayLabel = selectedCode
    ? `${selectedCode.code} — ${selectedCode.name}`
    : (placeholder || "Select cost code...");

  const handleSelect = (cc) => {
    onChange(cc.code, cc.name);
    setOpen(false);
  };

  const handleSelectAll = () => {
    onChange("ALL", "All Cost Codes");
    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: "relative", ...style }}>
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        style={{
          width: "100%",
          background: "var(--bg-input)",
          border: `1px solid ${open ? "var(--accent-border)" : "rgba(255,255,255,0.08)"}`,
          borderRadius: 8,
          padding: "7px 32px 7px 12px",
          color: selectedCode ? "var(--text-primary)" : "var(--text-muted)",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          cursor: disabled ? "not-allowed" : "pointer",
          outline: "none",
          textAlign: "left",
          display: "flex",
          alignItems: "center",
          gap: 8,
          opacity: disabled ? 0.5 : 1,
          position: "relative",
          transition: "border-color 0.15s",
        }}
      >
        {selectedCode ? (
          <>
            <span style={{ color: "var(--accent)", fontFamily: "var(--font-mono)", fontSize: 10, minWidth: 28 }}>
              [{selectedCode.code}]
            </span>
            <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-primary)", flex: 1 }}>
              {selectedCode.name}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
              {selectedCode.category}
            </span>
          </>
        ) : (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>{displayLabel}</span>
        )}
        {/* Chevron */}
        <svg
          width="10" height="6" viewBox="0 0 10 6" fill="none"
          style={{ position: "absolute", right: 10, top: "50%", transform: `translateY(-50%) ${open ? "rotate(180deg)" : ""}`, transition: "transform 0.15s", flexShrink: 0 }}
        >
          <path d="M0 0l5 6 5-6z" fill="var(--accent)" />
        </svg>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 4px)",
          left: 0,
          right: 0,
          background: "var(--bg-surface-low)",
          border: "1px solid var(--border-default)",
          borderRadius: 10,
          boxShadow: "0 16px 40px rgba(0,0,0,0.75)",
          zIndex: 9999,
          overflow: "hidden",
          maxHeight: 340,
          overflowY: "auto",
        }}>
          {showAll && (
            <div
              onClick={handleSelectAll}
              style={{
                padding: "8px 12px",
                cursor: "pointer",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--text-muted)",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--accent-muted)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              All Cost Codes
            </div>
          )}

          {COST_CODES_GROUPED.map((group, gi) => (
            <div key={group.category}>
              {/* Group header */}
              <div style={{
                padding: "8px 12px 4px",
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                letterSpacing: "0.12em",
                color: "var(--text-muted)",
                textTransform: "uppercase",
                background: "rgba(255,255,255,0.02)",
                borderTop: gi === 0 ? "none" : "1px solid rgba(255,255,255,0.06)",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: group.color, display: "inline-block", flexShrink: 0 }} />
                {group.category}
              </div>

              {/* Codes in group */}
              {group.codes.map(cc => {
                const isSelected = cc.code === value;
                return (
                  <div
                    key={cc.code}
                    onClick={() => handleSelect(cc)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "7px 12px 7px 18px",
                      cursor: "pointer",
                      background: isSelected ? "var(--accent-muted)" : "transparent",
                      borderLeft: isSelected ? "2px solid var(--accent)" : "2px solid transparent",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "var(--bg-hover)"; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                  >
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent)", minWidth: 28 }}>
                      [{cc.code}]
                    </span>
                    <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-primary)", flex: 1 }}>
                      {cc.name}
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textAlign: "right" }}>
                      {cc.category}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}