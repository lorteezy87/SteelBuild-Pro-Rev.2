/**
 * supabaseClient.ts
 *
 * The app's Supabase-backed data layer. Exports the surfaces directly as
 * named values — import exactly what you need:
 *   entities.X.list / filter / get / create / update / delete
 *   auth.me / loginViaEmailPassword / logout / redirectToLogin / updateMe
 *   integrations.Core.UploadFile / InvokeLLM
 *   functions.invoke
 *   getSignedUrl / resolveFileUrl
 *
 * Capabilities:
 *   - Soft-delete support: list/filter auto-exclude is_deleted rows
 *   - Atomic number sequencing via DB RPC (no race conditions)
 *   - Structured error messages with table/operation context
 *   - camelCase→snake_case field mapping for known patterns
 *   - Range/comparison query support via operator prefixes
 */

import { supabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import type { Database } from '@/types/supabase';
import {
  parseDependencies as parseScheduleDependencies,
  serializeDependencies as serializeScheduleDependencies,
} from '@/services/scheduleCascade';
import { getActiveOrgId } from '@/lib/activeOrg';
import { stripPrivilegeMeta } from '@/lib/authMeta';
import { assertUploadAllowed, sanitizeFilename, type UploadWorkflow } from '@/lib/uploadValidation';

// ─── Type helpers (DB row shapes) ─────────────────────────────────────────────

type Tables = Database['public']['Tables'];
export type TableName = keyof Tables;
export type Row<T extends TableName> = Tables[T]['Row'];
export type Insert<T extends TableName> = Tables[T]['Insert'];
export type Update<T extends TableName> = Tables[T]['Update'];

/**
 * Reads pass through addAliases() which injects created_date / updated_date
 * mirrors of created_at / updated_at. The DB schema does not expose those
 * columns, but every call site reads them, so the public row type widens
 * to include them.
 */
export type RowWithAliases<T extends TableName> = Row<T> & {
  created_date?: string | null;
  updated_date?: string | null;
};

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

const mapColumn = (col: string): string => COLUMN_MAP[col] || col;

/**
 * After fetching, add legacy aliases to each record so UI code
 * reading `record.created_date` still works.
 */
const addAliases = <R>(record: R, tableName?: string): R => {
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

const addAliasesToList = <R>(rows: R[] | null | undefined, tableName?: string): R[] =>
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
const normalizeIdArray = (v: unknown): string[] => {
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
const normalizeJsonbArray = (v: unknown): unknown[] => {
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
 * Parse legacy sort string ("-column" = descending, "column" = ascending)
 */
const parseSortBy = (sortBy?: string | null): { column: string; ascending: boolean } | null => {
  if (!sortBy) return null;
  const desc = sortBy.startsWith('-');
  const column = mapColumn(desc ? sortBy.slice(1) : sortBy);
  return { column, ascending: !desc };
};

/**
 * Build a filtered Supabase query from a legacy conditions object.
 * Supports:
 *   - Simple equality: { status: 'Open' }
 *   - IN-array:        { status: ['Open', 'Closed'] }
 *   - Range operators: { 'scheduled_date.gte': '2024-01-01' }
 *   - NULL checks:     { assigned_to: null } → .is('assigned_to', null)
 */
const RANGE_OPS: Record<string, string> = {
  gte: 'gte', gt: 'gt', lte: 'lte', lt: 'lt', neq: 'neq', like: 'like', ilike: 'ilike',
};

export type Conditions = Record<string, unknown>;

// The Postgrest filter-builder type is structural and parameterised by every
// table generic. Typing it cleanly here would force every helper to thread
// 5 generics for zero runtime benefit — `any` for the builder is the
// pragmatic choice; the public surface (createEntityClient) is fully typed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryBuilder = any;

// Calling supabase.from() inside a function generic over `T extends TableName`
// trips the table-literal overload (TS won't propagate the constraint cleanly
// through the union of 57 string literals). We re-type from() through an
// untyped shim and rely on createEntityClient's surface to enforce shape.
const sbFrom = (table: string): QueryBuilder =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabase.from as unknown as (t: string) => any)(table);

const applyConditions = (query: QueryBuilder, conditions: Conditions = {}): QueryBuilder => {
  for (const [key, value] of Object.entries(conditions)) {
    if (value === undefined) continue;

    // Check for operator suffix: "field.gte" → { field: col, op: 'gte' }
    const dotIdx = key.lastIndexOf('.');
    if (dotIdx > 0) {
      const opName = key.slice(dotIdx + 1);
      if (RANGE_OPS[opName]) {
        const col = mapColumn(key.slice(0, dotIdx));
        query = query[opName](col, value);
        continue;
      }
    }

    const col = mapColumn(key);
    if (value === null) {
      query = query.is(col, null);
    } else if (Array.isArray(value)) {
      query = query.in(col, value);
    } else {
      query = query.eq(col, value);
    }
  }
  return query;
};

type SupabaseErrorLike = {
  message?: string;
  details?: string;
  code?: string;
  hint?: string;
  status?: number;
};

/**
 * Wrap a Supabase error with context about which table/operation failed.
 */
class SupabaseOperationError extends Error {
  table: string;
  operation: string;
  code: string | undefined;
  details: string | undefined;
  hint: string | undefined;
  status: number | null;

  constructor(table: string, operation: string, originalError: SupabaseErrorLike | unknown) {
    const orig = (originalError ?? {}) as SupabaseErrorLike;
    const msg = orig.message || orig.details || String(originalError);
    super(`[${table}.${operation}] ${msg}`);
    this.name = 'SupabaseOperationError';
    this.table = table;
    this.operation = operation;
    this.code = orig.code;
    this.details = orig.details;
    this.hint = orig.hint;
    // Propagate HTTP status for smart retry logic (400 = bad column, 404 = missing table)
    this.status = orig.code === 'PGRST204' ? 404
      : msg.includes('does not exist') ? 400
      : orig.status ?? null;
  }
}

// ─── Entity factory ───────────────────────────────────────────────────────────

/**
 * Tables that have soft-delete columns (is_deleted, deleted_at).
 * list() and filter() will auto-exclude deleted rows unless explicitly included.
 */
const SOFT_DELETE_TABLES = new Set<string>([
  // Project roots anchor child records and audit logs, so UI deletes archive.
  'projects',
  'rfis', 'change_orders', 'deliveries', 'work_packages',
  'documents', 'drawings', 'drawing_sets', 'expenses', 'inspections',
  'punchlist_items', 'safety_incidents', 'scope_items',
  'sov_items', 'contacts', 'meetings', 'model_elements',
  'submittals', 'submittal_rounds', 'submittal_sheet_responses', 'comments',
  'document_folders',
  // Field overhaul (migration field_overhaul_soft_delete_and_fks)
  // added is_deleted/deleted_at to these three. Once registered here
  // the entity client auto-filters list/filter/get and turns delete()
  // into a soft-delete — matching the Procurement/Budget Hours pattern.
  'daily_logs', 'photos', 'quality_control_records',
  // 062 / 064: project-scoped tables that ship with soft-delete columns
  // by default. Registering here makes list/filter/get auto-skip
  // tombstoned rows and routes delete() through the is_deleted flag.
  'budget_hour_items', 'risks',
  // Email integration: messages support soft-delete for audit trail.
  'email_messages',
  // Document Storage integration: linked folders and import queue.
  'linked_folders', 'document_import_queue',
]);

/**
 * Tables whose rows only make business sense when their parent project is
 * still active. This protects portfolio/global reads from orphaned child rows
 * after a project archive: KPIs, work packages, RFIs, costs, field records,
 * and document records all disappear with their project root.
 */
const PROJECT_SCOPED_TABLES = new Set<string>([
  'rfis', 'cost_codes', 'work_packages', 'drawings', 'drawing_sets',
  'change_orders', 'change_requests', 'schedule_tasks', 'expenses',
  'deliveries', 'sov_items', 'contacts', 'daily_logs', 'meetings',
  'action_items', 'inspections', 'photos', 'punchlist_items',
  'quality_control_records', 'safety_incidents', 'production_notes',
  'warranties', 'resources', 'look_ahead', 'documents', 'document_folders',
  'model_elements',
  'activities', 'uploaded_files', 'scope_items', 'alerts',
  'pma_assumptions', 'pma_decisions', 'pma_audit_logs', 'project_closeout',
  'project_handoff_items', 'mitigation_logs', 'mitigation_actions',
  'drawing_activity', 'drawing_revisions', 'drawing_zones', 'drawing_links',
  'drawing_signoffs', 'task_dependencies', 'submittals', 'submittal_rounds',
  'submittal_sheet_responses', 'submittal_activity', 'comments',
  'budget_hour_items', 'risks',
  // Email integration: all three tables are project-scoped.
  'email_accounts', 'email_messages', 'email_attachments',
  // Document Storage integration: linked folders + import queue.
  'linked_folders', 'document_import_queue',
]);

const projectScopedSelect = (tableName: string): string =>
  PROJECT_SCOPED_TABLES.has(tableName)
    ? '*, projects!inner(id)'
    : '*';

const applyLiveProjectScope = (query: QueryBuilder, tableName: string): QueryBuilder =>
  PROJECT_SCOPED_TABLES.has(tableName)
    ? query.eq('projects.is_deleted', false)
    : query;

// Project archival is server-side + atomic: the soft_delete_project RPC
// (migration 20260620030000) soft-deletes every project-scoped child + the
// project root in ONE transaction, admin-gated. The former client-side
// softDeleteProjectChildren / PROJECT_CHILD_SOFT_DELETE_TABLES were a
// non-transactional Promise.all that could leave a project half-archived (#13)
// and have been removed — see entities.Project.delete below.

/**
 * Strip undefined values and camelCase keys (Postgres uses snake_case only).
 * Also strip the virtual alias fields that addAliases() injects after reads
 * (created_date, updated_date) — they are not real DB columns and will cause
 * a PostgREST "column not found" error if sent back on update/create.
 */
const VIRTUAL_FIELDS = new Set(['created_date', 'updated_date', 'projects']);
const cleanRecord = (record: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(record)
      .filter(
        ([k, v]) => v !== undefined && !/[A-Z]/.test(k) && !VIRTUAL_FIELDS.has(k) && !k.startsWith('_')
      )
      .map(([k, v]) => [k, v === '' ? null : v])
  );

export type EntityClient<T extends TableName> = {
  list: (sortBy?: string) => Promise<Array<RowWithAliases<T>>>;
  /** Like list() but PAGINATES to completeness — no silent DEFAULT_LIST_LIMIT
   *  cap. For portfolio/dashboard reads that span all projects and can outgrow
   *  the cap as a tenant grows (CommandCenter / AIInsights). */
  listAll: (sortBy?: string) => Promise<Array<RowWithAliases<T>>>;
  filter: (conditions?: Conditions, sortBy?: string, limit?: number) => Promise<Array<RowWithAliases<T>>>;
  get: (id: string) => Promise<RowWithAliases<T>>;
  create: (record: Insert<T>) => Promise<RowWithAliases<T>>;
  update: (id: string, updates: Update<T>) => Promise<RowWithAliases<T>>;
  delete: (id: string) => Promise<{ success: true }>;
  bulkCreate: (records: Insert<T>[]) => Promise<Array<RowWithAliases<T>>>;
};

// Default row cap for list()/filter() when the caller passes no explicit limit.
// PostgREST already enforces a server-side max-rows ceiling (≈1000), so an
// uncapped read silently truncates with no signal. Applying an explicit default
// makes the bound intentional, consistent with the centralized hooks
// (useDrawings/useSubmittals pass 2000), and lets us warn on likely truncation
// in dev. Callers needing more must paginate or filter server-side.
// Exported so the UI (e.g. ListTruncationNotice) can surface the SAME number it
// caps at — single source of truth for "showing the first N" messaging.
export const LIST_ROW_CAP = 2000;
const DEFAULT_LIST_LIMIT = LIST_ROW_CAP;

// Dev-only: warn when a read comes back at the cap (likely truncated) so the
// silent-1000-row failure mode surfaces during development.
const warnIfTruncated = (tableName: string, op: string, count: number, cap: number) => {
  if (import.meta.env.DEV && count >= cap) {
    // eslint-disable-next-line no-console
    console.warn(
      `[supabaseClient] ${tableName}.${op}() returned ${count} rows at the ${cap}-row cap — results may be TRUNCATED. Add server-side filtering or pagination.`,
    );
  }
};

const createEntityClient = <T extends TableName>(tableName: T): EntityClient<T> => ({
  /**
   * List all records, optionally sorted.
   * Auto-excludes soft-deleted rows.
   */
  list: async (sortBy) => {
    let q: QueryBuilder = (sbFrom(tableName)).select(projectScopedSelect(tableName as string));
    q = applyLiveProjectScope(q, tableName as string);
    // Soft-delete filter
    if (SOFT_DELETE_TABLES.has(tableName as string)) {
      q = q.eq('is_deleted', false);
    }
    // Projects: auto-exclude on-hold (paused) projects from every list. The
    // /Projects management page bypasses this by querying via the raw
    // supabase client; everywhere else gets the active subset automatically.
    if ((tableName as string) === 'projects') {
      q = q.eq('on_hold', false);
    }
    const sort = parseSortBy(sortBy);
    if (sort) {
      q = q.order(sort.column, { ascending: sort.ascending });
    } else {
      q = q.order('created_at', { ascending: false });
    }
    q = q.limit(DEFAULT_LIST_LIMIT);
    const { data, error } = await q;
    if (error) throw new SupabaseOperationError(tableName as string, 'list', error);
    warnIfTruncated(tableName as string, 'list', data?.length ?? 0, DEFAULT_LIST_LIMIT);
    return addAliasesToList<RowWithAliases<T>>(data, tableName as string);
  },

  /**
   * Like list() but pages through ALL matching rows via .range() instead of one
   * capped read — so portfolio-wide dashboards (CommandCenter / AIInsights) don't
   * silently truncate at DEFAULT_LIST_LIMIT as a tenant grows. The primary sort
   * plus an `id` tiebreaker keeps page boundaries stable (no dropped/dup rows).
   */
  listAll: async (sortBy) => {
    const PAGE = 1000;
    const SAFETY_MAX_ROWS = 100_000;
    const sort = parseSortBy(sortBy);
    const all: Array<RowWithAliases<T>> = [];
    for (let offset = 0; offset < SAFETY_MAX_ROWS; offset += PAGE) {
      let q: QueryBuilder = (sbFrom(tableName)).select(projectScopedSelect(tableName as string));
      q = applyLiveProjectScope(q, tableName as string);
      if (SOFT_DELETE_TABLES.has(tableName as string)) q = q.eq('is_deleted', false);
      if ((tableName as string) === 'projects') q = q.eq('on_hold', false);
      if (sort) q = q.order(sort.column, { ascending: sort.ascending });
      else q = q.order('created_at', { ascending: false });
      q = q.order('id', { ascending: true }).range(offset, offset + PAGE - 1);
      const { data, error } = await q;
      if (error) throw new SupabaseOperationError(tableName as string, 'listAll', error);
      all.push(...addAliasesToList<RowWithAliases<T>>(data, tableName as string));
      if (!data || data.length < PAGE) return all;
    }
    // Hit the safety ceiling — surface in PROD too (unlike list()'s dev-only warn).
    // eslint-disable-next-line no-console
    console.warn(`[supabaseClient] ${tableName}.listAll() stopped at the ${SAFETY_MAX_ROWS}-row safety cap — data may be incomplete.`);
    return all;
  },

  /**
   * Filter records by conditions.
   */
  filter: async (conditions = {}, sortBy, limit) => {
    let q: QueryBuilder = (sbFrom(tableName)).select(projectScopedSelect(tableName as string));
    q = applyLiveProjectScope(q, tableName as string);
    // Soft-delete filter (unless caller explicitly filters is_deleted)
    if (SOFT_DELETE_TABLES.has(tableName as string) && !('is_deleted' in conditions)) {
      q = q.eq('is_deleted', false);
    }
    // Projects: auto-exclude on-hold unless the caller explicitly filters on_hold.
    if ((tableName as string) === 'projects' && !('on_hold' in conditions)) {
      q = q.eq('on_hold', false);
    }
    q = applyConditions(q, conditions);
    const sort = parseSortBy(sortBy);
    if (sort) {
      q = q.order(sort.column, { ascending: sort.ascending });
    } else {
      q = q.order('created_at', { ascending: false });
    }
    const effectiveLimit = limit ?? DEFAULT_LIST_LIMIT;
    q = q.limit(effectiveLimit);
    const { data, error } = await q;
    if (error) throw new SupabaseOperationError(tableName as string, 'filter', error);
    warnIfTruncated(tableName as string, 'filter', data?.length ?? 0, effectiveLimit);
    return addAliasesToList<RowWithAliases<T>>(data, tableName as string);
  },

  /**
   * Get a single record by id.
   *
   * Soft-delete aware. list() and filter() already skip rows where
   * is_deleted=true; get() used to bypass that filter, which meant a UI
   * that re-fetched a record after soft-delete (edit modal, detail
   * drawer) could resurrect the tombstoned row. A deleted row now
   * surfaces as a normal "row not found" error — callers already handle
   * SupabaseOperationError, so no call-site changes are needed.
   */
  get: async (id) => {
    let q: QueryBuilder = (sbFrom(tableName)).select(projectScopedSelect(tableName as string));
    q = applyLiveProjectScope(q, tableName as string).eq('id', id);
    if (SOFT_DELETE_TABLES.has(tableName as string)) {
      q = q.eq('is_deleted', false);
    }
    const { data, error } = await q.single();
    if (error) throw new SupabaseOperationError(tableName as string, 'get', error);
    return addAliases<RowWithAliases<T>>(data, tableName as string);
  },

  /**
   * Create a new record. Returns the created record with its generated id.
   *
   * We strip `id`, `created_at`, and `updated_at` before insert so a form
   * that accidentally reused an existing row's state (e.g. an edit modal
   * left open and re-submitted as a create) can't trigger a primary-key
   * collision. The DB assigns id/timestamps via its defaults.
   */
  create: async (record) => {
    const clean = cleanRecord(record as Record<string, unknown>);
    delete clean.id;
    delete clean.created_at;
    delete clean.updated_at;
    const { data, error } = await (sbFrom(tableName))
      .insert(clean)
      .select()
      .single();
    if (error) throw new SupabaseOperationError(tableName as string, 'create', error);
    return addAliases<RowWithAliases<T>>(data, tableName as string);
  },

  /**
   * Update an existing record by id.
   */
  update: async (id, updates) => {
    const clean = cleanRecord(updates as Record<string, unknown>);
    // Never send primary key or server timestamps in the update body
    delete clean.id;
    delete clean.created_at;
    // updated_at is now handled by the DB trigger (trg_updated_at),
    // but we keep the client-side set for backwards compat
    const { data, error } = await (sbFrom(tableName))
      .update({ ...clean, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new SupabaseOperationError(tableName as string, 'update', error);
    return addAliases<RowWithAliases<T>>(data, tableName as string);
  },

  /**
   * Soft-delete a record if supported, otherwise hard-delete.
   */
  delete: async (id) => {
    if (SOFT_DELETE_TABLES.has(tableName as string)) {
      const { error } = await (sbFrom(tableName))
        .update({ is_deleted: true, deleted_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw new SupabaseOperationError(tableName as string, 'delete', error);
    } else {
      const { error } = await (sbFrom(tableName))
        .delete()
        .eq('id', id);
      if (error) throw new SupabaseOperationError(tableName as string, 'delete', error);
    }
    return { success: true };
  },

  /**
   * Bulk create multiple records. Same id/timestamp stripping as create().
   */
  bulkCreate: async (records) => {
    const cleaned = records.map((r) => {
      const c = cleanRecord(r as Record<string, unknown>);
      delete c.id;
      delete c.created_at;
      delete c.updated_at;
      return c;
    });
    const { data, error } = await (sbFrom(tableName))
      .insert(cleaned)
      .select();
    if (error) throw new SupabaseOperationError(tableName as string, 'bulkCreate', error);
    return addAliasesToList<RowWithAliases<T>>(data, tableName as string);
  },
});

// ─── Entity registry ──────────────────────────────────────────────────────────

export const entities = {
  // Project creation goes through an RPC to atomically insert the project
  // and the creator's owner membership row in a single SECURITY DEFINER call,
  // bypassing the RLS bootstrap problem with the AFTER trigger approach.
  Project: {
    ...createEntityClient('projects'),
    create: async (record: Insert<'projects'>): Promise<RowWithAliases<'projects'>> => {
      const clean = Object.fromEntries(
        Object.entries(record as Record<string, unknown>).filter(([, v]) => v !== undefined)
      );
      const { data, error } = await supabase.rpc('create_project', {
        project_data: clean as never,
      });
      if (error) throw new SupabaseOperationError('projects', 'create', error);
      return addAliases<RowWithAliases<'projects'>>(data as RowWithAliases<'projects'>, 'projects');
    },
    delete: async (id: string): Promise<{ success: true }> => {
      // Atomic, admin-gated archive: the RPC soft-deletes every project-scoped
      // child + the project root in one transaction, so the project can never be
      // left half-archived (#13). Replaces the old best-effort multi-step delete.
      const { error } = await supabase.rpc('soft_delete_project', { p_project_id: id });
      if (error) throw new SupabaseOperationError('projects', 'delete', error);
      return { success: true };
    },
  },
  RFI:                   createEntityClient('rfis'),
  Drawing:               createEntityClient('drawings'),
  DrawingActivity:       createEntityClient('drawing_activity'),
  DrawingSet: {
    ...createEntityClient('drawing_sets'),
    /**
     * Soft-delete a set AND cascade-soft-delete every child sheet, in a single
     * transaction. Returns the number of child sheets that were deleted.
     * Uses the `delete_drawing_set(p_set_id)` RPC shipped in migration 022.
     */
    deleteCascade: async (id: string): Promise<{ success: true; deletedChildCount: number }> => {
      const { data, error } = await supabase.rpc('delete_drawing_set', { p_set_id: id });
      if (error) throw new SupabaseOperationError('drawing_sets', 'deleteCascade', error);
      return { success: true, deletedChildCount: (data as number | null) ?? 0 };
    },
  },
  ChangeOrder:           createEntityClient('change_orders'),
  ChangeRequest:         createEntityClient('change_requests'),
  // ── Drawing-centered execution (MVP Slice 0) ────────────────────
  // Three tables that turn the Drawing Viewer into a coordination hub:
  // every rectangular zone on a sheet revision can link to RFIs, work
  // packages, deliveries, photos, inspections, etc. via a polymorphic
  // join. RLS gates all three on user_has_project_access(project_id).
  DrawingRevision:       createEntityClient('drawing_revisions'),
  DrawingZone:           createEntityClient('drawing_zones'),
  DrawingLink:           createEntityClient('drawing_links'),
  // ── Drawing control module (20260526240000) ─────────────────────
  // Document-control layer on top of drawings/drawing_revisions: transmittal
  // log, role-based review gates, assignable impacts, markups, and watchers.
  // All project-scoped via user_has_project_access(project_id); the register
  // grid reads the drawing_register_view + the publish_drawing_revision RPC.
  DrawingTransmittal:     createEntityClient('drawing_transmittals'),
  DrawingTransmittalItem: createEntityClient('drawing_transmittal_items'),
  DrawingReview:          createEntityClient('drawing_reviews'),
  DrawingImpact:          createEntityClient('drawing_impacts'),
  DrawingMarkup:          createEntityClient('drawing_markups'),
  DrawingWatcher:         createEntityClient('drawing_watchers'),
  // 072: append-only sign-off stamps on drawing revisions (review approval,
  // approved-as-noted, revise-and-resubmit, etc.). Voided rows stay in the
  // table; UI filters them with is_voided=false in listSignoffs.
  DrawingSignoff:        createEntityClient('drawing_signoffs'),
  ScheduleTask:          (() => {
    // Schedule audit fix (bug class 3): keep status and percent_complete in
    // lock-step on every create/update so no future code path can land a row
    // where status='Complete' & percent_complete<100, or status='Not Started'
    // & percent_complete>0. The DB also has a CHECK constraint enforcing this
    // (migration: schedule_status_pct_consistency), but normalising here gives
    // friendlier UX (a slider drag to 100% silently flips status to Complete)
    // and avoids round-trip 400 errors. Existing bad rows are NOT auto-fixed.
    const base = createEntityClient('schedule_tasks');
    const STATUS_VALUES = new Set([
      'Not Started', 'In Progress', 'Complete', 'Delayed', 'On Hold', 'Cancelled',
    ]);
    const normalizeFields = (fields: Record<string, unknown> = {}): Record<string, unknown> => {
      const out: Record<string, unknown> = { ...fields };
      const hasStatus = Object.prototype.hasOwnProperty.call(out, 'status');
      const hasPct    = Object.prototype.hasOwnProperty.call(out, 'percent_complete');

      for (const field of ['start_date', 'end_date']) {
        if (Object.prototype.hasOwnProperty.call(out, field) && out[field] === '') {
          out[field] = null;
        }
      }

      if (hasPct) {
        const n = Number(out.percent_complete);
        if (Number.isFinite(n)) out.percent_complete = Math.max(0, Math.min(100, n));
      }
      if (hasStatus && !STATUS_VALUES.has(out.status as string)) {
        // Unrecognised status — leave it alone, server CHECK will reject.
      }

      // Reconciliation rules — explicit caller intent wins; we only fill
      // gaps where the caller set ONE side of the pair without the other.
      if (hasStatus && !hasPct) {
        if (out.status === 'Complete')    out.percent_complete = 100;
        if (out.status === 'Not Started') out.percent_complete = 0;
        // 'In Progress' / 'Delayed' / 'On Hold' don't pin a value — keep DB current
      } else if (hasPct && !hasStatus) {
        const pct = out.percent_complete as number;
        if (pct >= 100)      out.status = 'Complete';
        else if (pct > 0)    out.status = 'In Progress';
        else                 out.status = 'Not Started';
      } else if (hasStatus && hasPct) {
        // Both supplied — coerce contradictions into the canonical pair so
        // bad inputs land cleanly instead of failing the CHECK constraint.
        const pct = out.percent_complete as number;
        if (out.status === 'Complete' && pct < 100) {
          out.percent_complete = 100;
        } else if (out.status === 'Not Started' && pct > 0) {
          out.percent_complete = 0;
        } else if (out.status === 'In Progress' && pct >= 100) {
          out.percent_complete = 99;
        }
      }

      // Cross-module link arrays (migration 055). Each is an optional
      // array of UUID strings pointing at rfis / change_orders / action_items.
      // Normalise to a clean array on write so a bad value (null, undefined,
      // a stringified JSON blob, an array with nulls) lands as a well-formed
      // JSONB array — matches the dependencies-array round-trip pattern.
      const ID_ARRAY_FIELDS = [
        'related_rfi_ids',
        'related_change_order_ids',
        'related_action_item_ids',
      ];
      for (const field of ID_ARRAY_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(out, field)) {
          out[field] = normalizeIdArray(out[field]);
        }
      }

      // Predecessor link validation. Migration 054 upgraded the
      // schedule_tasks.dependencies element shape from bare UUID strings
      // to {id, type, lag_days}. We don't want any future code path to
      // land a row with a malformed value (an unknown link type, a
      // non-integer lag, an array containing nulls, etc.) — the cascade
      // would silently fall back to FS+1 on read, but the data on disk
      // would be quietly wrong. Round-trip through parse + serialize:
      // parse normalises legacy id-string shape AND tolerates partial
      // objects; serialize rejects unrecognised link types with a real
      // error so a programming bug surfaces loudly instead of being
      // papered over.
      if (Object.prototype.hasOwnProperty.call(out, 'dependencies')) {
        const raw = out.dependencies;
        if (raw == null || raw === '') {
          out.dependencies = null;
        } else {
          // Tolerate the writer passing either an array or a JSON string;
          // parseScheduleDependencies handles both.
          try {
            const links = parseScheduleDependencies(raw);
            out.dependencies = serializeScheduleDependencies(links);
          } catch (err: unknown) {
            const msg = (err as { message?: string } | undefined)?.message ?? String(err);
            // Re-throw with context so the caller sees which task failed
            // and which value they tried to land.
            throw new Error(
              `ScheduleTask: invalid dependencies value (${msg}): ${
                typeof raw === 'string' ? raw : JSON.stringify(raw)
              }`
            );
          }
        }
      }
      return out;
    };
    // Read-side coercion. Postgres returns JSONB as a parsed array in the
    // happy path, but defensive normalisation here means the TaskDetailDrawer
    // and any cross-link query can treat these fields as `string[]` without
    // each caller defending against a stringified/null value. Mirrors the
    // dependencies-array tolerance pattern.
    const normalizeReadRow = <R>(row: R): R => {
      if (!row || typeof row !== 'object') return row;
      const out = { ...(row as Record<string, unknown>) };
      if ('related_rfi_ids' in out)          out.related_rfi_ids          = normalizeIdArray(out.related_rfi_ids);
      if ('related_change_order_ids' in out) out.related_change_order_ids = normalizeIdArray(out.related_change_order_ids);
      if ('related_action_item_ids' in out)  out.related_action_item_ids  = normalizeIdArray(out.related_action_item_ids);
      return out as R;
    };
    const normalizeReadList = <R>(rows: R[] | null | undefined): R[] => (rows || []).map(normalizeReadRow);
    return {
      ...base,
      list:       async (...args: Parameters<typeof base.list>)  => normalizeReadList(await base.list(...args)),
      filter:     async (...args: Parameters<typeof base.filter>) => normalizeReadList(await base.filter(...args)),
      get:        async (...args: Parameters<typeof base.get>)    => normalizeReadRow(await base.get(...args)),
      create:     (record: Insert<'schedule_tasks'>) =>
        base.create(normalizeFields(record as Record<string, unknown>) as Insert<'schedule_tasks'>),
      update:     (id: string, updates: Update<'schedule_tasks'>) =>
        base.update(id, normalizeFields(updates as Record<string, unknown>) as Update<'schedule_tasks'>),
      bulkCreate: (records: Insert<'schedule_tasks'>[]) =>
        base.bulkCreate(
          (records || []).map((r) => normalizeFields(r as Record<string, unknown>) as Insert<'schedule_tasks'>)
        ),
    };
  })(),
  TaskDependency:        createEntityClient('task_dependencies'),
  Submittal:             createEntityClient('submittals'),
  SubmittalRound:        createEntityClient('submittal_rounds'),
  SubmittalSheetResponse: createEntityClient('submittal_sheet_responses'),
  SubmittalActivity:     createEntityClient('submittal_activity'),
  Comment:               createEntityClient('comments'),
  Expense:               createEntityClient('expenses'),
  Delivery:              createEntityClient('deliveries'),
  WorkPackage:           createEntityClient('work_packages'),
  // 062: per-project budget vs actual hours (Estimating Kickoff scope items).
  BudgetHourItem:        createEntityClient('budget_hour_items'),
  // 064: per-project risk register backing the four Risk reports
  // (list, dashboard, 5x5 matrix, top-10). Severity is a stored
  // generated column on the row — callers can sort/filter it without
  // re-deriving the probability * impact band in three places.
  Risk:                  createEntityClient('risks'),
  SOVItem:               createEntityClient('sov_items'),
  Vendor:                createEntityClient('vendors'),
  Contact:               createEntityClient('contacts'),
  DailyLog:              (() => {
    // Migration 053 added two id-array JSONB columns
    // (related_action_item_ids, related_rfi_ids) for cross-module linking.
    // The pre-existing `photos` column (migration 001) is also a JSONB
    // array — but of {file_url, name, uploaded_at} objects, not id strings,
    // so it goes through normalizeJsonbArray (no element-validation) instead
    // of normalizeIdArray. Mirrors the ScheduleTask wrapper shape so all
    // consumers can treat these fields as arrays without the inline asArray
    // dance every form / list does today.
    const base = createEntityClient('daily_logs');
    const ID_ARRAY_FIELDS = ['related_action_item_ids', 'related_rfi_ids'];
    const OBJECT_ARRAY_FIELDS = ['photos'];
    const normalizeFields = (fields: Record<string, unknown> = {}): Record<string, unknown> => {
      const out: Record<string, unknown> = { ...fields };
      for (const field of ID_ARRAY_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(out, field)) {
          out[field] = normalizeIdArray(out[field]);
        }
      }
      for (const field of OBJECT_ARRAY_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(out, field)) {
          out[field] = normalizeJsonbArray(out[field]);
        }
      }
      return out;
    };
    const normalizeReadRow = <R>(row: R): R => {
      if (!row || typeof row !== 'object') return row;
      const out = { ...(row as Record<string, unknown>) };
      for (const field of ID_ARRAY_FIELDS) {
        if (field in out) out[field] = normalizeIdArray(out[field]);
      }
      for (const field of OBJECT_ARRAY_FIELDS) {
        if (field in out) out[field] = normalizeJsonbArray(out[field]);
      }
      return out as R;
    };
    const normalizeReadList = <R>(rows: R[] | null | undefined): R[] => (rows || []).map(normalizeReadRow);
    return {
      ...base,
      list:       async (...args: Parameters<typeof base.list>)  => normalizeReadList(await base.list(...args)),
      filter:     async (...args: Parameters<typeof base.filter>) => normalizeReadList(await base.filter(...args)),
      get:        async (...args: Parameters<typeof base.get>)    => normalizeReadRow(await base.get(...args)),
      create:     (record: Insert<'daily_logs'>) =>
        base.create(normalizeFields(record as Record<string, unknown>) as Insert<'daily_logs'>),
      update:     (id: string, updates: Update<'daily_logs'>) =>
        base.update(id, normalizeFields(updates as Record<string, unknown>) as Update<'daily_logs'>),
      bulkCreate: (records: Insert<'daily_logs'>[]) =>
        base.bulkCreate(
          (records || []).map((r) => normalizeFields(r as Record<string, unknown>) as Insert<'daily_logs'>)
        ),
    };
  })(),
  Meeting:               createEntityClient('meetings'),
  ActionItem:            createEntityClient('action_items'),
  Inspection:            createEntityClient('inspections'),
  Photo:                 createEntityClient('photos'),
  PunchlistItem:         (() => {
    // Migration 053 added a JSONB `photos` column (array of
    // {file_url, name, uploaded_at} objects, matching daily_logs.photos
    // shape). Normalise on the entity boundary so the form / list don't
    // need to defend with inline asArray — same pattern as DailyLog.
    const base = createEntityClient('punchlist_items');
    const OBJECT_ARRAY_FIELDS = ['photos'];
    const normalizeFields = (fields: Record<string, unknown> = {}): Record<string, unknown> => {
      const out: Record<string, unknown> = { ...fields };
      for (const field of OBJECT_ARRAY_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(out, field)) {
          out[field] = normalizeJsonbArray(out[field]);
        }
      }
      return out;
    };
    const normalizeReadRow = <R>(row: R): R => {
      if (!row || typeof row !== 'object') return row;
      const out = { ...(row as Record<string, unknown>) };
      for (const field of OBJECT_ARRAY_FIELDS) {
        if (field in out) out[field] = normalizeJsonbArray(out[field]);
      }
      return out as R;
    };
    const normalizeReadList = <R>(rows: R[] | null | undefined): R[] => (rows || []).map(normalizeReadRow);
    return {
      ...base,
      list:       async (...args: Parameters<typeof base.list>)  => normalizeReadList(await base.list(...args)),
      filter:     async (...args: Parameters<typeof base.filter>) => normalizeReadList(await base.filter(...args)),
      get:        async (...args: Parameters<typeof base.get>)    => normalizeReadRow(await base.get(...args)),
      create:     (record: Insert<'punchlist_items'>) =>
        base.create(normalizeFields(record as Record<string, unknown>) as Insert<'punchlist_items'>),
      update:     (id: string, updates: Update<'punchlist_items'>) =>
        base.update(id, normalizeFields(updates as Record<string, unknown>) as Update<'punchlist_items'>),
      bulkCreate: (records: Insert<'punchlist_items'>[]) =>
        base.bulkCreate(
          (records || []).map((r) => normalizeFields(r as Record<string, unknown>) as Insert<'punchlist_items'>)
        ),
    };
  })(),
  QualityControlRecord:  createEntityClient('quality_control_records'),
  SafetyIncident:        createEntityClient('safety_incidents'),
  ProductionNote:        createEntityClient('production_notes'),
  Warranty:              createEntityClient('warranties'),
  Resource:              createEntityClient('resources'),
  LookAhead:             createEntityClient('look_ahead'),
  Document:              createEntityClient('documents'),
  DocumentFolder:        createEntityClient('document_folders'),
  Activity:              createEntityClient('activities'),
  UploadedFile:          createEntityClient('uploaded_files'),
  ScopeItem:             createEntityClient('scope_items'),
  Alert:                 createEntityClient('alerts'),
  ModelElement:          createEntityClient('model_elements'),
  CostCode:              createEntityClient('cost_codes'),
  DefaultCostCode:       createEntityClient('default_cost_codes'),
  ProjectCloseout:       createEntityClient('project_closeout'),
  ProjectHandoffItem:    createEntityClient('project_handoff_items'),
  PmaDecision:           createEntityClient('pma_decisions'),
  PmaAssumption:         createEntityClient('pma_assumptions'),
  PmaAuditLog:           createEntityClient('pma_audit_logs'),
  User:                  createEntityClient('user_profiles'),
  // RBAC Phase C: per-project membership rows. Roles enforced by DB CHECK
  // (owner/admin/pm/field/viewer). Writes are gated by RLS — only project
  // admins or system admins can insert/update/delete here.
  UserProject:           createEntityClient('user_projects'),
  MitigationLog:         createEntityClient('mitigation_logs'),
  MitigationAction:      createEntityClient('mitigation_actions'),
  // 078: lightweight homegrown feature flags. Read by every authenticated
  // user (RLS is permissive on SELECT); writes are gated client-side via
  // the AdminRoute on FeatureFlagsAdmin and the isAdmin check in
  // useAppSecurity.
  FeatureFlag:           createEntityClient('feature_flags'),
  // Email integration: inbound email processing pipeline.
  // email_accounts: per-project mailbox connections (manual forward / OAuth).
  // email_messages: cached/parsed inbound emails with triage status.
  // email_attachments: files extracted from parsed emails with dedup hash.
  EmailAccount:          createEntityClient('email_accounts'),
  EmailMessage:          createEntityClient('email_messages'),
  EmailAttachment:       createEntityClient('email_attachments'),
  // Document Storage integration
  LinkedFolder:          createEntityClient('linked_folders'),
  DocumentImportQueue:   createEntityClient('document_import_queue'),
};

export type Entities = typeof entities;
export type EntityKey = keyof Entities;

// ─── Auth ─────────────────────────────────────────────────────────────────────

export type AuthMeResult = {
  id: string;
  email: string | undefined;
  full_name: string;
  role: string;
  [key: string]: unknown;
};

/**
 * Server-authoritative role for a user — always from `user_profiles.role`,
 * never the client-writable user_metadata. Falls back to 'user' on any error.
 */
async function fetchProfileRole(userId: string): Promise<string> {
  try {
    const { data } = await supabase.from('user_profiles').select('role').eq('id', userId).maybeSingle();
    const r = (data as { role?: unknown } | null)?.role;
    return (typeof r === 'string' && r) || 'user';
  } catch {
    return 'user';
  }
}

export const auth = {
  /**
   * Get the currently authenticated user.
   * Returns a user object compatible with what the legacy backend returned.
   */
  me: async (): Promise<AuthMeResult> => {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    if (!user) throw new Error('Not authenticated');
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const fullName =
      (typeof meta.full_name === 'string' && meta.full_name) ||
      (typeof meta.name === 'string' && meta.name) ||
      user.email ||
      '';
    // role from user_profiles (server-authoritative), NOT client-writable meta;
    // strip privilege keys and set the authoritative fields last.
    const role = await fetchProfileRole(user.id);
    return {
      ...stripPrivilegeMeta(meta),
      id: user.id,
      email: user.email,
      full_name: fullName,
      role,
    };
  },

  /**
   * Sign in with email and password.
   */
  loginViaEmailPassword: async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      const e = new Error(error.message) as Error & { status?: number };
      e.status = error.status;
      throw e;
    }
    return data;
  },

  /**
   * Sign out the current user.
   */
  logout: async (): Promise<void> => {
    await supabase.auth.signOut();
  },

  /**
   * Redirect to the login surface.
   * There is no `/login` route — when unauthenticated, the Landing page (`/`)
   * IS the login surface (AuthenticatedApp renders the sign-in form there), so
   * navigate to `/` rather than a nonexistent `/login` (which would 404 / fall
   * through to the catch-all).
   */
  redirectToLogin: (url?: string): void => {
    const redirect = url ? `?redirect=${encodeURIComponent(url)}` : '';
    window.location.href = `/${redirect}`;
  },

  /**
   * Update the current user's metadata.
   */
  updateMe: async (updates: Record<string, unknown>): Promise<AuthMeResult> => {
    // The Settings tabs persist their preferences as flat keys on
    // user_metadata (and `auth.me()` reads them back the same way), so we
    // can't use a fixed allow-list — that silently dropped every preference
    // and settings never saved. Instead DENY only the identity / privilege-
    // bearing keys (so a user can't escalate by writing role:"admin", etc.)
    // and allow all other (preference) keys through. Note: client admin gates
    // read meta.role only cosmetically — real authorization is server-side via
    // user_profiles.role + RLS (user_is_system_admin), which never trusts
    // user_metadata — so this is the correct boundary.
    const BLOCKED_FIELDS = new Set([
      'role', 'roles', 'is_admin', 'isAdmin', 'admin', 'permissions', 'perms',
      'id', 'user_id', 'uid', 'sub', 'email', 'email_verified', 'phone_verified',
      'aud', 'exp', 'iat', 'iss', 'app_metadata',
    ]);
    const safeUpdates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (!BLOCKED_FIELDS.has(key)) safeUpdates[key] = value;
    }
    const { data, error } = await supabase.auth.updateUser({ data: safeUpdates });
    if (error) throw error;
    const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
    const fullName =
      (typeof meta.full_name === 'string' && meta.full_name) ||
      data.user.email ||
      '';
    // role from user_profiles (server-authoritative), never the returned meta;
    // strip privilege keys and set the authoritative fields last.
    const role = await fetchProfileRole(data.user.id);
    return {
      ...stripPrivilegeMeta(meta),
      id: data.user.id,
      email: data.user.email,
      full_name: fullName,
      role,
    };
  },
};

