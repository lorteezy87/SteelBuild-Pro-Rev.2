/**
 * MultiSelectChips.jsx — small picker for an array of ids drawn from a list
 * of options.  Intended for relating one record to many existing records
 * (e.g. linking a Daily Log to several Action Items / RFIs).
 *
 * Props
 *   label     — label above the control
 *   value     — string[]   currently selected ids
 *   options   — array of { id, label, sublabel? }
 *   onChange  — (nextArray) => void
 *   placeholder — placeholder for the picker
 */

import React, { useMemo, useState } from "react";

const labelStyle = {
  fontFamily: "var(--font-mono)",
  fontSize: "9px",
  color: "var(--text-muted)",
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  display: "block",
  marginBottom: "4px",
};

export default function MultiSelectChips({
  label,
  value = [],
  options = [],
  onChange,
  placeholder = "Add...",
}) {
  const [open, setOpen] = useState(false);
  const selectedIds = useMemo(
    () => new Set(Array.isArray(value) ? value : []),
    [value]
  );

  const selectedOpts = useMemo(
    () => options.filter((o) => selectedIds.has(o.id)),
    [options, selectedIds]
  );

  const availableOpts = useMemo(
    () => options.filter((o) => !selectedIds.has(o.id)),
    [options, selectedIds]
  );

  const add = (id) => {
    if (!id || selectedIds.has(id)) return;
    onChange?.([...(Array.isArray(value) ? value : []), id]);
    setOpen(false);
  };

  const remove = (id) => {
    onChange?.((Array.isArray(value) ? value : []).filter((v) => v !== id));
  };

  return (
    <div>
      {label ? <label style={labelStyle}>{label}</label> : null}

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          alignItems: "center",
          padding: "6px 8px",
          minHeight: 36,
          background: "var(--bg-input)",
          border: "1px solid var(--border-default)",
          borderRadius: 8,
        }}
      >
        {selectedOpts.map((o) => (
          <span
            key={o.id}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 8px",
              borderRadius: 999,
              background: "var(--accent-muted)",
              color: "var(--accent)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.04em",
              maxWidth: 220,
            }}
            title={o.sublabel ? `${o.label} — ${o.sublabel}` : o.label}
          >
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {o.label}
            </span>
            <button
              type="button"
              onClick={() => remove(o.id)}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--accent)",
                cursor: "pointer",
                fontSize: 12,
                lineHeight: 1,
                padding: 0,
              }}
              aria-label={`Remove ${o.label}`}
            >
              {"×"}
            </button>
          </span>
        ))}

        {availableOpts.length > 0 ? (
          <select
            value=""
            onChange={(e) => add(e.target.value)}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            style={{
              flex: "1 1 120px",
              minWidth: 120,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--text-secondary)",
              fontFamily: "var(--font-body)",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            <option value="">{open ? "Select..." : placeholder}</option>
            {availableOpts.map((o) => (
              <option key={o.id} value={o.id}>
                {o.sublabel ? `${o.label} — ${o.sublabel}` : o.label}
              </option>
            ))}
          </select>
        ) : selectedOpts.length === 0 ? (
          <span
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 11,
              color: "var(--text-muted)",
              fontStyle: "italic",
            }}
          >
            None available
          </span>
        ) : null}
      </div>
    </div>
  );
}
