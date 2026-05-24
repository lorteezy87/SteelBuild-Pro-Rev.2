/**
 * auditLogger.ts — Centralized audit trail for all entity operations.
 *
 * Writes to base44.entities.Activity so the Activity page + ActivityFeed
 * component actually have data to display.
 *
 * Called automatically by useCrudMutation after every successful create/update/delete.
 * Fire-and-forget — audit failures never block the primary operation.
 *
 * The `activities` table stores columns in snake_case (entity_type, entity_name,
 * performed_by, project_id, project_name). Read-side aliasing in supabaseClient
 * mirrors them to the Base44-style camelCase that legacy feed UI still reads.
 */

import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabase";

type EntityRecord = Record<string, any>;

export interface LogActivityOptions {
  projectId?: string | null;
  projectName?: string | null;
  description?: string;
  userName?: string;
}

// ─── Entity display names ──────────────────────────────────────────────
const ENTITY_LABELS: Record<string, string> = {
  drawing:        "Drawing",
  delivery:       "Delivery",
  rfi:            "RFI",
  change_order:   "ChangeOrder",
  expense:        "Expense",
  cost_code:      "CostCode",
  work_package:   "WorkPackage",
  schedule_task:  "ScheduleTask",
  sov_item:       "SOVItem",
  alert:          "Alert",
  project:        "Project",
  daily_log:      "DailyLog",
  punchlist_item: "PunchlistItem",
  production_note: "ProductionNote",
};

// ─── Extract a human-readable name from a record ───────────────────────
function getEntityName(entityType: string, record: EntityRecord | null | undefined): string {
  if (!record) return entityType;
  // Try common name fields in priority order
  return (
    record.name ||
    record.title ||
    record.sheet_number ||
    record.rfi_number ||
    record.co_number ||
    record.delivery_number ||
    record.delivery_title ||
    record.wp_number ||
    record.cost_code_number ||
    record.task_name ||
    record.date ||
    record.description ||
    `${entityType} #${record.id || "?"}`
  );
}

// ─── Detect status changes for richer descriptions ─────────────────────
function detectStatusChange(entityType: string, record: EntityRecord | null | undefined, operation: string): string | null {
  if (operation !== "update" || !record) return null;

  // Status fields vary by entity
  const statusFields = ["status", "stage", "set_approval_status", "payment_status"];
  for (const field of statusFields) {
    if (record[field] !== undefined) {
      return `${field.replace(/_/g, " ")} → ${record[field]}`;
    }
  }
  return null;
}

// ─── Current user helper ───────────────────────────────────────────────
// C5 fix: use Supabase auth session instead of spoofable localStorage.
async function getCurrentUser(): Promise<string> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const meta = user.user_metadata || {};
      return meta.full_name || user.email || "System";
    }
  } catch {}
  // Fallback: localStorage is best-effort for offline/anon contexts
  try {
    const stored = localStorage.getItem("sbp_current_user");
    if (stored) {
      const u = JSON.parse(stored);
      return u.name || u.email || "System";
    }
  } catch {}
  return "System";
}

// ─── Main logging function ─────────────────────────────────────────────

/**
 * Log an activity to the Activity entity.
 * Fire-and-forget — errors are logged to console but never thrown.
 *
 * @param entityType - key from ENTITY_LABELS (e.g. "rfi")
 * @param action - "created" | "updated" | "deleted" | "status_changed"
 * @param record - the entity record (or { id } for deletes)
 * @param options - { projectId, projectName, description, userName }
 */
export async function logActivity(
  entityType: string,
  action: string,
  record: EntityRecord | null | undefined,
  options: LogActivityOptions = {},
): Promise<void> {
  try {
    const entityLabel = ENTITY_LABELS[entityType] || entityType;
    const entityName = getEntityName(entityLabel, record);
    const statusChange = detectStatusChange(entityType, record, action === "status_changed" ? "update" : action);

    // For the project entity the record IS the project (it has `id`, not
    // `project_id`), so fall back to record.id to keep project-level audits
    // scoped to a real project — activities RLS requires project membership on
    // a non-null project_id.
    const projectId =
      options.projectId ||
      record?.project_id ||
      (entityType === "project" ? record?.id : null) ||
      null;

    // Columns are snake_case to match the activities table. Read-side aliasing
    // mirrors these to camelCase for the legacy Activity feed.
    const activityRecord = {
      timestamp: new Date().toISOString(),
      performed_by: options.userName || await getCurrentUser(),
      action,
      entity_type: entityLabel,
      entity_name: entityName,
      entity_id: record?.id ?? null,
      project_id: projectId,
      project_name: options.projectName || record?.project_name || null,
      description: options.description || statusChange || "",
    };

    await base44.entities.Activity.create(activityRecord);
  } catch (err: any) {
    // Never block the primary operation — audit is best-effort
    console.warn("[auditLogger] Failed to log activity:", err?.message);
  }
}

/**
 * Log a workflow transition specifically.
 */
export async function logTransition(
  entityType: string,
  record: EntityRecord | null | undefined,
  fromStatus: string,
  toStatus: string,
  options: LogActivityOptions = {},
): Promise<void> {
  await logActivity(entityType, "status_changed", record, {
    ...options,
    description: `${fromStatus} → ${toStatus}`,
  });
}
