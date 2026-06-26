/**
 * cacheRegistry.ts — Centralized query key registry and invalidation.
 *
 * Problem: Mutations invalidate ["deliveries"] but queries use ["deliveries-all"],
 *          ["deliveries-nav-count"], ["pcc-deliveries"] etc. Result: stale data.
 *
 * Solution: ONE registry that knows every query key family for each entity.
 *           When you mutate an entity, call invalidateEntity(qc, "delivery", projectId)
 *           and ALL related caches get invalidated — no silent staleness.
 *
 * Usage:
 *   import { invalidateEntity, getQueryKeys, ENTITY_KEYS } from "@/services/cacheRegistry";
 *
 *   // After any delivery mutation:
 *   invalidateEntity(queryClient, "delivery", projectId);
 *
 *   // Get the primary query key for a hook:
 *   const key = getQueryKeys("delivery", projectId).primary;
 */

// ─── Entity → query key families ────────────────────────────────────────
// Each entity lists ALL query keys that read its data, anywhere in the app.
// "fn" receives projectId and returns the exact key array.

import type { QueryClient } from "@tanstack/react-query";

// A query key family: an array whose first element is the key name and whose
// remaining elements scope it (e.g. project id). null/undefined parts are
// filtered out before invalidation.
type RegistryKey = (string | null | undefined)[];

interface EntityRegistration {
  primary: (id?: any) => RegistryKey;
  families: (id?: any) => RegistryKey[];
}

