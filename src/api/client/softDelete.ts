/**
 * softDelete.ts
 *
 * Soft-delete + live-project scoping registries and query helpers.
 * Extracted verbatim from supabaseClient.ts.
 */

import type { QueryBuilder } from './internal';

/**
 * Tables that have soft-delete columns (is_deleted, deleted_at).
 * list() and filter() will auto-exclude deleted rows unless explicitly included.
 */
export const SOFT_DELETE_TABLES = new Set<string>([
  // Project roots anchor child records and audit logs, so UI deletes archive.
  'projects',
  'rfis', 'change_orders', 'deliveries', 'work_packages',
  'documents', 'drawings', 'drawing_sets', 'expenses', 'inspections',
  'punchlist_items', 'safety_incidents', 'scope_items',
  'sov_items', 'contacts', 'meetings', 'model_elements',
  'submittals', 'submittal_rounds', 'submittal_sheet_responses',
  'submittal_comment_dispositions', 'comments',
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
  // Launch-readiness: archive cost codes instead of hard-deleting financial history.
  'cost_codes',
  // schedule_tasks gained is_deleted / deleted_at and a BEFORE DELETE guard
  // (trg_enforce_schedule_task_guards) that raises 42501 on ANY hard delete:
  // "schedule_tasks rows are never hard-deleted; set is_deleted instead".
  // `authenticated` also holds no DELETE grant on the table, so the hard-delete
  // branch below failed at the ACL check before the guard even ran —
  // "[schedule_tasks.delete] permission denied for table schedule_tasks".
  // Registering here is the whole fix: delete() becomes the is_deleted write the
  // guard wants, and list/filter/get start excluding tombstoned tasks so a
  // deleted task stops feeding the Gantt, the cascade, float and % complete.
  // Do NOT "fix" this by granting DELETE — the database forbids it on purpose.
  'schedule_tasks',
  // GC document register. Both carry is_deleted / deleted_at, both are named in
  // the database's hard_delete_allowlist(), and neither has a DELETE policy —
  // so a hard delete would fail RLS. Registering here makes delete() the
  // soft-delete UPDATE the schema expects, and makes list/filter/get skip
  // tombstones. gc_drawings also drives gc_drawing_sets.sheet_count through
  // trg_gc_drawings_sync_counts, which fires on the is_deleted UPDATE.
  'gc_drawing_sets', 'gc_drawings',
]);

/**
 * Tables whose rows only make business sense when their parent project is
 * still active. This protects portfolio/global reads from orphaned child rows
 * after a project archive: KPIs, work packages, RFIs, costs, field records,
 * and document records all disappear with their project root.
 */
export const PROJECT_SCOPED_TABLES = new Set<string>([
  'rfis', 'cost_codes', 'work_packages', 'drawings', 'drawing_sets',
  'change_orders', 'change_requests', 'schedule_tasks', 'expenses',
  'deliveries', 'sov_items', 'contacts', 'daily_logs', 'meetings',
  'action_items', 'inspections', 'photos', 'punchlist_items',
  'quality_control_records', 'safety_incidents', 'production_notes',
  'warranties', 'resources', 'look_ahead', 'documents', 'document_folders',
  'model_elements',
  'activities', 'uploaded_files', 'scope_items', 'alerts', 'project_closeout',
  'project_handoff_items', 'mitigation_logs', 'mitigation_actions',
  'drawing_activity', 'drawing_revisions', 'drawing_zones', 'drawing_links',
  'drawing_signoffs', 'drawing_holds', 'task_dependencies', 'submittals', 'submittal_rounds',
  'submittal_sheet_responses', 'submittal_comment_dispositions',
  'submittal_activity', 'submittal_components', 'comments',
  'budget_hour_items', 'risks',
  // Email integration: all three tables are project-scoped.
  'email_accounts', 'email_messages', 'email_attachments',
  // Document Storage integration: linked folders + import queue.
  'linked_folders', 'document_import_queue',
  // GC document register: an ASI against an archived project is not a live
  // document. Both FKs are named <table>_project_id_fkey, which is what
  // projectScopedSelect() below embeds.
  'gc_drawing_sets', 'gc_drawings',
]);

/**
 * PostgREST embed for live-project scoping.
 *
 * Always name the FK (`projects!<table>_project_id_fkey`) — ambiguous joins
 * explode when a reverse FK also links the tables (e.g. contacts.project_id
 * AND projects.detailer_contact_id → contacts). Sentry JAVASCRIPT-REACT-10/V.
 */
export const projectScopedSelect = (tableName: string): string =>
  PROJECT_SCOPED_TABLES.has(tableName)
    ? `*, projects!${tableName}_project_id_fkey!inner(id)`
    : '*';

export const applyLiveProjectScope = (query: QueryBuilder, tableName: string): QueryBuilder =>
  PROJECT_SCOPED_TABLES.has(tableName)
    ? query.eq('projects.is_deleted', false)
    : query;

// Project archival is server-side + atomic: the soft_delete_project RPC
// (migration 20260620030000) soft-deletes every project-scoped child + the
// project root in ONE transaction, admin-gated. The former client-side
// softDeleteProjectChildren / PROJECT_CHILD_SOFT_DELETE_TABLES were a
// non-transactional Promise.all that could leave a project half-archived (#13)
// and have been removed — see entities.Project.delete below.
