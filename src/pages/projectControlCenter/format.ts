// ─── Type → page routing map ──────────────────────────────────────────────────
export const TYPE_PAGE_MAP: Record<string, string> = {
  RFI:         "RFIs",
  Drawing:     "Documents",
  Submittal:   "DrawingSubmittalHub",
  WorkPackage: "WorkPackages",
  Delivery:    "Deliveries",
  ChangeOrder: "ChangeOrders",
  ScheduleTask: "Schedule",
  ActionItem: "ActionItems",
};

// ─── Type icon map ────────────────────────────────────────────────────────────
export const TYPE_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  RFI:         { icon: "⚑",  label: "RFI",          color: "var(--status-warning)" },
  Drawing:     { icon: "▦",  label: "DRAWING",       color: "var(--status-info)" },
  Submittal:   { icon: "◈",  label: "SUBMITTAL",     color: "var(--status-review)" },
  WorkPackage: { icon: "▤",  label: "WORK PKG",      color: "var(--status-review)" },
  Delivery:    { icon: "📦", label: "DELIVERY",      color: "var(--status-success)" },
  ChangeOrder: { icon: "$",  label: "CHANGE ORDER",  color: "var(--status-review)" },
  ScheduleTask: { icon: "T",  label: "TASK",          color: "var(--accent)" },
  ActionItem:  { icon: "A",  label: "ACTION",        color: "var(--status-info)" },
};