// ─── File uploads & LLM integrations ─────────────────────────────────────────

// Signed URL expiry in seconds (1 hour). Increase if long-lived links are needed.
const SIGNED_URL_EXPIRY_SECONDS = 60 * 60;

/**
 * Get a short-lived signed URL for a stored file path.
 * Use this whenever displaying a file that was uploaded to a private bucket.
 */
export const getSignedUrl = async (storagePath: string, bucket: string = 'app-files'): Promise<string> => {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, SIGNED_URL_EXPIRY_SECONDS);
  if (error) throw error;
  return data.signedUrl;
};

// Trusted host for already-resolved (full http) file URLs: our own Supabase
// project, where signed/public storage URLs live. Stored file_url values are
// storage PATHS (verified across every file_url table: 0 rows hold a full URL),
// so the ONLY legitimate full URL is one on this host. Any other host is
// untrusted — a poisoned / user-controlled file_url must never be rendered or
// opened as a trusted project file (#20).
const TRUSTED_FILE_HOST = (() => {
  try { return new URL(env.supabaseUrl).host; } catch { return ''; }
})();

/**
 * Resolve a file_url to a usable URL.
 * If the value looks like a storage path (no protocol), generate a signed URL.
 * If it's already a full http(s) URL, return it ONLY when it's on our trusted
 * Supabase host; any other host is blocked (returns null) so a user-controlled
 * file_url can't surface arbitrary external content as a trusted project file.
 *
 * Bucket-prefixed paths ("email-attachments/<project_id>/<message_id>/<file>")
 * sign against that bucket — email attachments live in their own private
 * bucket with project-scoped RLS, so bare URLs would 400 for non-members.
 */
