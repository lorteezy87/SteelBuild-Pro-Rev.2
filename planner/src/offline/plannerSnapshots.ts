export type PlannerOfflineScope = { userId: string; organizationId: string };
export type PlannerSnapshotRow = Record<string, unknown>;
export type PlannerSnapshot = {
  scope: PlannerOfflineScope;
  key: string;
  rows: PlannerSnapshotRow[];
  syncedAt: string;
};

const DATABASE_NAME = "sbp-planner-offline";
const DATABASE_VERSION = 2;
const SNAPSHOT_STORE = "snapshots";
export const PLANNER_OUTBOX_STORE = "outbox";

function requiredSegment(value: string, field: string): string {
  if (!value?.trim()) throw new Error(`${field} is required for Planner offline state.`);
  return encodeURIComponent(value.trim());
}

export function createPlannerSnapshotKey(scope: PlannerOfflineScope, key: string): string {
  if (!key.trim()) throw new Error("key is required for Planner offline state.");
  return `sbp:planner:snapshot:v1:${requiredSegment(scope.userId, "userId")}:${requiredSegment(scope.organizationId, "organizationId")}:${key.trim()}`;
}

export function createPlannerOutboxScopePrefix(scope: PlannerOfflineScope): string {
  return `sbp:planner:outbox:v1:${requiredSegment(scope.userId, "userId")}:${requiredSegment(scope.organizationId, "organizationId")}:`;
}

function isSensitiveField(field: string): boolean {
  return /(?:access|refresh|auth|session|token|secret|password|cookie|credential)/i.test(field);
}

function sanitizeValue(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(sanitizeValue).filter((entry) => entry !== undefined);
  if (typeof value !== "object") return undefined;
  const clean: PlannerSnapshotRow = {};
  for (const [field, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveField(field)) continue;
    const sanitized = sanitizeValue(nestedValue);
    if (sanitized !== undefined) clean[field] = sanitized;
  }
  return Object.keys(clean).length > 0 ? clean : undefined;
}

/** Removes credentials and non-serializable fields before browser persistence. */
export function sanitizePlannerSnapshotRows(rows: readonly PlannerSnapshotRow[]): PlannerSnapshotRow[] {
  return rows.flatMap((row) => {
    const sanitized = sanitizeValue(row);
    return sanitized && !Array.isArray(sanitized) && typeof sanitized === "object" ? [sanitized as PlannerSnapshotRow] : [];
  });
}

export function openPlannerOfflineDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable."));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(SNAPSHOT_STORE)) database.createObjectStore(SNAPSHOT_STORE, { keyPath: "storageKey" });
      if (!database.objectStoreNames.contains(PLANNER_OUTBOX_STORE)) database.createObjectStore(PLANNER_OUTBOX_STORE, { keyPath: "storageKey" });
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => reject(request.error ?? new Error("Unable to open Planner offline storage."));
    request.onblocked = () => reject(new Error("Planner offline storage upgrade is blocked by another tab."));
  });
}

export function runPlannerOfflineTransaction<T>(database: IDBDatabase, transaction: IDBTransaction, operation: (store: IDBObjectStore) => IDBRequest<T>, storeName = SNAPSHOT_STORE): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let result: T;
    const close = () => database.close();
    const fail = (error: DOMException | Error | null) => { close(); reject(error ?? new Error("Planner offline storage transaction failed.")); };
    let request: IDBRequest<T>;
    try {
      request = operation(transaction.objectStore(storeName));
    } catch (error) {
      try { transaction.abort(); } catch { /* transaction may already be closed */ }
      fail(error instanceof Error ? error : new Error("Planner offline storage request failed."));
      return;
    }
    request.onsuccess = () => { result = request.result; };
    request.onerror = () => {
      try { transaction.abort(); } catch { /* the transaction will report its failure */ }
    };
    transaction.oncomplete = () => { close(); resolve(result); };
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error("Planner offline storage transaction failed.")); };
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error("Planner offline storage transaction aborted.")); };
  });
}

export async function runPlannerOfflineStore<T>(storeName: string, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openPlannerOfflineDatabase();
  const transaction = database.transaction(storeName, mode);
  return runPlannerOfflineTransaction(database, transaction, operation, storeName);
}

export async function savePlannerSnapshot(scope: PlannerOfflineScope, key: string, rows: readonly PlannerSnapshotRow[], syncedAt: string): Promise<void> {
  const snapshot: PlannerSnapshot & { storageKey: string } = { scope, key, rows: sanitizePlannerSnapshotRows(rows), syncedAt, storageKey: createPlannerSnapshotKey(scope, key) };
  await runPlannerOfflineStore(SNAPSHOT_STORE, "readwrite", (store) => store.put(snapshot));
}

export async function loadPlannerSnapshot(scope: PlannerOfflineScope, key: string): Promise<PlannerSnapshot | null> {
  try {
    const row = await runPlannerOfflineStore<PlannerSnapshot & { storageKey: string } | undefined>(SNAPSHOT_STORE, "readonly", (store) => store.get(createPlannerSnapshotKey(scope, key)));
    if (!row || row.scope.userId !== scope.userId || row.scope.organizationId !== scope.organizationId) return null;
    return { scope: row.scope, key: row.key, rows: sanitizePlannerSnapshotRows(row.rows), syncedAt: row.syncedAt };
  } catch { return null; }
}

async function clearStoreForTenant(storeName: string, userId?: string, organizationId?: string): Promise<void> {
  try {
    const database = await openPlannerOfflineDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const row = cursor.value as { scope?: Partial<PlannerOfflineScope> };
        if ((!userId || row.scope?.userId === userId) && (!organizationId || row.scope?.organizationId === organizationId)) cursor.delete();
        cursor.continue();
      };
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onerror = () => { database.close(); reject(transaction.error); };
      transaction.onabort = () => { database.close(); reject(transaction.error); };
    });
  } catch { /* browser storage is best-effort; auth state must still transition */ }
}

/** Clears Planner snapshots and outbox records on sign-out, user switch, or organization switch. */
export async function clearPlannerTenantState(userId?: string, organizationId?: string): Promise<void> {
  await Promise.all([clearStoreForTenant(SNAPSHOT_STORE, userId, organizationId), clearStoreForTenant(PLANNER_OUTBOX_STORE, userId, organizationId)]);
}
