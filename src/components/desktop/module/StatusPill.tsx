/**
 * StatusPill — small status chip. tone: open | review | done | danger | neutral.
 */
import React from "react";

interface Props {
  tone?: string;
  children?: React.ReactNode;
}

const TONES = new Set([
  "open", "review", "done", "danger",
  "overdue", "atrisk", "inreview", "approved", "needsaction", "fabready", "fieldready", "blocked",
]);

export default function StatusPill({ tone = "neutral", children }: Props) {
  const mod = TONES.has(tone) ? ` desk-status-pill--${tone}` : "";
  return <span className={`desk-status-pill${mod}`}>{children}</span>;
}
