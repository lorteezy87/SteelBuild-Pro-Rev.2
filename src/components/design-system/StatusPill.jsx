/**
 * StatusPill — compact status chip. 8–9pt monospace uppercase with
 * letter-spacing. Auto-colored from `STATUS_COLOR` unless `color` is
 * explicitly passed.
 *
 * `variant`:
 *   - "soft"  (default) — tinted background + bordered, colored text
 *   - "solid"            — full-color fill, dark text
 *
 * `size`:
 *   - "xs" — 8pt (used inline next to other chips)
 *   - "sm" — 9pt (default)
 */

import React from "react";
import { STATUS_COLOR } from "./tokens";

export default function StatusPill({ label, color, variant = "soft", size = "sm" }) {
  const c = color || STATUS_COLOR[label] || "var(--text-muted)";
  const sizing = size === "xs" ? { fs: 8, py: 2, px: 6 } : { fs: 9, py: 3, px: 8 };
  const bg = variant === "solid" ? c : `color-mix(in srgb, ${c} 14%, transparent)`;
  const fg = variant === "solid" ? "#0B0E11" : c;

  return (
    <span
      role="status"
      aria-label={`Status: ${label}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: `${sizing.py}px ${sizing.px}px`,
        borderRadius: "var(--radius-badge)",
        background: bg,
        border: variant === "solid" ? "none" : `1px solid color-mix(in srgb, ${c} 35%, transparent)`,
        color: fg,
        fontFamily: "var(--font-mono)",
        fontSize: sizing.fs,
        fontWeight: 700,
        letterSpacing: "0.10em",
        textTransform: "uppercase",
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}
