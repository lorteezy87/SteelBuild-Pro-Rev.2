export const INTERNAL_EXPORT_FIELDS = new Set([
  "id",
  "created_at",
  "updated_at",
  "created_date",
  "updated_date",
  "created_by",
  "updated_by",
  "deleted_at",
  "project_id",
  "project_name",
  "metadata",
  "workspace_id",
  "tenant_id",
]);

function sanitizeFilenamePart(value) {
  return String(value || "steelbuild")
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    || "steelbuild";
}

function toExportValue(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value) || typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function collectExportFields(records = [], preferredFields = []) {
  const fields = [];
  const seen = new Set();

  for (const field of preferredFields) {
    if (!field || INTERNAL_EXPORT_FIELDS.has(field) || seen.has(field)) continue;
    seen.add(field);
    fields.push(field);
  }

  const discovered = new Set();
  for (const record of records) {
    for (const field of Object.keys(record || {})) {
      if (!field || INTERNAL_EXPORT_FIELDS.has(field) || seen.has(field)) continue;
      discovered.add(field);
    }
  }

  for (const field of [...discovered].sort((a, b) => a.localeCompare(b))) {
    seen.add(field);
    fields.push(field);
  }

  return fields;
}

export function recordsToExportRows(records = [], fields = []) {
  return records.map((record) => {
    const row = {};
    for (const field of fields) row[field] = record?.[field] ?? "";
    return row;
  });
}

export function csvEscape(value) {
  const text = toExportValue(value);
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

export function recordsToCsv(records = [], preferredFields = []) {
  const fields = collectExportFields(records, preferredFields);
  const lines = [
    fields.map(csvEscape).join(","),
    ...records.map((record) => fields.map((field) => csvEscape(record?.[field])).join(",")),
  ];
  return lines.join("\r\n");
}

export function buildJsonExport({ project, targetKey, target, records = [], exportedAt = new Date().toISOString() }) {
  const fields = collectExportFields(records, target?.fields || []);
  return {
    exported_at: exportedAt,
    source: "SteelBuild Pro",
    project: {
      id: project?.id || null,
      project_number: project?.project_number || null,
      name: project?.name || project?.project_name || null,
    },
    dataset: {
      key: targetKey,
      label: target?.label || targetKey,
      entity_key: target?.entityKey || null,
      record_count: records.length,
      fields,
    },
    records: recordsToExportRows(records, fields),
  };
}

export function makeExportFilename({ project, target, extension, exportedAt = new Date().toISOString() }) {
  const projectPart = sanitizeFilenamePart(project?.project_number || project?.name || "project");
  const targetPart = sanitizeFilenamePart(target?.label || "data");
  const datePart = String(exportedAt).slice(0, 10) || "export";
  return `${projectPart}-${targetPart}-${datePart}.${extension}`;
}

export async function bulkCreateWithFallback(entity, records, logPrefix = "data-exchange") {
  if (!records.length) return { created: [], skipped: 0 };
  try {
    const created = await entity.bulkCreate(records);
    return { created: Array.isArray(created) ? created : [], skipped: 0 };
  } catch (err) {
    console.warn(`[${logPrefix}] bulkCreate failed, falling back to row creates`, err);
    const created = [];
    let skipped = 0;
    for (const record of records) {
      try {
        created.push(await entity.create(record));
      } catch (rowErr) {
        // Skip the failing row (e.g. a duplicate unique key on re-import)
        // rather than aborting the whole batch and leaving an unhandled
        // promise rejection. The caller still gets every row that DID create.
        skipped += 1;
        console.warn(`[${logPrefix}] row create skipped:`, rowErr?.message || rowErr);
      }
    }
    return { created, skipped };
  }
}
