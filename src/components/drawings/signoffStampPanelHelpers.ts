/**
 * Pure query-key + chrome for SignoffStampPanel (icons stay local).
 */
import { mono } from "./drawingsConfig";

export function signoffQueryKey(
  drawingId: string | null | undefined,
  revId: string | null | undefined,
) {
  return ["signoffs", drawingId, revId] as const;
}

export const SIGNOFF_BTN_GHOST: Record<string, string | number> = {
  padding: "8px 14px",
  background: "transparent",
  border: "1px solid var(--border-default)",
  color: "var(--text-muted)",
  borderRadius: 6,
  cursor: "pointer",
  ...mono,
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

export const SIGNOFF_BTN_PRIMARY: Record<string, string | number> = {
  padding: "8px 16px",
  background: "var(--accent)",
  border: "none",
  color: "var(--on-accent)",
  borderRadius: 6,
  cursor: "pointer",
  ...mono,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};
