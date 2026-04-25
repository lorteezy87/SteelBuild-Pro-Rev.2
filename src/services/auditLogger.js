/**
 * auditLogger.js — Centralized audit trail for all entity operations.
 *
 * Writes to base44.entities.Activity so the Activity page + ActivityFeed
 * component actually have data to display.
 *
 * Called automatically by useCrudMutation after every successful create/update/delete.
 * Fire-and-forget — audit failures never block the primary operation.
 *
 * Activity record shape (matches ActivityFeed.jsx expectations):
 *   { timestamp, userName, action, entityType, entityName, projectId, projectName, description }
 */

import { base44 } from "@/api/base44Client";

// ─── Entity display names ──────────────────────────────────────────────
const ENTITY_LABELS = {
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
function getEntityName(entityType, record) {
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
function detectStatusChange(entityType, record, operation) {
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
function getCurrentUser() {
  try {
    const stored = localStorage.getItem("sbp_current_user");
    if (stored) {
      const user = JSON.parse(stored);
      return user.name || user.email || "System";
    }
  } catch {}
  return "System";
}

// ─── Main logging function ─────────────────────────────────────────────

/**
 * Log an activity to the Activity entity.
 * Fire-and-forget — errors are logged to console but never thrown.
 *
 * @param {string} entityType - key from ENTITY_MAP (e.g. "rfi")
 * @param {string} action - "created" | "updated" | "deleted" | "status_changed"
 * @param {object} record - the entity record (or { id } for deletes)
 * @param {object} options - { projectId, projectName, description, userName }
 */
export async function logActivity(entityType, action, record, options = {}) {
  try {
    const entityLabel = ENTITY_LABELS[entityType] || entityType;
    const entityName = getEntityName(entityLabel, record);
    const statusChange = detectStatusChange(entityType, record, action === "status_changed" ? "update" : action);

    const activityRecord = {
      timestamp: new Date().toISOString(),
      userName: options.userName || getCurrentUser(),
      action: action,
      entityType: entityLabel,
      entityName: entityName,
      projectId: options.projectId || record?.project_id || null,
      projectName: options.projectName || record?.project_name || "",
      description: options.description || statusChange || "",
    };

    await base44.entities.Activity.create(activityRecord);
  } catch (err) {
    // Never block the primary operation — audit is best-effort
    console.warn("[auditLogger] Failed to log activity:", err.message);
  }
}

/**
 * Log a workflow transition specifically.
 */
export async function logTransition(entityType, record, fromStatus, toStatus, options = {}) {
  const entityLabel = ENTITY_LABELS[entityType] || entityType;
  const entityName = getEntityName(entityLabel, record);

  await logActivity(entityType, "status_changed", record, {
    ...options,
    description: `${fromStatus} → ${toStatus}`,
  });
}
