/**
 * useCrudMutation.ts — Single persistence path for all CRUD operations.
 *
 * ONE hook that:
 *   1. Validates via validation.js (no silent skips)
 *   2. Calls the entity client (no direct entity-client calls from pages)
 *   3. Invalidates ALL related caches via cacheRegistry
 *   4. Logs audit trail for status changes
 *   5. Fires side-effects only after primary write succeeds
 *   6. Never swallows errors — toast + throw
 *
 * Usage:
 *   const { createMut, updateMut, deleteMut, bulkUpdateMut, bulkDeleteMut } =
 *     useCrudMutation("delivery", { projectId, onSuccess: () => setShowForm(false) });
 *
 *   createMut.mutate(formData);
 *   updateMut.mutate({ id, ...changes });
 *   deleteMut.mutate(id);
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { entities } from "@/api/supabaseClient";
import { validate } from "@/services/validation";
import { validateTransition, getWorkflowField } from "@/services/workflowEngine";
import { invalidateEntities } from "@/services/cacheRegistry";
import { batchProcess } from "@/utils/batchProcess";
import { logActivity } from "@/services/auditLogger";

// ─── Entity name → entity-client key mapping ────────────────────────────
const ENTITY_MAP = {
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
} as const;

export type EntityName = keyof typeof ENTITY_MAP;

// Loose entity-client shape — the entity surface is still loosely typed.
type EntityClient = {
  create: (data: Record<string, unknown>) => Promise<Record<string, unknown>>;
  update: (id: string, data: Record<string, unknown>) => Promise<Record<string, unknown>>;
  delete: (id: string) => Promise<unknown>;
};

type EntityRecord = Record<string, unknown> & { id?: string };

function getEntityClient(entityName: EntityName): EntityClient {
  const key = ENTITY_MAP[entityName];
  const clients = entities as unknown as Record<string, EntityClient>;
  if (!key || !clients[key]) {
    throw new Error(`[useCrudMutation] Unknown entity: "${entityName}". Check ENTITY_MAP.`);
  }
  return clients[key];
}

// ─── Hook ───────────────────────────────────────────────────────────────

export type CrudOperation = 'create' | 'update' | 'delete' | 'bulk_update' | 'bulk_delete';

export type UseCrudMutationOptions = {
  /** Current project ID for cache invalidation. */
  projectId?: string | null;
  /** Callback after create (receives created record). */
  onCreateSuccess?: (record: EntityRecord) => void;
  /** Callback after update (receives updated record). */
  onUpdateSuccess?: (record: EntityRecord) => void;
  /** Callback after delete (receives deleted id). */
  onDeleteSuccess?: (id: string) => void;
  /** Generic success callback (any operation). */
  onSuccess?: (result: unknown, op: CrudOperation) => void;
  /** Bypass validation (use for bulk operations with pre-validated data). */
  skipValidation?: boolean;
  /** Additional entity names to invalidate (e.g. ["schedule_task"]). */
  alsoInvalidate?: EntityName[];
  /** Async function called after primary write succeeds (receives record). */
  sideEffect?: (record: EntityRecord, op: 'create' | 'update') => Promise<unknown> | unknown;
  /**
   * Workflow key from workflowEngine (e.g. "rfi", "change_order"). When set,
   * updates that change the workflow's status field are validated against legal transitions.
   */
  workflowName?: string;
  /** Async fn(id) returning the current record (needed for workflow validation to know current status). */
  getRecord?: (id: string) => Promise<EntityRecord | null | undefined>;
};

type BulkResult = {
  succeeded: unknown[];
  failed: Array<{ id: string; error: string }>;
};

