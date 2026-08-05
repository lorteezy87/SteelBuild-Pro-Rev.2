export function btnStyle(
  bg?: string,
  border?: string,
  color?: string,
): Record<string, string | number> {
  return {
    flex: 1,
    padding: "5px 4px",
    background: bg || "transparent",
    border: "1px solid " + (border || "var(--border-default)"),
    color: color || "var(--text-secondary)",
    borderRadius: 4,
    fontFamily: "var(--font-mono)",
    fontSize: 9,
    fontWeight: 700,
    cursor: "pointer",
    letterSpacing: "0.04em",
  };
}

export type ToneStyle = { bg: string; color: string; border?: string };

export const FILE_TYPE_CONFIG: Record<string, ToneStyle & { icon: string }> = {
  pdf: { icon: "PDF", bg: "var(--danger-muted)", color: "var(--status-error)", border: "var(--danger-border)" },
  dwg: { icon: "DWG", bg: "var(--info-muted)", color: "var(--status-info)", border: "var(--info-border)" },
  ifc: { icon: "IFC", bg: "var(--accent-muted)", color: "var(--accent)", border: "var(--accent-border)" },
  gltf: { icon: "3D", bg: "var(--accent-muted)", color: "var(--accent)", border: "var(--accent-border)" },
  xlsx: { icon: "XLS", bg: "var(--success-muted)", color: "var(--status-success)", border: "var(--success-border)" },
  docx: { icon: "DOC", bg: "var(--info-muted)", color: "var(--status-info)", border: "var(--info-border)" },
  img: { icon: "IMG", bg: "var(--accent-muted)", color: "var(--accent)", border: "var(--accent-border)" },
  zip: { icon: "ZIP", bg: "var(--warning-muted)", color: "var(--status-warning)", border: "var(--warning-border)" },
  other: { icon: "FILE", bg: "var(--bg-surface-high)", color: "var(--text-muted)", border: "var(--border-default)" },
};

export const DOCUMENT_STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  Approved: { bg: "var(--success-muted)", color: "var(--status-success)" },
  "Approved as Noted": {
    bg: "color-mix(in srgb, var(--status-success) 10%, transparent)",
    color: "var(--status-success)",
  },
  "Approved with Comments": {
    bg: "color-mix(in srgb, var(--status-success) 10%, transparent)",
    color: "var(--status-success)",
  },
  "Under Review": { bg: "var(--warning-muted)", color: "var(--status-warning)" },
  "Revise & Resubmit": { bg: "var(--warning-muted)", color: "var(--status-warning)" },
  Rejected: { bg: "var(--danger-muted)", color: "var(--status-error)" },
  Draft: { bg: "var(--bg-surface-high)", color: "var(--text-muted)" },
  Issued: { bg: "var(--info-muted)", color: "var(--status-info)" },
  Superseded: { bg: "var(--bg-surface-high)", color: "var(--text-muted)" },
  Archived: { bg: "var(--bg-surface-high)", color: "var(--text-muted)" },
  Void: {
    bg: "color-mix(in srgb, var(--status-error) 10%, transparent)",
    color: "var(--status-error)",
  },
};

export const DOCUMENT_CATEGORY_COLORS: Record<string, ToneStyle> = {
  Blueprint: { bg: "var(--info-muted)", color: "var(--status-info)", border: "var(--info-border)" },
  "Shop Drawing": { bg: "var(--info-muted)", color: "var(--status-info)", border: "var(--info-border)" },
  "IFC Model": { bg: "var(--accent-muted)", color: "var(--accent)", border: "var(--accent-border)" },
  Specification: { bg: "var(--warning-muted)", color: "var(--status-warning)", border: "var(--warning-border)" },
  Submittal: { bg: "var(--accent-muted)", color: "var(--accent)", border: "var(--accent-border)" },
  Transmittal: { bg: "var(--success-muted)", color: "var(--status-success)", border: "var(--success-border)" },
  "RFI Response": { bg: "var(--warning-muted)", color: "var(--status-warning)", border: "var(--warning-border)" },
  "Change Order": { bg: "var(--danger-muted)", color: "var(--status-error)", border: "var(--danger-border)" },
  Contract: { bg: "var(--accent-muted)", color: "var(--accent)", border: "var(--accent-border)" },
  Photo: { bg: "var(--accent-muted)", color: "var(--accent)", border: "var(--accent-border)" },
  Report: { bg: "var(--bg-surface-high)", color: "var(--text-muted)", border: "var(--border-default)" },
  Correspondence: { bg: "var(--bg-surface-high)", color: "var(--text-muted)", border: "var(--border-default)" },
  Permit: { bg: "var(--success-muted)", color: "var(--status-success)", border: "var(--success-border)" },
  "Inspection Report": { bg: "var(--warning-muted)", color: "var(--status-warning)", border: "var(--warning-border)" },
  Other: { bg: "var(--bg-surface-high)", color: "var(--text-muted)", border: "var(--border-default)" },
};

export const DEFAULT_CATEGORY_STYLE: ToneStyle = {
  bg: "var(--bg-surface-high)",
  color: "var(--text-muted)",
  border: "var(--border-default)",
};

