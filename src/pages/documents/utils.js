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
    // Prefer human-entered names over the raw upload filename, which is often
    // a storage hash/UUID — that's why some cards showed a hash as the title.
    displayName:    d.displayName    ?? d.display_name ?? d.title ?? d.fileName ?? d.file_name,
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
    tags: parseTagList(d.tags),
  };
}

/**
 * `documents.tags` is jsonb but writers have stored it as a JSON *string*, so a
 * row can hold a real array, `'["a","b"]'`, `'[]'`, or a plain comma list.
 *
 * The old path only checked Array.isArray then comma-split whatever was left,
 * so the JSON text `"[]"` became the single tag `["[]"]` — rendered literally
 * on every card. Same string-vs-array duality as email recipients
 * (formatRecipientList).
 */
export function parseTagList(value) {
  // Recurse per element: rows corrupted by repeated edit-save cycles hold
  // nested encodings (the text `["[]"]`, then `["\"[]\"" ]`, …). Recursion
  // unwraps every layer so an already-mangled row heals to an empty list on
  // render instead of displaying its own JSON.
  if (Array.isArray(value)) return value.flatMap(parseTagList);
  if (value == null) return [];
  const raw = String(value).trim();
  if (!raw) return [];
  if (raw.startsWith("[") || raw.startsWith('"')) {
    try {
      const parsed = JSON.parse(raw);
      // Re-parse the result: a parsed element can itself be encoded.
      if (Array.isArray(parsed)) return parsed.flatMap(parseTagList);
      const single = String(parsed).trim();
      return single && single !== raw ? parseTagList(single) : single ? [single] : [];
    } catch {
      // Malformed JSON — strip brackets/quotes rather than showing them as tags.
      const stripped = raw.replace(/^\[|\]$/g, "").replace(/"/g, "");
      if (stripped === raw) return [];
      return stripped.split(",").map((t) => t.trim()).filter(Boolean);
    }
  }
  return raw.split(",").map((t) => t.trim()).filter(Boolean);
}

/**
 * `documents.tags` is a TEXT column, but three writers were sending JS arrays,
 * so PostgREST stored the JSON text of the array and every edit-save round-trip
 * re-encoded it. Serialize to the comma list the column actually holds.
 */
export function serializeTagList(value) {
  const tags = parseTagList(value);
  return tags.length ? tags.join(", ") : null;
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
  pdf:  { bg: "var(--danger-muted)", color: "var(--status-error)" },
  dwg:  { bg: "var(--info-muted)", color: "var(--status-info)" },
  ifc:  { bg: "var(--accent-muted)", color: "var(--accent)" },
  gltf: { bg: "var(--accent-muted)", color: "var(--accent)" },
  xlsx: { bg: "var(--success-muted)", color: "var(--status-success)" },
  docx: { bg: "var(--info-muted)", color: "var(--status-info)" },
  img:  { bg: "var(--accent-muted)", color: "var(--accent)" },
  zip:  { bg: "var(--warning-muted)", color: "var(--status-warning)" },
};

/** Status color map used by the list-view status badge. */
export const LIST_STATUS_STYLES = {
  "Approved":                { bg: "var(--success-muted)", color: "var(--status-success)" },
  "Approved with Comments":  { bg: "color-mix(in srgb, var(--status-success) 10%, transparent)", color: "var(--status-success)" },
  "Under Review":            { bg: "var(--warning-muted)", color: "var(--status-warning)" },
  "Revise & Resubmit":       { bg: "var(--warning-muted)", color: "var(--status-warning)" },
  "Rejected":                { bg: "var(--danger-muted)", color: "var(--status-error)" },
  "Draft":                   { bg: "var(--bg-surface-high)", color: "var(--text-muted)" },
  "Issued":                  { bg: "var(--info-muted)", color: "var(--status-info)" },
  "Superseded":              { bg: "var(--bg-surface-high)", color: "var(--text-muted)" },
  "Archived":                { bg: "var(--bg-surface-high)", color: "var(--text-muted)" },
  "Void":                    { bg: "color-mix(in srgb, var(--status-error) 10%, transparent)", color: "var(--status-error)" },
};

export const FILETYPE_FALLBACK = { bg: "var(--bg-surface-high)", color: "var(--text-muted)" };
