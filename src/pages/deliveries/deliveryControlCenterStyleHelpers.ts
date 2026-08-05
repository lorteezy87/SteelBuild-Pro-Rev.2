/**
 * Pure view-toggle chrome styles for DeliveryControlCenter.
 */
import type { CSSProperties } from "react";

export const viewToggleWrapStyle: CSSProperties = {
  display: "flex",
  gap: 0,
  border: "1px solid var(--cmd-border)",
  borderRadius: 6,
  overflow: "hidden",
  background: "var(--cmd-surface)",
  marginBottom: 12,
  width: "fit-content",
};

export const viewToggleBtnBase: CSSProperties = {
  padding: "6px 16px",
  fontSize: 13,
  fontWeight: 500,
  color: "var(--cmd-text)",
  background: "transparent",
  border: "none",
  borderRight: "1px solid var(--cmd-border)",
  cursor: "pointer",
  transition: "background 0.12s",
  whiteSpace: "nowrap",
};

export const viewToggleBtnLast: CSSProperties = {
  ...viewToggleBtnBase,
  borderRight: "none",
};

export const viewToggleActiveStyle: CSSProperties = {
  background: "var(--cmd-text)",
  color: "var(--cmd-surface)",
};