const REGISTRY: Record<string, EntityRegistration> = {

  // ── Core entities ─────────────────────────────────────────────────────

  project: {
    primary:  (pid) => ["projects"],
    families: (pid) => [
      ["projects"],
      ["project", pid],           // ProjectDetail.jsx single-project fetch
    ],
  },

  drawing: {
    primary:  (pid) => ["drawings", pid],
    families: (pid) => [
      ["drawings", pid],
      ["drawings"],
      ["drawings-all"],
      ["drawings-nav-count", pid], // Layout.jsx nav badge
      ["draw-detail", pid],        // ProjectDetailView.jsx
      ["drawings-for-wp", pid],    // WorkPackageDetailModal.jsx (uses project_id)
      ["drawing-register", pid],   // DrawingRegisterGrid (drawing_register_view)
      ["drawing-reviews", pid],    // ReviewQueue (drawing_reviews)
      ["drawing-impacts", pid],    // ImpactBoard (drawing_impacts)
    ],
  },

  // Drawing SETS are read under TWO key spellings across the app — the hub +
  // FabRelease + CommandCenter use ["drawing-sets", …] (hyphen) while Drawings,
  // Submittals, and the RFI modal use ["drawing_sets", …] (underscore). A set
  // mutation that invalidated only one spelling left the other view's cache
  // stale (e.g. a deleted set lingering in the Detailing Control Center). This
  // entry invalidates BOTH spellings (broad, project-agnostic prefixes) plus the
  // register view, so any set mutation refreshes every set-reading screen.
  drawingSet: {
    primary:  (pid) => ["drawing-sets", pid],
    families: (pid) => [
      ["drawing-sets"],            // hub, FabRelease, CommandCenter (covers scoped + unscoped)
      ["drawing_sets"],            // Drawings, Submittals, RFIFormModal, upload modal
      ["drawing-register", pid],   // Doc Control register view (drawing_register_view)
    ],
  },

  delivery: {
    primary:  (pid) => ["deliveries", pid],
    families: (pid) => [
      ["deliveries", pid],
      ["deliveries"],
      ["deliveries-all"],
      ["deliveries-nav-count", pid], // Layout.jsx nav badge
      ["deliveries-cost", pid],      // CostDashboard.jsx
      ["all-deliveries-portfolio"],   // AIInsights.jsx, CostDashboard.jsx
      ["procurement", pid],           // Procurement.jsx (deliveries are procurement)
      ["procurement"],
      ["modal-deliveries", pid],      // ProjectDrilldownModal.jsx
      ["del-detail", pid],            // ProjectDetailView.jsx
      ["deliveries-for-wp", pid],     // WorkPackageDetailModal.jsx (uses wp.id but pid covers prefix)
    ],
  },

  expense: {
    primary:  (pid) => ["expenses", pid],
    families: (pid) => [
      ["expenses", pid],
      ["expenses"],
      ["expenses-all"],             // Dashboard.jsx, Reports.jsx
    ],
  },

  cost_code: {
    primary:  (pid) => ["cost-codes", pid],
    families: (pid) => [
      ["cost-codes", pid],
      ["cost-codes"],
      ["codes-all"],                // Dashboard.jsx
      ["all-codes-portfolio"],      // AIInsights.jsx, CostDashboard.jsx
      ["cost-codes-global"],        // ExecutiveView.jsx, Reports.jsx
      ["cost-codes-dash", pid],     // CostDashboard.jsx
      ["cc-detail", pid],           // ProjectDetailView.jsx
      ["modal-codes", pid],         // ProjectDrilldownModal.jsx
    ],
  },

  change_order: {
    primary:  (pid) => ["change-orders", pid],
    families: (pid) => [
      ["change-orders", pid],
      ["change-orders"],
      ["change-orders-all"],        // Projects.jsx
      ["change-orders-global"],     // ExecutiveView.jsx, Reports.jsx
      ["change-orders-dash", pid],  // CostDashboard.jsx
      ["cos-all"],                  // Dashboard.jsx, ProductionNotes.jsx
      ["all-cos-portfolio"],        // AIInsights.jsx, CostDashboard.jsx
      ["co-detail", pid],           // ProjectDetailView.jsx
      ["modal-cos", pid],           // ProjectDrilldownModal.jsx
      ["projects"],                 // CO approval modifies revised contract value
    ],
  },

  model_element: {
    primary:  (pid) => ["model-elements", pid],
    families: (pid) => [
      ["model-elements", pid],
      ["model-elements"],
    ],
  },

  rfi: {
    primary:  (pid) => ["rfis", pid],
    families: (pid) => [
      ["rfis", pid],
      ["rfis"],
      ["rfis-all"],
      ["rfis", "hub"],              // RFIHub.jsx
      ["rfis-nav-count", pid],      // Layout.jsx nav badge
      ["rfi-detail", pid],          // ProjectDetailView.jsx
      ["pill-rfis-quick"],          // ProjectPillDropdown.jsx
      ["modal-rfis", pid],          // ProjectDrilldownModal.jsx
    ],
  },

  schedule_task: {
    primary:  (pid) => ["schedule-tasks", pid],
    families: (pid) => [
      ["schedule-tasks", pid],
      ["schedule-tasks"],
      ["schedule-tasks-global"],    // ExecutiveView.jsx
      ["schedule-tasks-dashboard"], // Dashboard.jsx
      ["schedule-tasks-all"],       // Reports.jsx
      ["portfolio-schedule-tasks"], // AIInsights.jsx
      ["sched-detail", pid],        // ProjectDetailView.jsx
      ["schedule-tasks-wp", pid],   // WorkPackageDetailModal.jsx (uses wp.id but pid covers prefix)
      ["lookahead", pid],           // LookAheadSchedule.jsx
      ["lookahead-gantt", pid],     // GanttChart (retired — key kept for cache invalidation parity)
    ],
  },

  work_package: {
    primary:  (pid) => ["work-packages", pid],
    families: (pid) => [
      ["work-packages", pid],
      ["work-packages"],
      ["wps-all"],                  // ProductionNotes.jsx, FabRelease.jsx, ResourceScheduling.jsx, WorkPackages.jsx
      ["work-packages-all"],        // Projects.jsx
      ["all-wps-portfolio"],        // AIInsights.jsx, CostDashboard.jsx
      ["work-packages-global"],     // ExecutiveView.jsx, Reports.jsx
      ["wps-cost", pid],            // CostDashboard.jsx
      ["wps-fab", pid],             // FabRelease.jsx
      ["wp-detail", pid],           // ProjectDetailView.jsx
      ["modal-wps", pid],           // ProjectDrilldownModal.jsx
    ],
  },

  sov_item: {
    primary:  (pid) => ["sov-items", pid],
    families: (pid) => [
      ["sov-items", pid],
      ["sov-items"],
      ["sovs-cost", pid],           // CostDashboard.jsx
    ],
  },

  alert: {
    primary:  (pid) => ["alerts", pid],
    families: (pid) => [
      ["alerts", pid],
      ["alerts"],
      ["alerts-count"],
      ["alerts-nav", pid],          // Layout.jsx nav badge
    ],
  },

  // ── Entities previously missing from registry ─────────────────────────

  action_item: {
    primary:  (pid) => ["action-items", pid],
    families: (pid) => [
      ["action-items", pid],
      ["action-items"],
      ["action-items-all"],          // Dashboard.jsx, Reports.jsx
      ["all-action-items-portfolio"], // AIInsights.jsx, CostDashboard.jsx
    ],
  },

  daily_log: {
    primary:  (pid) => ["daily-logs", pid],
    families: (pid) => [
      ["daily-logs", pid],
      ["daily-logs"],
      ["all-logs-portfolio"],        // AIInsights.jsx, CostDashboard.jsx
      ["modal-logs", pid],           // ProjectDrilldownModal.jsx
    ],
  },

  contact: {
    primary:  (pid) => ["contacts", pid],
    families: (pid) => [
      ["contacts", pid],
      ["contacts"],
    ],
  },

  meeting: {
    primary:  (pid) => ["meetings", pid],
    families: (pid) => [
      ["meetings", pid],
      ["meetings"],
    ],
  },

  inspection: {
    primary:  (pid) => ["inspections", pid],
    families: (pid) => [
      ["inspections", pid],
      ["inspections"],
    ],
  },

  safety_incident: {
    primary:  (pid) => ["safety-incidents", pid],
    families: (pid) => [
      ["safety-incidents", pid],
      ["safety-incidents"],
    ],
  },

  photo: {
    primary:  (pid) => ["photos", pid],
    families: (pid) => [
      ["photos", pid],
      ["photos"],
    ],
  },

  resource: {
    primary:  (pid) => ["resources", pid],
    families: (pid) => [
      ["resources", pid],
      ["resources"],
    ],
  },

  vendor: {
    primary:  () => ["vendors"],
    families: () => [
      ["vendors"],
    ],
  },

  punchlist: {
    primary:  (pid) => ["punchlist", pid],
    families: (pid) => [
      ["punchlist", pid],
      ["punchlist"],
    ],
  },

  qc_record: {
    primary:  (pid) => ["qc-records", pid],
    families: (pid) => [
      ["qc-records", pid],
      ["qc-records"],
    ],
  },

  closeout: {
    primary:  (pid) => ["closeouts", pid],
    families: (pid) => [
      ["closeouts", pid],
      ["closeouts"],
    ],
  },

  scope_item: {
    primary:  (pid) => ["scope-items", pid],
    families: (pid) => [
      ["scope-items", pid],
      ["scope-items"],
    ],
  },

  production_note: {
    primary:  () => ["production-notes"],
    families: () => [
      ["production-notes"],
    ],
  },

  warranty: {
    primary:  (pid) => ["warranties", pid],
    families: (pid) => [
      ["warranties", pid],
      ["warranties"],
    ],
  },

  constraint: {
    primary:  (pid) => ["constraints", pid],
    families: (pid) => [
      ["constraints", pid],
      ["constraints"],
    ],
  },

  procurement: {
    primary:  (pid) => ["procurement", pid],
    families: (pid) => [
      ["procurement", pid],
      ["procurement"],
    ],
  },

  user: {
    primary:  () => ["users"],
    families: () => [
      ["users"],
      ["all-users"],                 // RolesTab.jsx
      ["user-permissions"],          // permissions.js
    ],
  },

  decision: {
    primary:  (pid) => ["decisions", pid],
    families: (pid) => [
      ["decisions", pid],
      ["decisions"],
    ],
  },

  assumption: {
    primary:  (pid) => ["assumptions", pid],
    families: (pid) => [
      ["assumptions", pid],
      ["assumptions"],
    ],
  },

  activity: {
    primary:  (pid) => ["activities"],
    families: (pid) => [
      ["activities"],
      ["activity-feed", pid],        // Dashboard.jsx
    ],
  },

  document: {
    primary:  (pid) => ["documents", pid],
    families: (pid) => [
      ["documents", pid],
      ["documents"],
    ],
  },

  submittal: {
    primary:  (pid) => ["submittals", pid],
    families: (pid) => [
      ["submittals", pid],
      ["submittals"],
      ["submittals-all"],
      ["submittals-nav-count", pid],
      ["submittal-detail", pid],
    ],
  },

  submittal_round: {
    primary:  (pid) => ["submittal-rounds", pid],
    families: (pid) => [
      ["submittal-rounds", pid],
      ["submittal-rounds"],
    ],
  },

  submittal_activity: {
    primary:  (pid) => ["submittal-activity", pid],
    families: (pid) => [
      ["submittal-activity", pid],
      ["submittal-activity"],
    ],
  },

  change_request: {
    primary:  (pid) => ["change-requests", pid],
    families: (pid) => [
      ["change-requests", pid],
      ["change-requests"],
    ],
  },

  user_settings: {
    primary:  (uid) => ["user-settings", uid],
    families: (uid) => [
      ["user-settings", uid],
      ["user-settings"],
    ],
  },

  // ── Drawing sub-entities ─────────────────────────────────────────────

  drawing_activity: {
    primary:  (pid) => ["drawing-activity", pid],
    families: (pid) => [
      ["drawing-activity", pid],
      ["drawing-activity"],
    ],
  },

  drawing_link: {
    primary:  (pid) => ["drawing-links", pid],
    families: (pid) => [
      ["drawing-links", pid],
      ["drawing-links"],
      ["drawings", pid],
    ],
  },

  drawing_revision: {
    primary:  (pid) => ["drawing-revisions", pid],
    families: (pid) => [
      ["drawing-revisions", pid],
      ["drawing-revisions"],
      ["drawings", pid],
    ],
  },

  drawing_signoff: {
    primary:  (pid) => ["drawing-signoffs", pid],
    families: (pid) => [
      ["drawing-signoffs", pid],
      ["drawing-signoffs"],
      ["drawings", pid],
    ],
  },

  // ── Scheduling sub-entities ──────────────────────────────────────────

  task_dependency: {
    primary:  (pid) => ["task-dependencies", pid],
    families: (pid) => [
      ["task-dependencies", pid],
      ["task-dependencies"],
      ["schedule-tasks", pid],
    ],
  },

  // ── Submittal sub-entities ───────────────────────────────────────────

  submittal_sheet_response: {
    primary:  (pid) => ["submittal-sheet-responses", pid],
    families: (pid) => [
      ["submittal-sheet-responses", pid],
      ["submittal-sheet-responses"],
      ["submittals", pid],
    ],
  },

  // ── File management ──────────────────────────────────────────────────

  uploaded_file: {
    primary:  (pid) => ["uploaded-files", pid],
    families: (pid) => [
      ["uploaded-files", pid],
      ["uploaded-files"],
      ["documents", pid],
    ],
  },

  // ── Mitigation & governance ──────────────────────────────────────────

  mitigation_log: {
    primary:  (pid) => ["mitigation-logs", pid],
    families: (pid) => [
      ["mitigation-logs", pid],
      ["mitigation-logs"],
      ["mitigations", pid],
    ],
  },

  mitigation_action: {
    primary:  (pid) => ["mitigation-actions", pid],
    families: (pid) => [
      ["mitigation-actions", pid],
      ["mitigation-actions"],
      ["mitigations", pid],
    ],
  },
  // ── Email integration ────────────────────────────────────────────────

  email_account: {
    primary:  (pid) => ["email-accounts", pid],
    families: (pid) => [
      ["email-accounts", pid],
      ["email-accounts"],
    ],
  },

  email_message: {
    primary:  (pid) => ["email-messages", pid],
    families: (pid) => [
      ["email-messages", pid],
      ["email-messages"],
      ["email-messages-stats", pid],
    ],
  },

  email_attachment: {
    primary:  (pid) => ["email-attachments", pid],
    families: (pid) => [
      ["email-attachments", pid],
      ["email-attachments"],
    ],
  },

  // ── Document Storage integration ──────────────────────────────────

  linked_folder: {
    primary:  (pid) => ["linked-folders", pid],
    families: (pid) => [
      ["linked-folders", pid],
      ["linked-folders"],
      ["documents", pid],
    ],
  },

  document_import: {
    primary:  (pid) => ["document-import-queue", pid],
    families: (pid) => [
      ["document-import-queue", pid],
      ["document-import-queue"],
      ["documents", pid],
    ],
  },
};

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * Invalidate ALL query keys for an entity type.
 * This is the ONLY function mutations should call after success.
 *
 * @param {QueryClient} qc       – React Query client
 * @param {string}      entity   – key in REGISTRY (e.g., "delivery")
 * @param {string|null} projectId – current project ID (null for global)
 */
