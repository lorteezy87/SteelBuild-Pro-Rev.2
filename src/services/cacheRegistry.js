/**
 * cacheRegistry.js — Centralized query key registry and invalidation.
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

const REGISTRY = {

  drawing: {
    primary:  (pid) => ["drawings", pid],
    families: (pid) => [
      ["drawings", pid],
      ["drawings"],
      ["drawings-all"],
    ],
  },

  delivery: {
    primary:  (pid) => ["deliveries", pid],
    families: (pid) => [
      ["deliveries", pid],
      ["deliveries"],
      ["deliveries-all"],
      ["deliveries-nav-count", pid],
      ["deliveries-cost", pid],
      ["all-deliveries-portfolio"],
      ["procurement", pid],
      ["procurement"],
      ["pcc-deliveries", pid],
      ["modal-deliveries", pid],
    ],
  },

  expense: {
    primary:  (pid) => ["expenses", pid],
    families: (pid) => [
      ["expenses", pid],
      ["expenses"],
      ["expenses-all"],
    ],
  },

  cost_code: {
    primary:  (pid) => ["cost-codes", pid],
    families: (pid) => [
      ["cost-codes", pid],
      ["cost-codes"],
    ],
  },

  change_order: {
    primary:  (pid) => ["change-orders", pid],
    families: (pid) => [
      ["change-orders", pid],
      ["change-orders"],
      ["projects"],        // CO approval modifies revised contract value
    ],
  },

  rfi: {
    primary:  (pid) => ["rfis", pid],
    families: (pid) => [
      ["rfis", pid],
      ["rfis"],
      ["rfis-all"],
    ],
  },

  schedule_task: {
    primary:  (pid) => ["schedule-tasks", pid],
    families: (pid) => [
      ["schedule-tasks", pid],
      ["schedule-tasks"],
    ],
  },

  work_package: {
    primary:  (pid) => ["work-packages", pid],
    families: (pid) => [
      ["work-packages", pid],
      ["work-packages"],
    ],
  },

  sov_item: {
    primary:  (pid) => ["sov-items", pid],
    families: (pid) => [
      ["sov-items", pid],
      ["sov-items"],
    ],
  },

  project: {
    primary:  () => ["projects"],
    families: () => [
      ["projects"],
    ],
  },

  alert: {
    primary:  (pid) => ["alerts", pid],
    families: (pid) => [
      ["alerts", pid],
      ["alerts"],
      ["alerts-count"],
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
export async function invalidateEntity(qc, entity, projectId = null) {
  const reg = REGISTRY[entity];
  if (!reg) {
    console.error(`[cacheRegistry] Unknown entity: "${entity}". Falling back to broad invalidation.`);
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
export async function invalidateEntities(qc, entities, projectId = null) {
  await Promise.all(entities.map((e) => invalidateEntity(qc, e, projectId)));
}

/**
 * Get the primary query key for an entity.
 * Use this in useQuery() to keep keys consistent.
 */
export function getQueryKey(entity, projectId = null) {
  const reg = REGISTRY[entity];
  if (!reg) {
    console.error(`[cacheRegistry] Unknown entity: "${entity}".`);
    return [entity, projectId].filter(Boolean);
  }
  return reg.primary(projectId);
}

/**
 * Get all query key families for an entity (useful for optimistic updates).
 */
export function getQueryFamilies(entity, projectId = null) {
  const reg = REGISTRY[entity];
  if (!reg) return [[entity, projectId].filter(Boolean)];
  return reg.families(projectId);
}

/**
 * List all registered entity names.
 */
export function getRegisteredEntities() {
  return Object.keys(REGISTRY);
}
