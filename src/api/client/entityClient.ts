/**
 * entityClient.ts
 *
 * The generic createEntityClient factory (list / listAll / filter / get /
 * create / update / delete / bulk*), the LIST_ROW_CAP public constant, the
 * bulk-chunk helper, and the truncation-warning telemetry. Extracted verbatim
 * from supabaseClient.ts.
 */

import * as Sentry from '@sentry/react';
import { SupabaseOperationError } from './errors';
import { addAliases, addAliasesToList, cleanRecord } from './fieldMapping';
import { applyConditions, parseSortBy } from './queryHelpers';
import { QueryBuilder, sbFrom } from './internal';
import {
  SOFT_DELETE_TABLES,
  applyLiveProjectScope,
  projectScopedSelect,
} from './softDelete';
import type { EntityClient, RowWithAliases, TableName } from './supabaseTypes';
import { emitProjectUpdated } from '@/services/projectUpdateEvents';

// ─── Entity factory ───────────────────────────────────────────────────────────

// Max ids per bulk chunk. Keeps the `.in('id', ...)` filter (and the resulting
// URL / statement) within Postgres/PostgREST limits while still collapsing the
// old N-request Promise.all into a handful of requests.
const BULK_CHUNK_SIZE = 500;

const chunkIds = (ids: string[]): string[][] => {
  const clean = ids.filter((id): id is string => typeof id === 'string' && id.length > 0);
  const chunks: string[][] = [];
  for (let i = 0; i < clean.length; i += BULK_CHUNK_SIZE) {
    chunks.push(clean.slice(i, i + BULK_CHUNK_SIZE));
  }
  return chunks;
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

// Warn when a read comes back at the cap (likely truncated) so the silent-
// 1000-row failure mode surfaces. In DEV this logs to the console; in PROD it
// reports a Sentry warning message (H10) so silent truncation is observable in
// production, not just during development. The UI also surfaces this via
// ListTruncationNotice (M18) — this is the telemetry half.
const warnIfTruncated = (tableName: string, op: string, count: number, cap: number) => {
  if (count < cap) return;
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn(
      `[supabaseClient] ${tableName}.${op}() returned ${count} rows at the ${cap}-row cap — results may be TRUNCATED. Add server-side filtering or pagination.`,
    );
  } else {
    Sentry.captureMessage(`list truncation: ${tableName}.${op} hit ${cap}-row cap`, 'warning');
  }
};

export const createEntityClient = <T extends TableName>(tableName: T): EntityClient<T> => ({
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
    const updated = addAliases<RowWithAliases<T>>(data, tableName as string);
    if ((tableName as string) === 'projects') {
      emitProjectUpdated(updated as unknown as Record<string, unknown> & { id?: string });
    }
    return updated;
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

  /**
   * Apply one identical patch to many rows in a single UPDATE per ≤500-id
   * chunk. Uses the same cleanRecord + updated_at treatment as update().
   */
  bulkUpdate: async (ids, updates) => {
    const chunks = chunkIds(ids);
    if (chunks.length === 0) return [];
    const clean = cleanRecord(updates as Record<string, unknown>);
    // Never send primary key or created_at in the update body (matches update()).
    delete clean.id;
    delete clean.created_at;
    const body = { ...clean, updated_at: new Date().toISOString() };
    const out: Array<RowWithAliases<T>> = [];
    for (const chunk of chunks) {
      const { data, error } = await (sbFrom(tableName))
        .update(body)
        .in('id', chunk)
        .select();
      if (error) throw new SupabaseOperationError(tableName as string, 'bulkUpdate', error);
      out.push(...addAliasesToList<RowWithAliases<T>>(data, tableName as string));
    }
    return out;
  },

  /**
   * Delete many rows in one op per ≤500-id chunk, mirroring delete()'s
   * soft-vs-hard semantics.
   */
  bulkDelete: async (ids) => {
    const chunks = chunkIds(ids);
    if (chunks.length === 0) return { success: true };
    const soft = SOFT_DELETE_TABLES.has(tableName as string);
    for (const chunk of chunks) {
      if (soft) {
        const { error } = await (sbFrom(tableName))
          .update({ is_deleted: true, deleted_at: new Date().toISOString() })
          .in('id', chunk);
        if (error) throw new SupabaseOperationError(tableName as string, 'bulkDelete', error);
      } else {
        const { error } = await (sbFrom(tableName))
          .delete()
          .in('id', chunk);
        if (error) throw new SupabaseOperationError(tableName as string, 'bulkDelete', error);
      }
    }
    return { success: true };
  },
});
