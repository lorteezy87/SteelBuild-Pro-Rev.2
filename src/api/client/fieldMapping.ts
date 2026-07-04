/**
 * fieldMapping.ts
 *
 * camelCase↔snake_case column mapping, legacy created_date/updated_date alias
 * injection, JSONB array normalisation, and write-time record cleaning.
 * Extracted verbatim from supabaseClient.ts.
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * The legacy backend used `created_date` / `updated_date` as timestamp field names.
 * Our Postgres schema uses the standard `created_at` / `updated_at`.
 * Map them transparently so all existing code continues to work.
 */
const COLUMN_MAP: Record<string, string> = {
  created_date: 'created_at',
  updated_date: 'updated_at',
};

export const mapColumn = (col: string): string => COLUMN_MAP[col] || col;

/**
 * After fetching, add legacy aliases to each record so UI code
 * reading `record.created_date` still works.
 */
export const addAliases = <R>(record: R, tableName?: string): R => {
  if (!record || typeof record !== 'object') return record;
  const out: Record<string, unknown> = { ...(record as Record<string, unknown>) };
  // Project-scoped reads embed the parent project only to enforce
  // `projects.is_deleted = false`; callers should still receive the
  // legacy-compatible flat row shape they expect.
  delete out.projects;
  if (out.created_at !== undefined && out.created_date === undefined) out.created_date = out.created_at;
  if (out.updated_at !== undefined && out.updated_date === undefined) out.updated_date = out.updated_at;
  // The activities table stores audit columns in snake_case; the legacy
  // Activity-feed UI (dashboard/ActivityFeed) reads legacy camelCase.
  // Mirror them so both shapes resolve off the same row. cleanRecord() strips
  // any uppercase-containing key on write, so these mirrors never persist back.
  if (tableName === 'activities') {
    if (out.performed_by !== undefined && out.userName === undefined) out.userName = out.performed_by;
    if (out.entity_type !== undefined && out.entityType === undefined) out.entityType = out.entity_type;
    if (out.entity_name !== undefined && out.entityName === undefined) out.entityName = out.entity_name;
    if (out.project_name !== undefined && out.projectName === undefined) out.projectName = out.project_name;
    if (out.project_id !== undefined && out.projectId === undefined) out.projectId = out.project_id;
  }
  return out as R;
};

export const addAliasesToList = <R>(rows: R[] | null | undefined, tableName?: string): R[] =>
  (rows || []).map((r) => addAliases(r, tableName));

/**
 * Coerce a JSONB id-array value into a clean string[]. Postgres can return
 * JSONB columns as either parsed arrays or stringified JSON depending on the
 * driver path / supabase-js version. This mirrors the inline asArray helper
 * used by DailyLogForm but lives at the entity boundary so wrappers can
 * normalise on write without forcing every UI to repeat the dance.
 *
 * Returns [] for any unparseable input — old rows that were never touched
 * are well-formed via DEFAULT '[]'::jsonb, so [] is the right empty-state.
 */
export const normalizeIdArray = (v: unknown): string[] => {
  if (Array.isArray(v)) {
    return v.filter((id): id is string => typeof id === 'string' && id.length > 0);
  }
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) {
        return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0);
      }
    } catch { /* fall through */ }
  }
  return [];
};

/**
 * Coerce a JSONB array of arbitrary objects into a clean array — same
 * tolerance as normalizeIdArray (parsed array OR stringified JSON OR
 * unparseable → []) but does NOT element-validate, since the elements
 * here are object shapes (e.g. photo objects {file_url, name, uploaded_at})
 * that vary across modules. Drops only nullish entries.
 */
export const normalizeJsonbArray = (v: unknown): unknown[] => {
  if (Array.isArray(v)) {
    return v.filter((el) => el != null);
  }
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) {
        return parsed.filter((el) => el != null);
      }
    } catch { /* fall through */ }
  }
  return [];
};

/**
 * Strip undefined values and camelCase keys (Postgres uses snake_case only).
 * Also strip the virtual alias fields that addAliases() injects after reads
 * (created_date, updated_date) — they are not real DB columns and will cause
 * a PostgREST "column not found" error if sent back on update/create.
 */
const VIRTUAL_FIELDS = new Set(['created_date', 'updated_date', 'projects']);
export const cleanRecord = (record: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(record)
      .filter(
        ([k, v]) => v !== undefined && !/[A-Z]/.test(k) && !VIRTUAL_FIELDS.has(k) && !k.startsWith('_')
      )
      .map(([k, v]) => [k, v === '' ? null : v])
  );
