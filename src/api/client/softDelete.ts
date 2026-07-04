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
export const PROJECT_SCOPED_TABLES = new Set<string>([
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
  'submittal_sheet_responses', 'submittal_activity', 'submittal_components', 'comments',
  'budget_hour_items', 'risks',
  // Email integration: all three tables are project-scoped.
  'email_accounts', 'email_messages', 'email_attachments',
  // Document Storage integration: linked folders + import queue.
  'linked_folders', 'document_import_queue',
]);

export const projectScopedSelect = (tableName: string): string =>
  PROJECT_SCOPED_TABLES.has(tableName)
    ? '*, projects!inner(id)'
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
