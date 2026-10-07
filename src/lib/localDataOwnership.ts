/** Browser-local user data is isolated by both verified identity and workspace. */
export type LocalDataOwner = { userId: string; orgId: string };
export const LEGACY_NOTES_KEY = "sbp-tools-notes";
export const LEGACY_AUDIT_KEY = "sbp_audit_log";

export function localDataKey(kind: "notes" | "audit", owner: LocalDataOwner | null): string | null {
  if (!owner?.userId || !owner.orgId) return null;
  const prefix = kind === "notes" ? LEGACY_NOTES_KEY : LEGACY_AUDIT_KEY;
  return `${prefix}:v2:${encodeURIComponent(owner.userId)}:${encodeURIComponent(owner.orgId)}`;
}

/** Check existence without loading the ownerless note payload. */
export function hasLegacyNotes(storage: Pick<Storage, "length" | "key">): boolean {
  for (let index = 0; index < storage.length; index++) {
    if (storage.key(index) === LEGACY_NOTES_KEY) return true;
  }
  return false;
}

type AuditRow = Record<string, unknown>;
type AuditStorage = Pick<Storage, "getItem" | "setItem">;
type AuditState = { entries: AuditRow[]; hideLegacy: boolean };
const MAX_ENTRIES = 200;
function parseJson(raw: string | null): unknown {
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}
const isRow = (entry: unknown): entry is AuditRow =>
  typeof entry === "object" && entry !== null && !Array.isArray(entry);

function readState(storage: AuditStorage, key: string): AuditState {
  const raw = storage.getItem(key);
  const parsed = parseJson(raw);
  if (!isRow(parsed)) return { entries: [], hideLegacy: false };
  return {
    entries: Array.isArray(parsed.entries) ? parsed.entries.filter(isRow) : [],
    hideLegacy: parsed.hideLegacy === true,
  };
}

export function readOwnedAudit(
  storage: AuditStorage,
  owner: LocalDataOwner,
  filterAction: string | null = null,
): AuditRow[] {
  const key = localDataKey("audit", owner);
  if (!key) return [];
  const state = readState(storage, key);
  const scoped = state.entries.filter((entry) =>
    entry.userId === owner.userId && entry.orgId === owner.orgId,
  );
  let legacy: AuditRow[] = [];
  if (!state.hideLegacy) {
    // Legacy entries carried userId; notes did not. Never infer an audit owner
    // from email or the account that happens to sign in first.
    const raw = storage.getItem(LEGACY_AUDIT_KEY);
    const parsed = parseJson(raw);
    if (Array.isArray(parsed)) {
      legacy = parsed.filter(isRow).filter((entry) =>
        entry.userId === owner.userId &&
        (entry.orgId == null || entry.orgId === owner.orgId),
      ).map((entry) => ({
        ...entry,
        legacyWorkspaceUnknown: entry.orgId == null,
        ...(entry.orgId == null ? { scopeLabel: "Historical user/device only (workspace unknown)" } : {}),
      }));
    }
  }
  return [...scoped, ...legacy]
    .filter((entry) => !filterAction || entry.action === filterAction)
    .sort((a, b) => String(b.ts ?? "").localeCompare(String(a.ts ?? "")))
    .slice(0, MAX_ENTRIES);
}

export function appendOwnedAudit(
  storage: AuditStorage,
  owner: LocalDataOwner,
  action: string,
  details: AuditRow,
  userEmail: string | undefined,
  url: string | null,
): void {
  const key = localDataKey("audit", owner);
  if (!key) return;
  const state = readState(storage, key);
  const entry = {
    ...details,
    ts: new Date().toISOString(),
    userEmail: userEmail ?? "unknown",
    userId: owner.userId,
    orgId: owner.orgId,
    action,
    url,
  };
  storage.setItem(key, JSON.stringify({
    ...state,
    entries: [entry, ...state.entries.filter((row) =>
      row.userId === owner.userId && row.orgId === owner.orgId,
    )].slice(0, MAX_ENTRIES),
  }));
}

/** Clear this scope's view; never delete or rewrite the preserved legacy store. */
export function clearOwnedAudit(storage: AuditStorage, owner: LocalDataOwner): void {
  const key = localDataKey("audit", owner);
  if (key) storage.setItem(key, JSON.stringify({ entries: [], hideLegacy: true }));
}
