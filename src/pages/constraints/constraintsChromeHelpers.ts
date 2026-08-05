/**
 * Pure filter/form options + action-button tone maps for Constraints chrome.
 */
import { PRIORITIES } from "./constants";

export const CONSTRAINT_FILTER_STATUS_OPTIONS = [
  "all",
  "open",
  "In Progress",
  "Resolved",
  "Closed",
];

export const CONSTRAINT_FILTER_PRIORITY_OPTIONS = ["all", ...PRIORITIES];

export const CONSTRAINT_FORM_STATUS_OPTIONS = [
  "Open",
  "In Progress",
  "Resolved",
  "Closed",
];

export const CONSTRAINT_ACTION_TONES: Record<
  string,
  { background: string; border: string; color: string }
> = {
  accent: {
    background: "var(--accent-muted)",
    border: "1px solid var(--accent-border)",
    color: "var(--accent)",
  },
  success: {
    background: "var(--success-muted)",
    border: "1px solid var(--success-border)",
    color: "var(--status-success)",
  },
  warning: {
    background: "var(--warning-muted)",
    border: "1px solid var(--warning-border)",
    color: "var(--status-warning)",
  },
  muted: {
    background: "transparent",
    border: "1px solid var(--border-strong)",
    color: "var(--text-muted)",
  },
  neutral: {
    background: "var(--bg-surface-high)",
    border: "1px solid var(--border-default)",
    color: "var(--text-secondary)",
  },
};

export const CONSTRAINT_MINI_TONES: Record<
  string,
  { bg: string; border: string; color: string }
> = {
  accent: {
    bg: "var(--accent-muted)",
    border: "var(--accent-border)",
    color: "var(--accent)",
  },
  success: {
    bg: "var(--success-muted)",
    border: "var(--success-border)",
    color: "var(--status-success)",
  },
  warning: {
    bg: "var(--warning-muted)",
    border: "var(--warning-border)",
    color: "var(--status-warning)",
  },
  muted: {
    bg: "transparent",
    border: "var(--border-default)",
    color: "var(--text-muted)",
  },
};