export const resolveFileUrl = async (fileUrl: string | null | undefined): Promise<string | null> => {
  if (!fileUrl) return null;
  if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
    let host = '';
    try { host = new URL(fileUrl).host; } catch { return null; }
    if (host && host === TRUSTED_FILE_HOST) return fileUrl;
    console.warn(`[resolveFileUrl] blocked untrusted external file URL (host: ${host || 'unparseable'})`);
    return null;
  }
  if (fileUrl.startsWith('email-attachments/')) {
    return getSignedUrl(fileUrl.slice('email-attachments/'.length), 'email-attachments');
  }
  return getSignedUrl(fileUrl);
};

export type UploadFileArgs = {
  file: File;
  /**
   * Optional workflow key (see src/lib/uploadValidation.ts). When supplied, the
   * tighter per-workflow extension allowlist + size cap is enforced. When
   * omitted, the fail-closed `default` backstop still applies (blocks dangerous
   * executable/script extensions and caps size) so no upload path is unguarded.
   */
  workflow?: UploadWorkflow;
};
export type UploadFileResult = { file_url: string; file_name: string; path: string };

export type InvokeLLMArgs = {
  prompt?: string;
  system?: string;
  messages?: Array<{ role: string; content: unknown }>;
  response_json_schema?: unknown;
  input_variables?: Record<string, unknown>;
  maxTokens?: number;
  model?: string;
  file_urls?: string[];
  files?: unknown[];
  tools?: Array<{ name: string; [key: string]: unknown }>;
  tool_choice?: unknown;
  temperature?: number;
  provider?: string;
  /**
   * LLM gateway routing key. Optional — when omitted the edge function
   * falls back to the "general" routing target. Set this to one of the
   * keys in `supabase/functions/llm-proxy/router.ts` so spend/latency
   * telemetry is grouped correctly. Common values:
   *   "drawing-analysis" "revision-compare" "sheet-extraction"
   *   "drawing-link-suggest" "shipping-ticket-import" "rfi-log-import"
   *   "photo-ocr"
   * Explicit `provider`/`model` still override the router decision.
   */
  useCase?: string;
  /** Optional, for telemetry only — surfaces per-project cost. */
  project_id?: string;
};

