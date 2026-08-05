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

export const SCHEDULE_CHIPS = [
  { id: "all", label: "All Loads" },
  { id: "late", label: "Late" },
  { id: "today", label: "Today" },
  { id: "week", label: "7 Days" },
  { id: "ready", label: "Ready" },
  { id: "unscheduled", label: "No Date" },
  { id: "longLead", label: "Long Lead" },
] as const;

export const RISK_CHIPS = [
  { id: "all", label: "All Risk" },
  { id: "high", label: "Exceptions" },
  { id: "medium", label: "Warnings" },
  { id: "clear", label: "Clear" },
] as const;

export const VIEW_OPTIONS = [
  { id: "register", label: "Register" },
  { id: "dispatch", label: "Dispatch" },
  { id: "schedule", label: "Schedule" },
] as const;
