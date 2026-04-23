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
  pdf:   { icon: "PDF", bg: "#dc2626", text: "#fff" },
  dwg:   { icon: "DWG", bg: "#2563eb", text: "#fff" },
  dxf:   { icon: "DXF", bg: "#0d9488", text: "#fff" },
  ifc:   { icon: "3D",  bg: "#059669", text: "#fff" },
  rvt:   { icon: "RVT", bg: "#d97706", text: "#fff" },
  jpg:   { icon: "IMG", bg: "#0891b2", text: "#fff" },
  jpeg:  { icon: "IMG", bg: "#0891b2", text: "#fff" },
  png:   { icon: "IMG", bg: "#0891b2", text: "#fff" },
  xlsx:  { icon: "XLS", bg: "#16a34a", text: "#fff" },
  xls:   { icon: "XLS", bg: "#16a34a", text: "#fff" },
  docx:  { icon: "DOC", bg: "#2563eb", text: "#fff" },
  doc:   { icon: "DOC", bg: "#2563eb", text: "#fff" },
  other: { icon: "FILE", bg: "#64748b", text: "#fff" },
};

export const STATUS_COLORS = {
  "Draft":                   { bg: "rgba(100,116,139,0.15)", text: "#94a3b8", dot: "#64748b" },
  "Under Review":            { bg: "rgba(234,179,8,0.15)",   text: "#eab308", dot: "#eab308" },
  "Approved":                { bg: "rgba(34,197,94,0.15)",   text: "#22c55e", dot: "#22c55e" },
  "Approved with Comments":  { bg: "rgba(34,197,94,0.10)",   text: "#4ade80", dot: "#4ade80" },
  "Revise & Resubmit":       { bg: "rgba(249,115,22,0.15)", text: "#f97316", dot: "#f97316" },
  "Rejected":                { bg: "rgba(239,68,68,0.15)",   text: "#ef4444", dot: "#ef4444" },
  "Superseded":              { bg: "rgba(100,116,139,0.10)", text: "#64748b", dot: "#64748b" },
  "Issued":                  { bg: "rgba(59,130,246,0.15)",  text: "#3b82f6", dot: "#3b82f6" },
  "Archived":                { bg: "rgba(100,116,139,0.08)", text: "#475569", dot: "#475569" },
  "Void":                    { bg: "rgba(239,68,68,0.08)",   text: "#dc2626", dot: "#dc2626" },
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