export type InvokeLLMResult = {
  text?: string;
  content?: string | unknown;
  tool_use?: { name: string; input: unknown } | null;
  raw?: unknown;
  protocol_version?: number;
  error?: string;
};

export const integrations = {
  Core: {
    /**
     * Upload a file to Supabase Storage (private bucket).
     * Returns { file_url, file_name, path }
     * file_url is a signed URL valid for 1 hour. For long-term storage,
     * persist `path` to the database and call getSignedUrl(path) on demand.
     */
    UploadFile: async ({ file, workflow }: UploadFileArgs): Promise<UploadFileResult> => {
      if (!file) throw new Error('No file provided');
      // Fail-closed content/size guard (#21). With a `workflow` this enforces the
      // tighter per-workflow allowlist; without one the `default` backstop still
      // blocks dangerous executable/script extensions and an absolute size
      // ceiling. Throws a user-facing message that call sites surface via their
      // existing UploadFile error handling. This is the single storage-write
      // chokepoint, so every upload path is covered.
      assertUploadAllowed(file, workflow ?? 'default');
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      // Org-scoped path so storage RLS isolates tenants (`<org_id>/uploads/...`),
      // read from the org context that OrgProvider publishes. FAIL CLOSED: refuse
      // a NEW upload rather than writing to the grandfathered flat `uploads/...`
      // namespace if the org isn't resolved yet — a flat-path write creates
      // tenant-boundary ambiguity in a multi-tenant workspace. Legacy flat-path
      // files stay READABLE via getSignedUrl/resolveFileUrl; only new writes
      // require org scope. orgId is published by OrgProvider once the workspace
      // resolves, so this only trips during the brief sign-in/load window.
      const orgId = getActiveOrgId();
      if (!orgId) {
        throw new Error('Workspace is still loading — please try again in a moment.');
      }
      const dir = `${orgId}/uploads`;
      const path = `${dir}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      // Browsers report application/octet-stream for many construction file types.
      // Map extensions → proper MIME types so Supabase storage accepts them.
      const MIME_MAP: Record<string, string> = {
        pdf: 'application/pdf',
        ifc: 'application/x-step',
        dwg: 'application/acad',
        dxf: 'application/dxf',
        rvt: 'application/octet-stream',
        nwd: 'application/octet-stream',
        nwc: 'application/octet-stream',
        skp: 'application/octet-stream',
        '3dm': 'application/octet-stream',
        glb: 'model/gltf-binary',
        gltf: 'model/gltf+json',
        obj: 'model/obj',
        fbx: 'application/octet-stream',
        stl: 'model/stl',
        step: 'application/x-step',
        stp: 'application/x-step',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        xls: 'application/vnd.ms-excel',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        doc: 'application/msword',
        csv: 'text/csv',
        txt: 'text/plain',
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        gif: 'image/gif',
        svg: 'image/svg+xml',
        webp: 'image/webp',
        mp4: 'video/mp4',
        zip: 'application/zip',
        xml: 'application/xml',
        json: 'application/json',
      };
      const contentType = (file.type && file.type !== 'application/octet-stream')
        ? file.type
        : (MIME_MAP[ext] || 'application/octet-stream');

      const { data, error } = await supabase.storage
        .from('app-files')
        .upload(path, file, { contentType, upsert: false });
      if (error) throw error;
      // Store the storage path — call getSignedUrl(path) on demand when displaying.
      // Sanitize the display/stored name (strip control chars, path components,
      // overly-long names). Normal filenames pass through unchanged.
      return { file_url: data.path, file_name: sanitizeFilename(file.name), path: data.path };
    },

    /**
     * Invoke the LLM via the "llm-proxy" Supabase Edge Function.
     *
     * Returns either { text, content, raw } on success or { error } on
     * failure. IMPORTANT: callers must inspect `result.error` before using
     * `result.text` — we never throw, so the upload modal can surface a
     * clean message on the fallback row instead of falling through to a
     * generic "AI response was not valid JSON" path.
     */
    InvokeLLM: async ({ prompt, system, messages, response_json_schema, input_variables, maxTokens = 1000, model, file_urls, files, tools, tool_choice, temperature, provider = 'openai', useCase, project_id }: InvokeLLMArgs): Promise<InvokeLLMResult> => {
      // The client expects this protocol version from the edge function. If the
      // function returns a lower version (or no version field), the deployed
      // edge function is older than the codebase and needs to be redeployed:
      //   supabase functions deploy llm-proxy --no-verify-jwt
      // See supabase/functions/llm-proxy/index.ts (PROTOCOL_VERSION constant).
      //
      // v3 marks the deploy where verify_jwt was turned off on the function —
      // without that, every POST returns 401 at Supabase's gate before the
      // function code even runs. If you see protocol v2 or lower AND POSTs are
      // failing with 401, that's the smoking gun.
      const EXPECTED_PROTOCOL_VERSION = 3;

      // We track the FIRST real failure we see so that if every tier fails we
      // can surface a precise diagnosis instead of a generic "AI unavailable".
      let firstFailure: string | null = null;

      // ── 1. Try Supabase Edge Function (llm-proxy) ──────────────────────────
      try {
        const { data, error } = await supabase.functions.invoke('llm-proxy', {
          body: { provider, prompt, system, messages, response_json_schema, input_variables, maxTokens, model, file_urls, files, tools, tool_choice, temperature, useCase, project_id },
        });
        if (error) {
          let detail = error?.message || String(error);
          try {
            const ctx = (error as { context?: { text?: () => Promise<string> } })?.context;
            if (ctx && typeof ctx.text === 'function') {
              const body = await ctx.text();
              if (body) {
                try { detail = JSON.parse(body)?.error || body; } catch { detail = body; }
              }
            }
          } catch { /* ignore */ }
          firstFailure = `llm-proxy edge function failed: ${detail}`;
          console.warn('[llm-proxy]', firstFailure);
        } else if (data && typeof data === 'object' && (data as { error?: unknown }).error) {
          firstFailure = `llm-proxy returned error: ${(data as { error?: unknown }).error}`;
          console.warn('[llm-proxy]', firstFailure);
        } else if (data && typeof data === 'object') {
          // Detect a stale edge-function deployment. If the caller wants
          // structured output (passed `tools`) but the response has no
          // tool_use AND no protocol_version, the deployed function is
          // pre-tool-use and must be redeployed.
          const usedTools = Array.isArray(tools) && tools.length > 0;
          const d = data as { tool_use?: unknown; protocol_version?: unknown };
          const gotToolUse = d.tool_use && typeof d.tool_use === 'object';
          const reportedVersion = Number(d.protocol_version) || 0;
          if (usedTools && !gotToolUse && reportedVersion < EXPECTED_PROTOCOL_VERSION) {
            firstFailure =
              `llm-proxy deployed version is too old (got v${reportedVersion}, need v${EXPECTED_PROTOCOL_VERSION}). ` +
              `Tool-use extraction will not work until you redeploy the edge function: ` +
              `\`supabase functions deploy llm-proxy\``;
            console.warn('[llm-proxy]', firstFailure);
            // surface the stale-deploy error below — there is no client-side fallback
          } else {
            return data as InvokeLLMResult;
          }
        } else {
          firstFailure = 'llm-proxy returned no data';
          console.warn('[llm-proxy]', firstFailure);
        }
      } catch (proxyErr: unknown) {
        const msg = (proxyErr as { message?: string } | undefined)?.message ?? String(proxyErr);
        firstFailure = `llm-proxy threw: ${msg}`;
        console.warn('[llm-proxy]', firstFailure);
      }

      // ── 2. No LLM available — surface the REAL reason ─────────────────────
      // We deliberately do NOT default to a generic "AI unavailable" string
      // when we know what actually went wrong. The first real failure (proxy
      // error, schema problem, stale deployment) is far more actionable than
      // "deploy an edge function" advice.
      const finalMsg = firstFailure
        || 'AI unavailable. Deploy and configure the authenticated Supabase Edge Function named "llm-proxy".';
      console.warn('[InvokeLLM]', finalMsg);
      return { error: finalMsg };
    },
  },
};