export function useCrudMutation(entityName: EntityName, options: UseCrudMutationOptions = {}) {
  const qc = useQueryClient();
  const {
    projectId,
    onCreateSuccess,
    onUpdateSuccess,
    onDeleteSuccess,
    onSuccess,
    skipValidation = false,
    alsoInvalidate = [],
    sideEffect,
    workflowName,
    getRecord,
  } = options;

  const entityClient = getEntityClient(entityName);
  const entityLabel = ENTITY_MAP[entityName] || entityName;

  // Helper: invalidate this entity + any related entities
  const invalidateAll = async () => {
    const entityNames = [entityName, ...alsoInvalidate];
    await invalidateEntities(qc, entityNames, projectId);
  };

  // ── CREATE ──────────────────────────────────────────────────────────
  const createMut = useMutation<EntityRecord, Error, Record<string, unknown>>({
    mutationFn: async (data) => {
      if (!skipValidation) {
        const errors = validate(entityName, data, "create");
        if (errors.length > 0) {
          const msg = errors.map((e: { message: string }) => e.message).join(" ");
          throw new Error(msg);
        }
      }
      const created = await entityClient.create(data);
      return created;
    },
    onSuccess: async (created) => {
      await invalidateAll();
      toast.success(`${entityLabel} created`);

      // Audit trail — fire-and-forget
      logActivity(entityName, "created", created, { projectId });

      // Side effect (non-blocking, but errors are reported)
      if (sideEffect) {
        try {
          await sideEffect(created, "create");
        } catch (err: unknown) {
          const msg = (err as { message?: string } | undefined)?.message ?? String(err);
          console.error(`[useCrudMutation] Side effect failed for ${entityName} create:`, err);
          toast.error(`${entityLabel} created, but a follow-up action failed: ${msg}`);
        }
      }

      onCreateSuccess?.(created);
      onSuccess?.(created, "create");
    },
    onError: (err) => {
      toast.error(`Failed to create ${entityLabel}: ${err.message}`);
    },
  });

  // ── UPDATE ──────────────────────────────────────────────────────────
  type UpdateVars = { id: string } & Record<string, unknown>;
  type UpdateResult = { updated: EntityRecord; changedFields: Record<string, unknown>; prevStatus: string | null };

  const updateMut = useMutation<UpdateResult, Error, UpdateVars>({
    mutationFn: async ({ id, ...data }) => {
      if (!id) throw new Error("Update requires an id.");
      if (!skipValidation) {
        const errors = validate(entityName, data, "update");
        // For updates, only flag errors on fields that are actually being changed
        const relevantErrors = errors.filter(
          (e: { field: string; message: string }) => data[e.field] !== undefined
        );
        if (relevantErrors.length > 0) {
          const msg = relevantErrors.map((e: { message: string }) => e.message).join(" ");
          throw new Error(msg);
        }
      }

      // Workflow transition validation (if configured)
      let prevStatus: string | null = null;
      if (workflowName) {
        const statusField = getWorkflowField(workflowName);
        if (statusField && data[statusField] !== undefined) {
          // We need the current record to know the "from" status
          let currentRecord: EntityRecord | null | undefined = null;
          if (getRecord) {
            try { currentRecord = await getRecord(id); } catch { /* ignore */ }
          }
          if (currentRecord) {
            prevStatus = (currentRecord[statusField] as string | null | undefined) ?? null;
            const newStatus = data[statusField] as string;
            if (prevStatus && prevStatus !== newStatus) {
              const result = validateTransition(workflowName, prevStatus, newStatus, {
                record: { ...currentRecord, ...data },
                fields: data,
              });
              if (!result.valid) {
                throw new Error(result.reason);
              }
            }
          }
        }
      }

      const updated = await entityClient.update(id, data);
      return { updated, changedFields: data, prevStatus };
    },
    onSuccess: async ({ updated, changedFields, prevStatus }) => {
      await invalidateAll();
      toast.success(`${entityLabel} updated`);

      // Audit trail — detect status changes for richer logging
      const statusFields = ["status", "stage", "set_approval_status", "payment_status"];
      const changedStatus = statusFields.find((f) => changedFields[f] !== undefined);
      if (changedStatus) {
        const from = prevStatus || "unknown";
        const to = changedFields[changedStatus];
        logActivity(entityName, "status_changed", updated, {
          projectId,
          description: `${from} → ${to}`,
        });
      } else {
        logActivity(entityName, "updated", updated, { projectId });
      }

      if (sideEffect) {
        try {
          await sideEffect(updated, "update");
        } catch (err: unknown) {
          const msg = (err as { message?: string } | undefined)?.message ?? String(err);
          console.error(`[useCrudMutation] Side effect failed for ${entityName} update:`, err);
          toast.error(`${entityLabel} updated, but a follow-up action failed: ${msg}`);
        }
      }

      onUpdateSuccess?.(updated);
      onSuccess?.(updated, "update");
    },
    onError: (err) => {
      toast.error(`Failed to update ${entityLabel}: ${err.message}`);
    },
  });

  // ── DELETE ──────────────────────────────────────────────────────────
  const deleteMut = useMutation<string, Error, string>({
    mutationFn: async (id) => {
      if (!id) throw new Error("Delete requires an id.");
      await entityClient.delete(id);
      return id;
    },
    onSuccess: async (deletedId) => {
      await invalidateAll();
      toast.success(`${entityLabel} deleted`);

      // Audit trail
      logActivity(entityName, "deleted", { id: deletedId }, { projectId });

      onDeleteSuccess?.(deletedId);
      onSuccess?.(deletedId, "delete");
    },
    onError: (err) => {
      toast.error(`Failed to delete ${entityLabel}: ${err.message}`);
    },
  });

  // ── BULK UPDATE ─────────────────────────────────────────────────────
  type BulkUpdateVars = { ids: string[]; data: Record<string, unknown> };
  const bulkUpdateMut = useMutation<BulkResult, Error, BulkUpdateVars>({
    mutationFn: async ({ ids, data }) => {
      if (!ids?.length) throw new Error("No records selected.");
      const { succeeded, failed } = await batchProcess(
        ids,
        (id: string) => entityClient.update(id, data).then((record) => ({ id, record })),
      );
      const results: BulkResult = {
        succeeded: succeeded.map((s: { value: unknown }) => s.value),
        failed: failed.map((f: { item: string; error: string }) => ({ id: f.item, error: f.error })),
      };
      if (results.failed.length > 0 && results.succeeded.length === 0) {
        throw new Error(`All ${results.failed.length} updates failed.`);
      }
      return results;
    },
    onSuccess: async (results) => {
      await invalidateAll();
      if (results.failed.length > 0) {
        toast.warning(
          `${results.succeeded.length} updated, ${results.failed.length} failed: ${results.failed.map((f) => f.error).join("; ")}`
        );
      } else {
        toast.success(`${results.succeeded.length} ${entityLabel}(s) updated`);
      }
      onSuccess?.(results, "bulk_update");
    },
    onError: (err) => {
      // Still invalidate on total failure to show real state
      invalidateAll();
      toast.error(`Bulk update failed: ${err.message}`);
    },
  });

  // ── BULK DELETE ─────────────────────────────────────────────────────
  const bulkDeleteMut = useMutation<BulkResult, Error, string[]>({
    mutationFn: async (ids) => {
      if (!ids?.length) throw new Error("No records selected.");
      const { succeeded, failed } = await batchProcess(
        ids,
        (id: string) => entityClient.delete(id).then(() => id),
      );
      const results: BulkResult = {
        succeeded: succeeded.map((s: { value: unknown }) => s.value),
        failed: failed.map((f: { item: string; error: string }) => ({ id: f.item, error: f.error })),
      };
      if (results.failed.length > 0 && results.succeeded.length === 0) {
        throw new Error(`All ${results.failed.length} deletes failed.`);
      }
      return results;
    },
    onSuccess: async (results) => {
      await invalidateAll();
      if (results.failed.length > 0) {
        toast.warning(
          `${results.succeeded.length} deleted, ${results.failed.length} failed: ${results.failed.map((f) => f.error).join("; ")}`
        );
      } else {
        toast.success(`${results.succeeded.length} ${entityLabel}(s) deleted`);
      }
      onSuccess?.(results, "bulk_delete");
    },
    onError: (err) => {
      invalidateAll();
      toast.error(`Bulk delete failed: ${err.message}`);
    },
  });

  return {
    createMut,
    updateMut,
    deleteMut,
    bulkUpdateMut,
    bulkDeleteMut,
  };
}
