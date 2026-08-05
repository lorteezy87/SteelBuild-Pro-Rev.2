/**
 * Pure chrome for CanonicalFabReleasePanel.
 */
import type { CSSProperties } from "react";
import type { CanonicalReleaseGate } from "@/lib/pieceControl/releaseRepository";

export const CHECK_LABELS: Array<{ key: keyof CanonicalReleaseGate["checks"]; label: string }> = [
  { key: "scope", label: "Piece scope" },
  { key: "drawings", label: "Shop drawings" },
  { key: "material", label: "Material received / on hand" },
  { key: "holds", label: "Piece holds" },
];

export const BLOCKER_PRESENTATION_COPY: Record<string, string> = {
  "No active, actionable canonical leaf pieces are assigned to this work package.":
    "No active pieces are assigned to this work package.",
};

export function presentBlocker(blocker: string): string {
  return BLOCKER_PRESENTATION_COPY[blocker] ?? blocker;
}

/** Theme-token styles — follow --cmd-* when on a command surface, else app tokens. */
export const panelStyle: CSSProperties = {
  borderRadius: 16,
  border: "1px solid var(--cmd-border, var(--border-default))",
  background: "var(--cmd-surface, var(--bg-surface))",
  color: "var(--cmd-text, var(--text-primary))",
  padding: 16,
  boxShadow: "var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.2))",
};

export const mutedStyle: CSSProperties = {
  color: "var(--cmd-text-muted, var(--text-muted))",
};

export const warnBoxStyle: CSSProperties = {
  borderRadius: 12,
  border: "1px solid var(--cmd-chip-warn-bg, var(--warning-border))",
  background: "var(--cmd-chip-warn-bg, var(--warning-muted))",
  color: "var(--cmd-warn-text, var(--status-warning))",
  padding: 16,
  fontSize: 14,
};

export const dangerBoxStyle: CSSProperties = {
  borderRadius: 12,
  border: "1px solid var(--cmd-chip-danger-bg, var(--danger-border))",
  background: "var(--cmd-chip-danger-bg, var(--danger-muted))",
  color: "var(--cmd-danger-text, var(--status-error))",
  padding: 12,
  fontSize: 14,
};

export const goodBoxStyle: CSSProperties = {
  borderRadius: 12,
  border: "1px solid var(--cmd-chip-good-bg, var(--success-border))",
  background: "var(--cmd-chip-good-bg, var(--success-muted))",
  color: "var(--cmd-good-text, var(--status-success))",
  padding: 12,
};

export const neutralBoxStyle: CSSProperties = {
  borderRadius: 12,
  border: "1px solid var(--cmd-border, var(--border-default))",
  background: "var(--cmd-row-hover, var(--bg-surface-low))",
  color: "var(--cmd-text, var(--text-primary))",
  padding: 12,
  fontSize: 14,
  fontWeight: 800,
};

export const iconBtnStyle: CSSProperties = {
  borderRadius: 8,
  border: "1px solid var(--cmd-border, var(--border-default))",
  background: "transparent",
  color: "var(--cmd-text-muted, var(--text-muted))",
  padding: 8,
  cursor: "pointer",
};

export function primaryBtnStyle(variant: "good" | "warn" | "danger"): CSSProperties {
  return {
    marginTop: 16,
    width: "100%",
    borderRadius: 12,
    border: "none",
    padding: "12px 16px",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer",
    background:
      variant === "good"
        ? "var(--cmd-good, var(--status-success))"
        : variant === "warn"
          ? "var(--cmd-warn, var(--status-warning))"
          : "var(--cmd-danger, var(--status-error))",
    color:
      variant === "warn"
        ? "var(--cmd-on-gold, #20160a)"
        : "var(--cmd-pill-on-solid, #fff)",
  };
}

export const inputStyle: CSSProperties = {
  borderRadius: 8,
  border: "1px solid var(--cmd-border, var(--border-default))",
  background: "var(--cmd-surface, var(--bg-surface))",
  color: "var(--cmd-text, var(--text-primary))",
  padding: 12,
  fontSize: 14,
  fontWeight: 500,
  width: "100%",
  boxSizing: "border-box",
  fontFamily: "inherit",
  resize: "vertical" as const,
};