// ─── Backend functions ────────────────────────────────────────────────────────

export type FunctionInvokeResult = { data: unknown };

export const functions = {
  /**
   * Invoke a named backend function.
   * Implements client-side versions of critical functions; others fall back gracefully.
   */
  invoke: async (name: string, params: Record<string, unknown> = {}): Promise<FunctionInvokeResult> => {
    switch (name) {
      // Atomic number sequencing via Postgres RPC — no race conditions.
      // The DB function uses INSERT...ON CONFLICT with RETURNING for atomicity.
      case 'secureNumberSequence':
      case 'numberSequence': {
        const { project_id, record_type } = params as { project_id?: string; record_type?: string };
        if (!project_id || !record_type) return { data: { number: 1 } };
        // Atomic, server-side ONLY. The RPC does INSERT...ON CONFLICT DO UPDATE
        // ...RETURNING under a row lock, so concurrent callers serialize and get
        // DISTINCT official numbers (and it re-checks project access). NEVER fall
        // back to a client read-modify-write — two concurrent creates would read
        // the same next_value and mint DUPLICATE RFI/CO/submittal numbers, a
        // serious record-integrity problem. On a transient RPC error, retry the
        // SERVER call, then fail closed (no browser-side sequencing).
        let lastError: unknown = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          const { data, error } = await supabase.rpc('get_next_sequence_number', {
            p_project_id: project_id,
            p_record_type: record_type,
          });
          if (!error) return { data: { number: data } };
          lastError = error;
          console.warn(`[numberSequence] atomic RPC attempt ${attempt + 1}/3 failed:`, error?.message ?? error);
          if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
        }
        throw new SupabaseOperationError('number_sequences', 'get_next_sequence_number', lastError);
      }

      // LLM proxy
      case 'invokeLLM':
      case 'anthropicProxy': {
        try {
          const { data, error } = await supabase.functions.invoke('llm-proxy', { body: params });
          if (error) throw error;
          return { data };
        } catch {
          return { data: { text: 'AI features require the "llm-proxy" Supabase Edge Function.', error: null } };
        }
      }

      // Alert generation
      case 'generateAlerts':
        try {
          const { data } = await supabase.functions.invoke('generate-alerts', { body: params });
          return { data: data || { alerts: [] } };
        } catch {
          return { data: { alerts: [] } };
        }

      // Agent memory
      case 'agentMemory':
        try {
          const { data } = await supabase.functions.invoke('agent-memory', { body: params });
          return { data };
        } catch {
          return { data: null };
        }

      // PDF generation
      case 'generateExecutivePDF':
        try {
          const { data } = await supabase.functions.invoke('generate-pdf', { body: params });
          return { data };
        } catch {
          return { data: null };
        }

      default:
        console.warn(`functions.invoke('${name}') is not implemented. Deploy a Supabase Edge Function.`);
        return { data: null };
    }
  },
};

// The data surfaces (entities, auth, integrations, functions) and the storage
// helpers (getSignedUrl, resolveFileUrl) are exported individually above —
// import them by name where used.
