import type { SovStagedRow } from "@/lib/importSovSpreadsheet";
import { getActiveOrgGeneration, subscribeActiveOrgChange } from "@/lib/activeOrg";

type ImportedLine = { id: string; project_id?: string | null; sov_id?: string | null; line_item_number?: number | null };
export type SovImportRow = SovStagedRow & {
  clientOperationId: string; importError?: string; sourceKey: string; generation: number;
  importedRecord?: ImportedLine;
};
type Receipt = {
  operation: string; fingerprint: string; payload: Record<string, unknown>;
  status: "prepared" | "attempted" | "rejected" | "saved"; created?: ImportedLine;
  attempt: number;
};
const receipts = new Map<string, Receipt>();
subscribeActiveOrgChange(() => receipts.clear());

function importPayload(row: SovStagedRow): Record<string, unknown> {
  // Spreadsheet references are never official allocations.
  const { sov_id: _sourceSovId, line_item_number: _sourceLine, project_name: _projectName, ...payload } = row.record;
  return payload;
}
const fingerprint = (payload: Record<string, unknown>): string => JSON.stringify(Object.keys(payload).sort().map(key => [key, payload[key]]));

function sourceKey(row: SovStagedRow, index: number, sourceName: string): string {
  const reference = row.sourceLineReference === undefined ? String(row.record.line_item_number) : row.sourceLineReference;
  return JSON.stringify([row.record.project_id, row.record.application_number,
    reference ? ["line", reference] : ["file-row", sourceName, row.sourceRow ?? index + 1]]);
}

export function validateSovValues(record: Record<string, unknown>): void {
  if (typeof record.description !== "string" || !record.description.trim()) throw new Error("Description is required.");
  if (!Number.isFinite(Number(record.scheduled_value)) || Number(record.scheduled_value) <= 0) throw new Error("Scheduled value must be greater than zero.");
  for (const [field, label] of [["previous_percent_complete", "Previous completion"], ["current_percent_complete", "Current completion"], ["retainage_percent", "Retainage"]]) {
    const value = Number(record[field] ?? (field === "retainage_percent" ? 10 : 0));
    if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error(`${label} must be between 0 and 100%.`);
  }
  if (Number(record.current_percent_complete ?? 0) < Number(record.previous_percent_complete ?? 0)) throw new Error("Current completion cannot be less than previous completion.");
  const application = Number(record.application_number ?? 1);
  if (!Number.isInteger(application) || application < 1) throw new Error("Application number must be a positive whole number.");
  if (!["Draft", "Submitted", "Certified", "Paid"].includes(String(record.status ?? "Draft"))) throw new Error("SOV status is not recognized.");
  for (const field of ["period_from", "period_to", "submitted_date", "payment_received_date"]) {
    const date = record[field];
    if (date && (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) throw new Error("Billing dates must be valid calendar dates.");
  }
  if (record.period_from && record.period_to && String(record.period_to) < String(record.period_from)) throw new Error("Period end cannot be before period start.");
  if (record.submitted_date && record.payment_received_date && String(record.payment_received_date) < String(record.submitted_date)) throw new Error("Payment date cannot be before submission.");
}

/** Session receipts survive re-upload/navigation, but never identity changes or reloads. */
export function prepareSovImport(staged: SovStagedRow[], sourceName = ""): SovImportRow[] {
  const generation = getActiveOrgGeneration();
  const keys = staged.map((row, index) => sourceKey(row, index, sourceName));
  const counts = new Map<string, number>();
  keys.forEach(key => counts.set(key, (counts.get(key) ?? 0) + 1));
  return staged.map((row, index) => {
    const key = keys[index];
    const previous = receipts.get(key);
    const prepared: SovImportRow = { ...structuredClone(row), sourceKey: key, generation, clientOperationId: previous?.operation ?? crypto.randomUUID() };
    if (!row.valid) return prepared;
    try { validateSovValues({ ...row.record }); }
    catch (error) { return { ...prepared, valid: false, reason: error instanceof Error ? error.message : "Invalid SOV values." }; }
    if (counts.get(key)! > 1) return { ...prepared, valid: false, reason: "Duplicate source line reference in this file. Keep one reviewed row for each application and source line." };
    const payload = importPayload(row);
    const content = fingerprint(payload);
    if (previous && previous.fingerprint !== content && (previous.status === "attempted" || previous.status === "saved")) {
      return { ...prepared, valid: false, reason: "Source line content changed after an earlier save attempt. Review the original line in the project register; no new line or update will be written." };
    }
    if (previous?.created) {
      return { ...prepared, valid: false, importedRecord: structuredClone(previous.created),
        reason: `Already saved as ${previous.created.sov_id || `line ${previous.created.line_item_number ?? previous.created.id}`}. Review changes in the project register.` };
    }
    if (!previous || previous.fingerprint !== content) {
      receipts.set(key, { operation: prepared.clientOperationId, fingerprint: content, payload: structuredClone(payload), status: "prepared", attempt: 0 });
    }
    return previous?.status === "attempted" ? { ...prepared, importError: "Earlier save is unconfirmed. Retry to recover the original source line." } : prepared;
  });
}

export async function commitSovImport({ rows, projectId, assertScope, create }: {
  rows: SovImportRow[];
  projectId: string;
  assertScope: () => void;
  create: (payload: Record<string, unknown>, options: { clientOperationId: string }) => Promise<ImportedLine>;
}) {
  const succeeded: Array<{ row: SovImportRow; record: ImportedLine }> = [];
  const failed: SovImportRow[] = [];
  for (const row of rows) {
    if (!row.valid) continue;
    try {
      if (row.generation !== getActiveOrgGeneration()) throw new Error("Workspace changed. Reopen and review the import before saving.");
      assertScope();
      if (row.record.project_id !== projectId) throw new Error("An import row belongs to another project.");
      validateSovValues({ ...row.record });
      const receipt = receipts.get(row.sourceKey);
      if (!receipt || receipt.operation !== row.clientOperationId || receipt.fingerprint !== fingerprint(importPayload(row))) {
        throw new Error("Source line changed since review. Reopen the original import before saving.");
      }
      if (receipt.created) { succeeded.push({ row, record: structuredClone(receipt.created) }); continue; }
      const wasAttempted = receipt.status === "attempted";
      const attempt = ++receipt.attempt;
      receipt.status = "attempted";
      let record: ImportedLine;
      try { record = await create(structuredClone(receipt.payload), { clientOperationId: receipt.operation }); }
      catch (error) {
        if (!wasAttempted && receipt.attempt === attempt && !receipt.created && error && typeof error === "object" && "outcomeUnknown" in error && error.outcomeUnknown === false) receipt.status = "rejected";
        throw error;
      }
      if (!record?.id || record.project_id !== projectId) throw new Error("Save outcome could not be verified. Retry this row to recover its original record.");
      receipt.status = "saved"; receipt.created = structuredClone(record);
      succeeded.push({ row, record });
    } catch (error) {
      failed.push({ ...row, importError: error instanceof Error ? error.message : "Import failed. Retry this row." });
    }
  }
  return { succeeded, failed };
}
