/** Build default RFI body when escalating from detailing control. */
export function buildContextBody(item: any, fmtDate: (d: string) => string): string {
  return [
    `Escalated from Detailing Control — ${item.kind || "Drawing Set"}: ${item.title}`,
    `Current status: ${item.status || "—"}`,
    `Ball in court: ${item.owner || "Unassigned"}`,
    item.dueDate ? `Required date: ${fmtDate(item.dueDate)}` : null,
    item.group ? `Package: ${item.group}` : null,
    "",
    "Issue / question:",
    "",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export const RFI_PRIORITIES = ["Critical", "High", "Medium", "Low"] as const;
export const PCO_REASONS = [
  "Design Change",
  "Owner Request",
  "Differing Conditions",
  "Scope Gap",
  "Error & Omission",
  "Other",
] as const;

