import { getActiveOrgGeneration, subscribeActiveOrgChange } from "@/lib/activeOrg";

export type ImportRecord = Record<string, unknown>;

export interface BulkCreateEntity {
  bulkCreate: (records: ImportRecord[]) => Promise<ImportRecord[]>;
  create: (record: ImportRecord, options?: { clientOperationId: string }) => Promise<ImportRecord>;
}

interface RecoveryRow {
  record: ImportRecord;
  status: "pending" | "created" | "failed" | "unknown";
  created?: ImportRecord;
  clientOperationId?: string;
  incompleteResponse?: { created: ImportRecord[]; inputCount: number };
}

/** Keep this with the reviewed draft. Exact payloads, entity and duplicate occurrence bind retries. */
export type BulkCreateRecovery = Map<BulkCreateEntity, Map<string, RecoveryRow>>;
const recoveryGenerations = new WeakMap<BulkCreateRecovery, number>();
let sessionRecovery: BulkCreateRecovery = new Map();
subscribeActiveOrgChange(() => { sessionRecovery = new Map(); });

/** Session receipts survive route/modal remounts, but never an identity boundary. */
export function getSessionBulkCreateRecovery(): BulkCreateRecovery {
  recoveryGenerations.set(sessionRecovery, getActiveOrgGeneration());
  return sessionRecovery;
}

export function assertImportWorkspace(generation: number): void {
  if (generation !== getActiveOrgGeneration()) {
    throw new Error("Workspace changed. Reopen this import or setup and review the current project before continuing.");
  }
}

export interface BulkCreateResult {
  created: ImportRecord[];
  skipped: number;
  unresolved: number;
  retryable: number;
}

function errorFields(error: unknown): Record<string, unknown> {
  return error && typeof error === "object" ? error as Record<string, unknown> : {};
}

function definiteFailure(error: unknown): boolean {
  const fields = errorFields(error);
  return fields.outcomeUnknown === false || (typeof fields.code === "string"
    && (/^[0-9A-Z]{5}$/.test(fields.code) || /^PGRST/.test(fields.code)));
}

function retainFailure(row: RecoveryRow, error: unknown): void {
  const fields = errorFields(error);
  row.status = definiteFailure(error) ? "failed" : "unknown";
  // Only a numbered-create receipt certifies that this identity supports safe replay.
  if (typeof fields.clientOperationId === "string" && typeof fields.outcomeUnknown === "boolean") {
    row.clientOperationId = fields.clientOperationId;
  }
}

function summarize(rows: RecoveryRow[]): BulkCreateResult {
  const result: BulkCreateResult = { created: [], skipped: 0, unresolved: 0, retryable: 0 };
  const incomplete = new Map<NonNullable<RecoveryRow["incompleteResponse"]>, number>();
  for (const row of rows) {
    if (row.created) result.created.push(row.created);
    if (row.status === "failed") result.skipped += 1;
    if (row.status === "unknown") {
      result.unresolved += 1;
      if (row.clientOperationId) result.retryable += 1;
    }
    if (row.incompleteResponse) incomplete.set(row.incompleteResponse, (incomplete.get(row.incompleteResponse) ?? 0) + 1);
  }
  for (const [response, includedCount] of incomplete) {
    // A short reply confirms a count for the original batch, not any particular
    // input. After register deduplication removes rows, none of that count can
    // safely be attributed to the remaining subset.
    if (includedCount !== response.inputCount) continue;
    result.created.push(...response.created);
    result.unresolved = Math.max(0, result.unresolved - response.created.length);
  }
  return result;
}

