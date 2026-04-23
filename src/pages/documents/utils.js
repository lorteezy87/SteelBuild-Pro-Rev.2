/**
 * Pure helpers for the Documents page — normalization of raw Supabase
 * rows into a consistent shape (snake_case → camelCase, tag coercion),
 * and CSV export.
 *
 * The normalization exists because Supabase returns `file_name` /
 * `file_url` / `revision_number` while the rest of the app expects
 * `fileName` / `fileUrl` / `revisionNumber`. We do the translation at
 * the boundary so every downstream component gets the same shape.
 */

export function normalizeDocument(d) {
  return {
    ...d,
    projectId:      d.projectId      ?? d.project_id,
    displayName:    d.displayName    ?? d.display_name ?? d.fileName ?? d.file_name ?? d.title,
    documentNumber: d.documentNumber ?? d.document_number,
    fileName:       d.fileName       ?? d.file_name,
    fileUrl:        d.fileUrl        ?? d.file_url,
    fileType:       d.fileType       ?? d.file_type ?? "other",
    fileSizeKb:     d.fileSizeKb     ?? d.file_size_kb ?? d.file_size,
    revisionNumber: d.revisionNumber ?? d.revision_number ?? d.revision ?? "0",
    revisionDate:   d.revisionDate   ?? d.revision_date,
    drawingNumber:  d.drawingNumber  ?? d.drawing_number,
    uploadedBy:     d.uploadedBy     ?? d.uploaded_by,
    uploadedDate:   d.uploadedDate   ?? d.uploaded_date ?? d.created_at,
    tags: Array.isArray(d.tags)
      ? d.tags
      : d.tags
        ? String(d.tags).split(",").map((t) => t.trim()).filter(Boolean)
        : [],
  };
}

export function exportDocsCsv(docs, projectName) {
  const headers = [
    "Document #", "Name", "Category", "Discipline", "Status",
    "Revision", "File Type", "Size (KB)", "Uploaded By", "Upload Date",
    "Description", "Tags",
  ];
  const rows = docs.map((d) => [
    d.documentNumber || "",
    (d.displayName || d.fileName || "").replace(/"/g, '""'),
    d.category || "",
    d.discipline || "",
    d.status || "",
    d.revisionNumber || "0",
    (d.fileType || "").toUpperCase(),
    d.fileSizeKb || "",
    d.uploadedBy || "",
    d.uploadedDate || d.created_at || "",
    (d.description || "").replace(/"/g, '""'),
    Array.isArray(d.tags) ? d.tags.join("; ") : d.tags || "",
  ]);
  const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(projectName || "project").replace(/\s+/g, "_")}_documents_${new Date().toISOString().split("T")[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** File-type badge color map used in the list view. */
export const LIST_FILETYPE_STYLES = {
  pdf:  { bg: "rgba(239,68,68,0.18)",   color: "#F87171" },
  dwg:  { bg: "rgba(56,189,248,0.18)",  color: "#38BDF8" },
  ifc:  { bg: "rgba(8,145,178,0.18)", color: "#0891B2" },
  gltf: { bg: "rgba(8,145,178,0.18)", color: "#0891B2" },
  xlsx: { bg: "rgba(52,211,153,0.18)",  color: "#34D399" },
  docx: { bg: "rgba(96,165,250,0.18)",  color: "#60A5FA" },
  img:  { bg: "rgba(45,212,191,0.18)",  color: "#2DD4BF" },
  zip:  { bg: "rgba(251,191,36,0.18)",  color: "#FBBF24" },
};

/** Status color map used by the list-view status badge. */
export const LIST_STATUS_STYLES = {
  "Approved":                { bg: "rgba(52,211,153,0.18)",  color: "#34D399" },
  "Approved with Comments":  { bg: "rgba(52,211,153,0.12)",  color: "#34D399" },
  "Under Review":            { bg: "rgba(251,191,36,0.18)",  color: "#FBBF24" },
  "Revise & Resubmit":       { bg: "rgba(251,146,60,0.18)",  color: "#FB923C" },
  "Rejected":                { bg: "rgba(248,113,113,0.18)", color: "#F87171" },
  "Draft":                   { bg: "rgba(160,175,210,0.12)", color: "#A0AED2" },
  "Issued":                  { bg: "rgba(96,165,250,0.18)",  color: "#60A5FA" },
  "Superseded":              { bg: "rgba(100,116,139,0.12)", color: "#94A3B8" },
  "Archived":                { bg: "rgba(100,116,139,0.08)", color: "#64748B" },
  "Void":                    { bg: "rgba(248,113,113,0.10)", color: "#F87171" },
};

export const FILETYPE_FALLBACK = { bg: "rgba(160,175,210,0.12)", color: "#A0AED2" };
