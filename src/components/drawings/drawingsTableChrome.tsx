/**
 * Presentational primitives for DrawingsTable (badges, action buttons, stage bar).
 */
import React from "react";
import { mono } from "./drawingsConfig";
import { STAGE_MAP, STAGE_ORDER } from "./drawingsConfig";

// ─── AI extraction / upload status badge ───────────────────────────────────
//
// Shown inline next to the sheet title so the user can see at a glance
// whether a child row is mid-processing, needs review, or failed to extract.
// Processed rows render nothing (no chrome) to keep the log clean.
const AI_STATUS_META = {
  Pending:     { label: "QUEUED",    color: "var(--text-muted)",     bg: "var(--bg-surface-high)",                                       border: "var(--border-default)",                                           title: "Queued for AI extraction" },
  Extracting:  { label: "✦ READING", color: "var(--status-warning)", bg: "color-mix(in srgb, var(--status-warning) 12%, transparent)", border: "color-mix(in srgb, var(--status-warning) 35%, transparent)", title: "Claude is reading this sheet" },
  NeedsReview: { label: "REVIEW",    color: "var(--status-review)",  bg: "color-mix(in srgb, var(--status-review) 12%, transparent)",  border: "color-mix(in srgb, var(--status-review) 35%, transparent)",  title: "AI finished but found something to verify" },
  Failed:      { label: "✗ FAILED",  color: "var(--status-error)",   bg: "color-mix(in srgb, var(--status-error) 12%, transparent)",   border: "color-mix(in srgb, var(--status-error) 35%, transparent)",   title: "AI extraction failed — click to retry" },
};

export function AIStatusBadge({ status, uploadStatus, error }) {
  // Failed upload always wins — it's more severe than any AI state.
  if (uploadStatus === "Failed") {
    return (
      <span title={error || "File upload failed"} style={{
        ...mono, fontSize: 8, fontWeight: 700, letterSpacing: "0.08em",
        padding: "1px 5px", borderRadius: 4, marginLeft: 6,
        color: "var(--status-error)",
        background: "color-mix(in srgb, var(--status-error) 12%, transparent)",
        border: "1px solid color-mix(in srgb, var(--status-error) 35%, transparent)",
        verticalAlign: "middle",
      }}>
        ↑ UPLOAD FAILED
      </span>
    );
  }
  if (uploadStatus === "Uploading") {
    return (
      <span title="Uploading to storage" style={{
        ...mono, fontSize: 8, fontWeight: 700, letterSpacing: "0.08em",
        padding: "1px 5px", borderRadius: 4, marginLeft: 6,
        color: "var(--status-info)",
        background: "color-mix(in srgb, var(--status-info) 12%, transparent)",
        border: "1px solid color-mix(in srgb, var(--status-info) 35%, transparent)",
        verticalAlign: "middle",
      }}>
        ↑ UPLOADING
      </span>
    );
  }
  const meta = AI_STATUS_META[status];
  if (!meta) return null; // Processed / unknown → render nothing
  return (
    <span title={error || meta.title} style={{
      ...mono, fontSize: 8, fontWeight: 700, letterSpacing: "0.08em",
      padding: "1px 5px", borderRadius: 4, marginLeft: 6,
      color: meta.color, background: meta.bg, border: `1px solid ${meta.border}`,
      verticalAlign: "middle",
    }}>
      {meta.label}
    </span>
  );
}

// ─── Small UI primitives ────────────────────────────────────────────────────

export function ActionBtn({ label, onClick, danger, disabled, title, primary }) {
  const [hovered, setHovered] = React.useState(false);
  const baseColor = primary ? "var(--accent)" : danger ? "var(--status-error)" : "var(--text-muted)";
  const restBorder = primary ? "var(--accent-border)" : danger ? "color-mix(in srgb, var(--status-error) 55%, transparent)" : "var(--border-default)";
  const hoverBorder = primary ? "var(--accent)" : danger ? "var(--status-error)" : "var(--border-strong)";
  // Danger buttons get a visible tinted background at rest (not just on hover)
  // so they can never be mistaken for a neutral "Next"/"Edit"/"View" button
  // sitting next to them. This is the F6 mis-click fix from the audit.
  const baseBg = danger ? "color-mix(in srgb, var(--status-error) 10%, transparent)" : "none";
  const hoverBg = primary ? "var(--accent-muted)" : danger ? "color-mix(in srgb, var(--status-error) 22%, transparent)" : "var(--hover-bg)";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...mono,
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: "0.06em",
        padding: danger ? "4px 10px" : "4px 9px",
        borderRadius: "var(--radius-badge)",
        border: `1px solid ${
          hovered && !disabled ? hoverBorder : restBorder
        }`,
        background: hovered && !disabled ? hoverBg : baseBg,
        color: baseColor,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.3 : 1,
        whiteSpace: "nowrap",
        minHeight: 26,
        transition: "all 0.15s",
      }}
    >
      {label}
    </button>
  );
}

export function ContextMenuItem({ label, onClick, danger }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "block", width: "100%", textAlign: "left", padding: "8px 16px",
        background: hovered ? (danger ? "color-mix(in srgb, var(--status-error) 8%, transparent)" : "var(--hover-bg)") : "none",
        border: "none", cursor: "pointer", ...mono, fontSize: 10,
        fontWeight: 700, letterSpacing: "0.08em",
        color: danger ? "var(--status-error)" : "var(--text-primary)",
        transition: "background 0.1s",
      }}
    >
      {label}
    </button>
  );
}

// ─── Row renderers ──────────────────────────────────────────────────────────

export const tdBase = {
  padding: "10px 12px",
  borderBottom: "1px solid var(--divider)",
  verticalAlign: "middle",
};

export function StageBar({ stageCounts, total }) {
  if (!total) return null;
  return (
    <div
      style={{
        display: "flex",
        height: 4,
        width: 72,
        borderRadius: 2,
        overflow: "hidden",
        background: "var(--bg-surface-high)",
      }}
      title={Object.entries(stageCounts)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${STAGE_MAP[k]?.label || k}: ${n}`)
        .join(" · ")}
    >
      {STAGE_ORDER.map((key) => {
        const n = stageCounts[key] || 0;
        if (n === 0) return null;
        const meta = STAGE_MAP[key];
        return (
          <div
            key={key}
            style={{
              width: `${(n / total) * 100}%`,
              background: meta?.color || "var(--text-muted)",
            }}
          />
        );
      })}
    </div>
  );
}

