/** Pure aging rows for RFI LeftSidebar. */

export const RFI_AGING_ROWS = [
  { label: "< 7 days", key: "fresh", color: "var(--status-success)" },
  { label: "7–14 days", key: "aging", color: "var(--status-warning)" },
  { label: "15–30 days", key: "stale", color: "var(--status-error)" },
  { label: "> 30 days", key: "critical", color: "var(--status-error)" },
] as const;
