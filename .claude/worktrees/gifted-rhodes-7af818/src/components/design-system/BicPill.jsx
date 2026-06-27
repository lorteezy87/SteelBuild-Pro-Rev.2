/**
 * BicPill — ball-in-court chip. One of five party types each with a
 * distinct semantic color (Contractor gold / GC blue / Engineer teal /
 * Architect darker teal / Owner green). Mono uppercase like StatusPill
 * but slightly smaller (8pt).
 */

import React from "react";
import { BIC_COLOR } from "./tokens";

export default function BicPill({ bic }) {
  const c = BIC_COLOR[bic] || "var(--text-muted)";
  return (
    <span
      style={{
        padding: "2px 6px",
        borderRadius: 3,
        background: `color-mix(in srgb, ${c} 12%, transparent)`,
        color: c,
        fontFamily: "var(--font-mono)",
        fontSize: 8,
        fontWeight: 700,
        letterSpacing: "0.10em",
        textTransform: "uppercase",
        border: `1px solid color-mix(in srgb, ${c} 30%, transparent)`,
        whiteSpace: "nowrap",
      }}
    >
      {bic}
    </span>
  );
}
