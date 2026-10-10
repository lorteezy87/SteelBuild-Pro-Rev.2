import type { ParsedChangeOrder } from "@/lib/importChangeOrderCsv";

const SOURCE_MARKER = "SteelBuild CSV source CO: ";
const sourceKey = (reference: string) => reference.trim().toUpperCase().replace(/\s+/g, " ");

type ImportProject = { id: string; project_number?: string | null };
export function matchImportProject<T extends ImportProject>(jobNumber: string | undefined, projects: readonly T[]): T | null {
  const digits = (jobNumber || "").replace(/\D/g, "");
  if (!digits) return null;
  const matches = projects.filter(project => (project.project_number || "").replace(/\D/g, "") === digits);
  return matches.length === 1 ? matches[0] : null;
}

export function sourceReferenceFromNotes(notes: string | null | undefined): string | null {
  const marker = (notes || "").split("\n").filter(line => line.startsWith(SOURCE_MARKER)).at(-1);
  if (!marker) return null;
  try {
    const reference: unknown = JSON.parse(marker.slice(SOURCE_MARKER.length));
    return typeof reference === "string" && reference.trim() ? reference : null;
  } catch { return null; }
}

export type ImportPayload = {
  project_id: string; title: string; description: string | null; reason_code: string | null;
  status: "Draft" | "Submitted"; co_amount: number; submitted_date: string | null;
  notes: string; schedule_impact_days: number | null; margin_percent: number | null;
  metadata?: { csv_import: { source_reference: string; content_fingerprint: string } };
};
export type PreparedChangeOrder = {
  source: ParsedChangeOrder; index: number; referenceKey: string; clientOperationId: string;
  payload: ImportPayload | null; error: string | null; contentFingerprint: string | null;
};
export type ImportedRecord = { id: string; co_number?: string | null; project_id?: string | null; notes?: string | null; metadata?: unknown };
export type ImportOutcome = {
  succeeded: Array<{ row: PreparedChangeOrder; record: ImportedRecord }>;
  skipped: Array<{ row: PreparedChangeOrder; record: ImportedRecord }>;
  failed: Array<{ row: PreparedChangeOrder; error: string }>;
};

/** Stable operation identity; the database still owns the official CO number. */
async function operationId(projectId: string, reference: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(["steelbuild-co-csv-v1", projectId, reference])))).slice(0, 16);
  // Version 8 is the UUID space for application-defined deterministic identities.
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function prepareChangeOrderImport(rows: readonly ParsedChangeOrder[], projectId: string): Promise<PreparedChangeOrder[]> {
  if (!projectId) throw new Error("Select a project before preparing this import.");
  const prepared: PreparedChangeOrder[] = [];
  // Hash incrementally so a large CSV cannot queue thousands of crypto jobs at once.
  for (const [index, source] of rows.entries()) {
    const referenceKey = sourceKey(source.co_number);
    let error: string | null = null;
    if (!referenceKey) error = "A source CO reference is required.";
    else if (source.status !== "Draft" && source.status !== "Submitted") error = `Source status ${source.status} requires individual review. Import only Draft or Submitted rows; no approval is inferred.`;
    else if (source.approved_date || source.approved_by) error = "Approval dates and approvers require individual review. Remove those stamps only if this is a Draft or Submitted change.";
    else if (source.co_amount === null || !Number.isFinite(source.co_amount)) error = "Enter a known numeric amount before importing this change order.";
    const payload: ImportPayload | null = error ? null : {
      project_id: projectId, title: source.title, description: source.description, reason_code: source.reason_code,
      status: source.status as "Draft" | "Submitted", co_amount: source.co_amount!, submitted_date: source.submitted_date,
      notes: [source.notes, `${SOURCE_MARKER}${JSON.stringify(source.co_number)}`].filter(Boolean).join("\n"),
      schedule_impact_days: source.schedule_impact_days, margin_percent: source.margin_percent,
    };
    const digest = payload ? new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(payload)))) : null;
    const contentFingerprint = digest ? [...digest].map(byte => byte.toString(16).padStart(2, "0")).join("") : null;
    if (payload && contentFingerprint) payload.metadata = { csv_import: { source_reference: source.co_number, content_fingerprint: contentFingerprint } };
    prepared.push({ source, index, referenceKey, clientOperationId: await operationId(projectId, referenceKey), payload, error, contentFingerprint });
  }
  return prepared;
}

function importMetadata(record: ImportedRecord): { source_reference?: unknown; content_fingerprint?: unknown } | null {
  const metadata = record.metadata;
  if (!metadata || typeof metadata !== "object" || !("csv_import" in metadata)) return null;
  const provenance = metadata.csv_import;
  return provenance && typeof provenance === "object" ? provenance : null;
}

/** Complete evidence first; write in reviewed order and retain every failed row. */
export async function commitChangeOrderImport({ rows, projectId, readExisting, create, assertScope }: {
  rows: readonly PreparedChangeOrder[]; projectId: string;
  readExisting: (projectId: string) => Promise<ImportedRecord[]>;
  create: (payload: ImportPayload, options: { clientOperationId: string }) => Promise<ImportedRecord>;
  assertScope: (projectId: string) => void;
}): Promise<ImportOutcome> {
  assertScope(projectId);
  const existing = await readExisting(projectId);
  assertScope(projectId);
  if (existing.some(record => record.project_id !== projectId)) throw new Error("Import evidence contains a change order outside the selected project.");
  const references = new Map<string, ImportedRecord[]>();
  for (const record of existing) {
    const recordedReference = importMetadata(record)?.source_reference;
    const reference = typeof recordedReference === "string" ? recordedReference : sourceReferenceFromNotes(record.notes);
    if (reference) references.set(sourceKey(reference), [...(references.get(sourceKey(reference)) || []), record]);
  }
  const counts = new Map<string, number>();
  rows.forEach(row => counts.set(row.referenceKey, (counts.get(row.referenceKey) || 0) + 1));
  const outcome: ImportOutcome = { succeeded: [], skipped: [], failed: [] };
  for (const row of rows) {
    try {
      assertScope(projectId);
      if (row.error || !row.payload) throw new Error(row.error || "This row has not been reviewed.");
      if (row.payload.project_id !== projectId) throw new Error("The prepared row belongs to another project. Parse the source again.");
      if (counts.get(row.referenceKey)! > 1) throw new Error("Duplicate source CO reference in the selected rows. Keep one reviewed row for this reference.");
      const matches = references.get(row.referenceKey) || [];
      if (matches.length > 1) throw new Error("Multiple existing change orders carry this source reference. Review them in the project register before importing.");
      const prior = matches[0];
      if (prior) {
        const previousFingerprint = importMetadata(prior)?.content_fingerprint;
        if (previousFingerprint !== row.contentFingerprint) throw new Error(`Source content changed or cannot be verified against ${prior.co_number || "the existing change order"}. Review that record individually; no duplicate was created.`);
        outcome.skipped.push({ row, record: prior }); continue;
      }
      const record = await create(row.payload, { clientOperationId: row.clientOperationId });
      references.set(row.referenceKey, [record]);
      outcome.succeeded.push({ row, record });
    } catch (error) {
      outcome.failed.push({ row, error: error instanceof Error ? error.message : "Change order import failed." });
    }
  }
  return outcome;
}
