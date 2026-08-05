/** Pure version stack + linked entity chips for DocumentDetailPanel. */

export type DocLike = {
  documentNumber?: string | null;
  document_number?: string | null;
  revisionNumber?: string | number | null;
  revision_number?: string | number | null;
  uploadedDate?: string | null;
  created_at?: string | null;
  [key: string]: unknown;
};

export type EntityLabelMeta = {
  label: string;
  color: string;
  bg: string;
  border: string;
};

export function buildDocumentVersionStack(
  docNum: string | null | undefined,
  allDocuments: DocLike[] | null | undefined,
): DocLike[] {
  if (!docNum || !(allDocuments || []).length) return [];
  return (allDocuments || [])
    .filter((d) => (d.documentNumber || d.document_number) === docNum)
    .sort((a, b) => {
      const revA = parseInt(String(a.revisionNumber || a.revision_number || "0"), 10) || 0;
      const revB = parseInt(String(b.revisionNumber || b.revision_number || "0"), 10) || 0;
      if (revB !== revA) return revB - revA;
      return (
        Number(new Date(b.uploadedDate || b.created_at || 0)) -
        Number(new Date(a.uploadedDate || a.created_at || 0))
      );
    });
}

export function buildLinkedDocumentEntities(
  doc: Record<string, unknown> | null | undefined,
  entityLabels: Record<string, EntityLabelMeta>,
) {
  if (!doc) return [];
  return Object.entries(entityLabels)
    .filter(([key]) => doc[key])
    .map(([key, meta]) => ({ key, value: doc[key], ...meta }));
}

export function fileSizeMbFromKb(fileSizeKb: number | null | undefined): string {
  return fileSizeKb ? (fileSizeKb / 1024).toFixed(1) : "0.0";
}

export const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  Draft: { bg: "var(--bg-surface-high)", color: "var(--text-muted)" },
  "Under Review": { bg: "var(--warning-muted)", color: "var(--status-warning)" },
  Approved: { bg: "var(--success-muted)", color: "var(--status-success)" },
  "Approved with Comments": {
    bg: "color-mix(in srgb, var(--status-success) 10%, transparent)",
    color: "var(--status-success)",
  },
  "Revise & Resubmit": { bg: "var(--warning-muted)", color: "var(--status-warning)" },
  Rejected: { bg: "var(--danger-muted)", color: "var(--status-error)" },
  Superseded: { bg: "var(--bg-surface-high)", color: "var(--text-muted)" },
  Issued: { bg: "var(--info-muted)", color: "var(--status-info)" },
  Archived: { bg: "var(--bg-surface-high)", color: "var(--text-muted)" },
  Void: {
    bg: "color-mix(in srgb, var(--status-error) 10%, transparent)",
    color: "var(--status-error)",
  },
};

export const ENTITY_LABELS: Record<
  string,
  { label: string; color: string; bg: string; border: string }
> = {
  work_package_id: {
    label: "Work Package",
    color: "var(--accent)",
    bg: "var(--accent-muted)",
    border: "var(--accent-border)",
  },
  rfi_id: {
    label: "RFI",
    color: "var(--status-warning)",
    bg: "var(--warning-muted)",
    border: "var(--warning-border)",
  },
  delivery_id: {
    label: "Delivery",
    color: "var(--status-info)",
    bg: "var(--info-muted)",
    border: "var(--info-border)",
  },
  change_order_id: {
    label: "Change Order",
    color: "var(--status-error)",
    bg: "var(--danger-muted)",
    border: "var(--danger-border)",
  },
  submittal_id: {
    label: "Submittal",
    color: "var(--status-warning)",
    bg: "var(--warning-muted)",
    border: "var(--warning-border)",
  },
};
