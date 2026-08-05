/** Pure checklist catalog for ProjectCloseoutChecklist. */

export const CHECKLIST_ITEMS = [
  { key: "final_inspection_completed", label: "Final Inspection", icon: "✓" },
  { key: "punch_list_cleared", label: "Punchlist Cleared", icon: "☑" },
  { key: "all_invoices_processed", label: "Invoices Processed", icon: "💰" },
  { key: "warranties_registered", label: "Warranties Registered", icon: "📋" },
  { key: "as_built_docs_completed", label: "As-Built Docs", icon: "📐" },
  { key: "permits_closed", label: "Permits Closed", icon: "🔐" },
] as const;
