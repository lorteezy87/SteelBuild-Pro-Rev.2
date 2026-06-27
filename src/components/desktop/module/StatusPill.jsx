/**
 * StatusPill — small status chip. tone: open | review | done | danger | neutral.
 */
import React from "react";

const TONES = new Set(["open", "review", "done", "danger"]);

export default function StatusPill({ tone = "neutral", children }) {
  const mod = TONES.has(tone) ? ` desk-status-pill--${tone}` : "";
  return <span className={`desk-status-pill${mod}`}>{children}</span>;
}
