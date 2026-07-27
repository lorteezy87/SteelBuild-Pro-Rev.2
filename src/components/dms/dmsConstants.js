// Unified DMS constants — single source of truth for statuses, categories, disciplines

export const DOC_STATUSES = [
  "Draft",
  "Under Review",
  "Approved",
  "Approved with Comments",
  "Revise & Resubmit",
  "Rejected",
  "Superseded",
  "Issued",
  "Archived",
  "Void",
];

export const DOC_CATEGORIES = [
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
];

export const DOC_DISCIPLINES = [
  "Structural",
  "Architectural",
  "MEP",
  "Civil",
  "Misc Metals",
  "Geotechnical",
  "General",
  "Other",
];

export const FILE_TYPE_CONFIG = {
  pdf:   { icon: "PDF", bg: "var(--status-error)", text: "var(--text-on-accent)" },
  dwg:   { icon: "DWG", bg: "var(--status-info)", text: "var(--text-on-accent)" },
  dxf:   { icon: "DXF", bg: "var(--accent)", text: "var(--text-on-accent)" },
  ifc:   { icon: "3D",  bg: "var(--status-success)", text: "var(--text-on-accent)" },
  rvt:   { icon: "RVT", bg: "var(--status-warning)", text: "var(--text-primary)" },
  jpg:   { icon: "IMG", bg: "var(--accent)", text: "var(--text-on-accent)" },
  jpeg:  { icon: "IMG", bg: "var(--accent)", text: "var(--text-on-accent)" },
  png:   { icon: "IMG", bg: "var(--accent)", text: "var(--text-on-accent)" },
  xlsx:  { icon: "XLS", bg: "var(--status-success)", text: "var(--text-on-accent)" },
  xls:   { icon: "XLS", bg: "var(--status-success)", text: "var(--text-on-accent)" },
  docx:  { icon: "DOC", bg: "var(--status-info)", text: "var(--text-on-accent)" },
  doc:   { icon: "DOC", bg: "var(--status-info)", text: "var(--text-on-accent)" },
  other: { icon: "FILE", bg: "var(--text-muted)", text: "var(--bg-surface)" },
};

export const STATUS_COLORS = {
  "Draft":                   { bg: "var(--bg-surface-high)", text: "var(--text-muted)", dot: "var(--text-muted)" },
  "Under Review":            { bg: "var(--warning-muted)", text: "var(--status-warning)", dot: "var(--status-warning)" },
  "Approved":                { bg: "var(--success-muted)", text: "var(--status-success)", dot: "var(--status-success)" },
  "Approved with Comments":  { bg: "color-mix(in srgb, var(--status-success) 10%, transparent)", text: "var(--status-success)", dot: "var(--status-success)" },
  "Revise & Resubmit":       { bg: "var(--warning-muted)", text: "var(--status-warning)", dot: "var(--status-warning)" },
  "Rejected":                { bg: "var(--danger-muted)", text: "var(--status-error)", dot: "var(--status-error)" },
  "Superseded":              { bg: "var(--bg-surface-high)", text: "var(--text-muted)", dot: "var(--text-muted)" },
  "Issued":                  { bg: "var(--info-muted)", text: "var(--status-info)", dot: "var(--status-info)" },
  "Archived":                { bg: "var(--bg-surface-high)", text: "var(--text-muted)", dot: "var(--text-muted)" },
  "Void":                    { bg: "color-mix(in srgb, var(--status-error) 10%, transparent)", text: "var(--status-error)", dot: "var(--status-error)" },
};

/** Infer file type from file name extension */
export const inferFileType = (fileName) => {
  if (!fileName) return "other";
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  return FILE_TYPE_CONFIG[ext] ? ext : "other";
};

/** Get display config for a file type */
export const getFileTypeConfig = (fileType) =>
  FILE_TYPE_CONFIG[fileType] || FILE_TYPE_CONFIG.other;

/** Get status color config */
export const getStatusColor = (status) =>
  STATUS_COLORS[status] || STATUS_COLORS["Draft"];

/** Normalize a document record to ensure both camelCase and snake_case fields are available */
export const normalizeDoc = (doc) => {
  if (!doc) return doc;
  return {
    ...doc,
    displayName:    doc.display_name    ?? doc.displayName    ?? doc.title ?? doc.file_name ?? "",
    documentNumber: doc.document_number ?? doc.documentNumber ?? "",
    revisionNumber: doc.revision_number ?? doc.revisionNumber ?? doc.revision ?? "0",
    fileUrl:        doc.file_url        ?? doc.fileUrl        ?? "",
    fileName:       doc.file_name       ?? doc.fileName       ?? "",
    fileType:       doc.file_type       ?? doc.fileType       ?? inferFileType(doc.file_name ?? doc.fileName ?? ""),
    fileSizeKb:     doc.file_size_kb    ?? doc.fileSizeKb     ?? doc.file_size ?? 0,
    uploadedDate:   doc.uploaded_date   ?? doc.uploadedDate   ?? doc.created_at ?? "",
    uploadedBy:     doc.uploaded_by     ?? doc.uploadedBy     ?? "",
    drawingNumber:  doc.drawing_number  ?? doc.drawingNumber  ?? "",
    category:       doc.category        ?? "Other",
    discipline:     doc.discipline      ?? "General",
    status:         doc.status          ?? "Draft",
  };
};
