/**
 * BicPill — ball-in-court chip. One chip per BALL_IN_COURT_PARTIES member,
 * each with a distinct semantic hue from BIC_COLOR.
 *
 * The map used to hold only five parties, including "Engineer", which no row
 * can store. The four parties rows CAN hold but it lacked — Subcontractor,
 * Detailer, EOR, AOR — fell through to the `var(--text-muted)` default below,
 * so on an RFI row and in the agenda they rendered as neutral grey: readable,
 * and indistinguishable from "nobody in particular". A test asserts the map
 * stays complete against the vocabulary.
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