/** Bulk SQL rejections can fall back; partial or unknown commits cannot be replayed blindly. */
export async function bulkCreateWithFallback(
  entity: BulkCreateEntity | null | undefined,
  records: ImportRecord[],
  logPrefix = "data-exchange",
  recovery: BulkCreateRecovery = getSessionBulkCreateRecovery(),
): Promise<BulkCreateResult> {
  const generation = recoveryGenerations.get(recovery) ?? getActiveOrgGeneration();
  recoveryGenerations.set(recovery, generation);
  assertImportWorkspace(generation);
  if (!entity) return { created: [], skipped: records.length, unresolved: 0, retryable: 0 };
  let savedRows = recovery.get(entity);
  if (!savedRows) {
    savedRows = new Map();
    recovery.set(entity, savedRows);
  }
  const occurrences = new Map<string, number>();
  const drafts = records.map((record) => {
    const payload = JSON.stringify(record);
    const occurrence = occurrences.get(payload) ?? 0;
    occurrences.set(payload, occurrence + 1);
    const key = JSON.stringify([payload, occurrence]);
    return { record, key };
  });
  const uncertainProjects = new Set([...savedRows.values()]
    .filter((row) => row.status === "unknown")
    .map((row) => row.record.project_id));
  if (drafts.some(({ record, key }) => !savedRows.has(key) && uncertainProjects.has(record.project_id))) {
    throw new Error("An earlier import has unconfirmed saves in this project. Reconcile them before changing or replacing the reviewed rows.");
  }
  let allNew = true;
  const rows = drafts.map(({ record, key }) => {
    const existing = savedRows.get(key);
    if (existing) {
      allNew = false;
      if (existing.status === "failed") existing.status = "pending";
      return existing;
    }
    const row: RecoveryRow = { record: structuredClone(record), status: "pending" };
    savedRows.set(key, row);
    return row;
  });
  if (!rows.length) return summarize(rows);

  if (allNew) {
    // Until the reply is understood, none of these writes is safe to repeat.
    rows.forEach((row) => { row.status = "unknown"; });
    try {
      const created = await entity.bulkCreate(rows.map((row) => row.record));
      if (Array.isArray(created) && created.length === rows.length && created.every((row) => row && typeof row === "object")) {
        rows.forEach((row, index) => { row.status = "created"; row.created = created[index]; });
      } else {
        // A short/absent response cannot identify which input rows committed.
        const response = { inputCount: rows.length, created: Array.isArray(created) ? created.filter((row) => row && typeof row === "object") : [] };
        rows.forEach((row) => { row.incompleteResponse = response; });
      }
    } catch (error) {
      const fields = errorFields(error);
      const prefix = fields.created;
      const index = fields.failedIndex;
      if (Array.isArray(prefix) && Number.isInteger(index) && index === prefix.length
        && typeof index === "number" && index >= 0 && index < rows.length
        && prefix.every((row) => row && typeof row === "object")) {
        prefix.forEach((created, offset) => { rows[offset].status = "created"; rows[offset].created = created; });
        retainFailure(rows[index], fields.cause);
        rows.slice(index + 1).forEach((row) => { row.status = "pending"; });
      } else if (fields.operation === "bulkCreate" && definiteFailure(error)) {
        // The generic entity client performs one atomic INSERT; this rejection rolled it back.
        rows.forEach((row) => { row.status = "pending"; });
      }
      console.warn(`[${logPrefix}] bulk create did not complete; recovering only safe rows`, error);
    }
  }

  for (const row of rows) {
    assertImportWorkspace(generation);
    if (row.status !== "pending" && !(row.status === "unknown" && row.clientOperationId)) continue;
    row.status = "unknown";
    try {
      const created = row.clientOperationId
        ? await entity.create(row.record, { clientOperationId: row.clientOperationId })
        : await entity.create(row.record);
      if (created && typeof created === "object") {
        row.created = created;
        row.status = "created";
      }
    } catch (error) {
      retainFailure(row, error);
      console.warn(`[${logPrefix}] row save ${definiteFailure(error) ? "rejected" : "unconfirmed"}`, error);
    }
  }
  assertImportWorkspace(generation);
  return summarize(rows);
}
