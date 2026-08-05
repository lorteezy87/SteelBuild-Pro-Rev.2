/**
 * StatusPill — small status chip. tone: open | review | done | danger | neutral.
 */
import React from "react";
import { STATUS_PILL_TONES as TONES } from "./statusPillHelpers";

interface Props {
  tone?: string;
  children?: React.ReactNode;
}

export default function StatusPill({ tone = "neutral", children }: Props) {
  const mod = TONES.has(tone) ? ` desk-status-pill--${tone}` : "";
  return <span className={`desk-status-pill${mod}`}>{children}</span>;
}
