/**
 * entities.ts
 *
 * The full entity registry (~72 clients + custom wrappers). Kept as ONE module
 * on purpose — fragmenting the registry per-domain risks subtle changes to the
 * custom wrappers (Project / DrawingSet / ScheduleTask / DailyLog / PunchlistItem).
 * Extracted verbatim from supabaseClient.ts.
 */

import { supabase } from '@/lib/supabase';
import {
  parseDependencies as parseScheduleDependencies,
  serializeDependencies as serializeScheduleDependencies,
} from '@/services/scheduleCascade';
import { SupabaseOperationError } from './errors';
import { addAliases, normalizeIdArray, normalizeJsonbArray } from './fieldMapping';
import { createEntityClient } from './entityClient';
import type { Insert, RowWithAliases, Update } from './supabaseTypes';

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
    bulkDelete: async (ids: string[]): Promise<{ success: true }> => {
      // The generic bulkDelete would flip is_deleted on the project ROWS only,
      // stranding every child record live (the half-archive bug #13). Route
      // each project through the atomic soft_delete_project RPC instead.
      for (const id of ids) {
        const { error } = await supabase.rpc('soft_delete_project', { p_project_id: id });
        if (error) throw new SupabaseOperationError('projects', 'bulkDelete', error);
      }
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
  // Phase 4 submittal-logic: per-drawing-type (Shop/Erection/Part) received +
  // released tracking, gated by the `submittal_drawing_types` flag at the UI.
  SubmittalComponent:    createEntityClient('submittal_components'),
  SubmittalSheetResponse: createEntityClient('submittal_sheet_responses'),
  SubmittalCommentDisposition: createEntityClient('submittal_comment_dispositions'),
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
