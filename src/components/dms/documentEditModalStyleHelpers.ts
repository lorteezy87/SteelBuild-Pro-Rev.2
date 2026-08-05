/**
 * Pure form chrome styles for DocumentEditModal.
 */

export const INPUT_STYLE: Record<string, string | number> = {
  width: "100%",
  background: "var(--bg-input)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-input)",
  padding: "8px 10px",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  boxSizing: "border-box",
};

export const LABEL_STYLE: Record<string, string | number> = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.08em",
  color: "var(--text-muted)",
  textTransform: "uppercase",
  marginBottom: 4,
  display: "block",
};

export const DOCUMENT_STATUS_OPTIONS = [
  "Draft",
  "Under Review",
  "Approved",
  "Approved with Comments",
  "Revise & Resubmit",
  "Rejected",
  "Issued",
  "Superseded",
  "Archived",
  "Void",
] as const;

export const DOCUMENT_CATEGORY_OPTIONS = [
  "Blueprint",
  "Shop Drawing",
  "IFC Model",
  "Specification",
  "Submittal",
  "Transmittal",
  "RFI Response",
  "Change Order",
  "Contract",
  "Photo",
  "Report",
  "Correspondence",
  "Permit",
  "Inspection Report",
  "Other",
] as const;

export const DOCUMENT_DISCIPLINE_OPTIONS = [
  "Structural",
  "Architectural",
  "MEP",
  "Civil",
  "Misc Metals",
  "Geotechnical",
  "General",
  "Other",
] as const;