export async function invalidateEntity(qc: QueryClient, entity: string, projectId: any = null): Promise<void> {
  const reg = REGISTRY[entity];
  if (!reg) {
    if (import.meta.env.DEV) console.error(`[cacheRegistry] Unknown entity: "${entity}". Falling back to broad invalidation.`);
    // Fallback: invalidate everything with the entity name as prefix
    await qc.invalidateQueries({ queryKey: [entity] });
    return;
  }

  const keys = reg.families(projectId);
  await Promise.all(
    keys
      .filter((k) => k.every((part) => part !== null && part !== undefined))
      .map((key) => qc.invalidateQueries({ queryKey: key }))
  );
}

/**
 * Invalidate multiple entities at once (for cross-entity mutations).
 *
 * Example: Drawing creation also creates a ScheduleTask:
 *   invalidateEntities(qc, ["drawing", "schedule_task"], projectId);
 */
export async function invalidateEntities(qc: QueryClient, entities: string[], projectId: any = null): Promise<void> {
  await Promise.all(entities.map((e) => invalidateEntity(qc, e, projectId)));
}

/**
 * Get the primary query key for an entity.
 * Use this in useQuery() to keep keys consistent.
 */
export function getQueryKey(entity: string, projectId: any = null): RegistryKey {
  const reg = REGISTRY[entity];
  if (!reg) {
    if (import.meta.env.DEV) console.error(`[cacheRegistry] Unknown entity: "${entity}".`);
    return [entity, projectId].filter(Boolean);
  }
  return reg.primary(projectId);
}

/**
 * Get all query key families for an entity (useful for optimistic updates).
 */
export function getQueryFamilies(entity: string, projectId: any = null): RegistryKey[] {
  const reg = REGISTRY[entity];
  if (!reg) return [[entity, projectId].filter(Boolean)];
  return reg.families(projectId);
}

/**
 * List all registered entity names.
 */
export function getRegisteredEntities(): string[] {
  return Object.keys(REGISTRY);
}
