/**
 * useDrawings.ts — Single source of truth for Drawing CRUD.
 *
 * Replaces scattered mutations in Drawings.jsx, DrawingSetUploadModal, RevisionUploadModal.
 * ONE query. ONE invalidation path. NO silent fallbacks.
 *
 * Drawing set naming is enforced:
 *   - drawing_set_name is REQUIRED on every drawing (validation.js enforces)
 *   - Set identity = project_id + drawing_set_name (normalized, trimmed)
 *   - No orphan drawings (missing set name) — they are flagged, not silently hidden
 *
 * Usage:
 *   const {
 *     drawings, drawingSets, isLoading, error,
 *     createDrawing, updateDrawing, deleteDrawing,
 *     bulkUpdateStage, bulkDelete,
 *     approveSet, rejectSet, supersedeSet,
 *     orphanedDrawings,
 *   } = useDrawings(projectId);
 */

import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import type { Insert, Update, RowWithAliases } from "@/api/supabaseClient";
import { getQueryKey, invalidateEntities } from "@/services/cacheRegistry";
import { validate } from "@/services/validation";
import { autoCreateDetailingTasks } from "@/lib/autoScheduleDetailing";
import { sanitizeDrawingPayload } from "@/lib/drawingEnums";

export type Drawing = RowWithAliases<'drawings'>;

// ─── Normalize set name ─────────────────────────────────────────────────
function normalizeSetName(name: unknown): string {
  if (!name || typeof name !== "string") return "";
  return name.trim().replace(/\s+/g, " ");
}

type BulkResult = { succeeded: number; failed: Array<{ id: string; sheet_number?: string | null; error: string }> };

// ─── Hook ───────────────────────────────────────────────────────────────

export function useDrawings(projectId: string | null | undefined) {
  const qc = useQueryClient();
  const queryKey = getQueryKey("drawing", projectId);

  // ── Primary query ───────────────────────────────────────────────────
  const {
    data: drawings = [],
    isLoading,
    error,
    refetch,
  } = useQuery<Drawing[]>({
    queryKey,
    queryFn: () => base44.entities.Drawing.filter({ project_id: projectId }, undefined, 2000),
    enabled: !!projectId,
    staleTime: 60_000,
  });

  // ── Derived: group by set name ──────────────────────────────────────
  const { drawingSets, orphanedDrawings } = useMemo(() => {
    const sets: Record<string, Drawing[]> = {};
    const orphans: Drawing[] = [];

    for (const d of drawings) {
      const setName = normalizeSetName(d.drawing_set_name);
      if (!setName) {
        orphans.push(d);
        continue;
      }
      if (!sets[setName]) sets[setName] = [];
      sets[setName].push(d);
    }

    return { drawingSets: sets, orphanedDrawings: orphans };
  }, [drawings]);

  // ── Invalidation helper ─────────────────────────────────────────────
  const invalidateAll = async () => {
    await invalidateEntities(qc, ["drawing", "schedule_task"], projectId);
  };

  // ── CREATE single drawing ───────────────────────────────────────────
  type CreateInput = Record<string, unknown> & { drawing_set_name?: unknown };
  const createMut = useMutation<Drawing, Error, CreateInput>({
    mutationFn: async (data) => {
      // Enforce set name normalization
      const normalized = {
        ...data,
        project_id: projectId,
        drawing_set_name: normalizeSetName(data.drawing_set_name),
      };

      const errors = validate("drawing", normalized, "create");
      if (errors.length > 0) {
        throw new Error(errors.map((e: { message: string }) => e.message).join(" "));
      }

      // Defensive enum coercion: any stage / upload_status /
      // ai_extraction_status value that doesn't match the DB CHECK
      // constraints is silently rejected by Postgres and the user loses
      // the save. Coerce to the closest valid value; surface a warning
      // when we had to correct something so operators notice schema drift.
      const { record, warnings } = sanitizeDrawingPayload(normalized);
      if (warnings.length) {
        console.warn("[useDrawings.create] payload coerced:", warnings);
      }
      return await base44.entities.Drawing.create(record as Insert<'drawings'>);
    },
    onSuccess: async (created) => {
      await invalidateAll();
      toast.success("Drawing created");

      // Side effect: auto-create matching Detailing / Submittal schedule task.
      // Dates are optional — the schedule view tolerates nulls (shows "—").
      if (created?.id) {
        const { created: n, skipped: _skipped, failed } = await autoCreateDetailingTasks(
          [created],
          { projectName: created.project_name }
        );
        if (n > 0)       toast.success("Schedule task auto-created");
        else if (failed) toast.error("Schedule task failed to create");
        // skipped silently — a task already exists for this drawing.
      }
    },
    onError: (err) => {
      toast.error(`Failed to create drawing: ${err.message}`);
    },
  });

  // ── UPDATE single drawing ───────────────────────────────────────────
  type UpdateInput = { id: string } & Record<string, unknown>;
  const updateMut = useMutation<Drawing, Error, UpdateInput>({
    mutationFn: async ({ id, ...data }) => {
      if (!id) throw new Error("Update requires an id.");
      if (data.drawing_set_name !== undefined) {
        data.drawing_set_name = normalizeSetName(data.drawing_set_name);
      }
      const { record, warnings } = sanitizeDrawingPayload(data);
      if (warnings.length) {
        console.warn("[useDrawings.update] payload coerced:", warnings);
      }
      return await base44.entities.Drawing.update(id, record as Update<'drawings'>);
    },
    onSuccess: async () => {
      await invalidateAll();
      toast.success("Drawing updated");
    },
    onError: (err) => {
      toast.error(`Failed to update drawing: ${err.message}`);
    },
  });

  // ── DELETE single drawing ───────────────────────────────────────────
  const deleteMut = useMutation<string, Error, string>({
    mutationFn: async (id) => {
      if (!id) throw new Error("Delete requires an id.");
      await base44.entities.Drawing.delete(id);
      return id;
    },
    onSuccess: async () => {
      await invalidateAll();
      toast.success("Drawing deleted");
    },
    onError: (err) => {
      toast.error(`Failed to delete drawing: ${err.message}`);
    },
  });

  // ── BULK stage update ───────────────────────────────────────────────
  type BulkStageVars = { ids: string[]; stage: string };
  const bulkUpdateStageMut = useMutation<BulkResult, Error, BulkStageVars>({
    mutationFn: async ({ ids, stage }) => {
      const results: BulkResult = { succeeded: 0, failed: [] };
      for (const id of ids) {
        try {
          await base44.entities.Drawing.update(id, { stage } as Update<'drawings'>);
          results.succeeded++;
        } catch (err: unknown) {
          const msg = (err as { message?: string } | undefined)?.message ?? String(err);
          results.failed.push({ id, error: msg });
        }
      }
      if (results.failed.length > 0 && results.succeeded === 0) {
        throw new Error(`All ${results.failed.length} updates failed.`);
      }
      return results;
    },
    onSuccess: async (results) => {
      await invalidateAll();
      if (results.failed.length > 0) {
        toast.warning(`${results.succeeded} updated, ${results.failed.length} failed`);
      } else {
        toast.success(`${results.succeeded} drawing(s) updated`);
      }
    },
    onError: (err) => {
      invalidateAll(); // always show real state
      toast.error(`Bulk update failed: ${err.message}`);
    },
  });

  // ── BULK delete ─────────────────────────────────────────────────────
  const bulkDeleteMut = useMutation<BulkResult, Error, string[]>({
    mutationFn: async (ids) => {
      const results: BulkResult = { succeeded: 0, failed: [] };
      for (const id of ids) {
        try {
          await base44.entities.Drawing.delete(id);
          results.succeeded++;
        } catch (err: unknown) {
          const msg = (err as { message?: string } | undefined)?.message ?? String(err);
          results.failed.push({ id, error: msg });
        }
      }
      if (results.failed.length > 0 && results.succeeded === 0) {
        throw new Error(`All ${results.failed.length} deletes failed.`);
      }
      return results;
    },
    onSuccess: async (results) => {
      await invalidateAll();
      if (results.failed.length > 0) {
        toast.warning(`${results.succeeded} deleted, ${results.failed.length} failed`);
      } else {
        toast.success(`${results.succeeded} drawing(s) deleted`);
      }
    },
    onError: (err) => {
      invalidateAll();
      toast.error(`Bulk delete failed: ${err.message}`);
    },
  });

  // ── SET APPROVAL (workflow-controlled) ──────────────────────────────
  type SheetRef = { id: string; sheet_number?: string | null };
  type ApproveVars = { setName?: string; sheets: SheetRef[]; user?: unknown; notes?: string; revisionNumber?: string | number };
  const approveSetMut = useMutation<BulkResult, Error, ApproveVars>({
    mutationFn: async ({ sheets, notes, revisionNumber }) => {
      const results: BulkResult = { succeeded: 0, failed: [] };

      for (const sheet of sheets) {
        try {
          const updateData: Record<string, unknown> = {
            set_approval_status: "approved",
            set_approved_date: new Date().toISOString().split("T")[0],
          };
          if (revisionNumber) updateData.revision_number = revisionNumber;
          if (notes) updateData.notes = notes;

          await base44.entities.Drawing.update(sheet.id, updateData as Update<'drawings'>);
          results.succeeded++;
        } catch (err: unknown) {
          const msg = (err as { message?: string } | undefined)?.message ?? String(err);
          results.failed.push({ id: sheet.id, sheet_number: sheet.sheet_number, error: msg });
        }
      }

      if (results.failed.length > 0 && results.succeeded === 0) {
        throw new Error(`Approval failed for all ${results.failed.length} sheets.`);
      }
      return results;
    },
    onSuccess: async (results) => {
      await invalidateAll(); // ALWAYS invalidate, even on partial success
      if (results.failed.length > 0) {
        toast.warning(
          `Set approved: ${results.succeeded} sheets updated, ${results.failed.length} failed: ${results.failed.map((f) => f.sheet_number || f.id).join(", ")}`
        );
      } else {
        toast.success(`Set approved: ${results.succeeded} sheets updated`);
      }
    },
    onError: (err) => {
      invalidateAll(); // FIX: previous code did NOT invalidate on error
      toast.error(`Set approval failed: ${err.message}`);
    },
  });

  // ── SET REJECTION ───────────────────────────────────────────────────
  type RejectVars = { setName?: string; sheets: SheetRef[]; notes: string };
  const rejectSetMut = useMutation<BulkResult, Error, RejectVars>({
    mutationFn: async ({ sheets, notes }) => {
      if (!notes?.trim()) throw new Error("Notes are required when rejecting a set.");
      const results: BulkResult = { succeeded: 0, failed: [] };
      for (const sheet of sheets) {
        try {
          await base44.entities.Drawing.update(sheet.id, {
            set_approval_status: "rejected",
            notes: notes.trim(),
          } as Update<'drawings'>);
          results.succeeded++;
        } catch (err: unknown) {
          const msg = (err as { message?: string } | undefined)?.message ?? String(err);
          results.failed.push({ id: sheet.id, error: msg });
        }
      }
      if (results.failed.length > 0 && results.succeeded === 0) {
        throw new Error(`Rejection failed for all sheets.`);
      }
      return results;
    },
    onSuccess: async (results) => {
      await invalidateAll();
      toast.success(`Set rejected: ${results.succeeded} sheets updated`);
    },
    onError: (err) => {
      invalidateAll();
      toast.error(`Set rejection failed: ${err.message}`);
    },
  });

  // ── SUPERSEDE SET ───────────────────────────────────────────────────
  type SupersedeVars = { sheets: SheetRef[] };
  const supersedeSetMut = useMutation<BulkResult, Error, SupersedeVars>({
    mutationFn: async ({ sheets }) => {
      const results: BulkResult = { succeeded: 0, failed: [] };
      for (const sheet of sheets) {
        try {
          await base44.entities.Drawing.update(sheet.id, {
            is_superseded: true,
            set_approval_status: "superseded",
          } as Update<'drawings'>);
          results.succeeded++;
        } catch (err: unknown) {
          const msg = (err as { message?: string } | undefined)?.message ?? String(err);
          results.failed.push({ id: sheet.id, error: msg });
        }
      }
      return results;
    },
    onSuccess: async (results) => {
      await invalidateAll();
      toast.success(`${results.succeeded} sheets superseded`);
    },
    onError: (err) => {
      invalidateAll();
      toast.error(`Supersede failed: ${err.message}`);
    },
  });

  // ── Public API ──────────────────────────────────────────────────────
  return {
    // Data
    drawings,
    drawingSets,
    orphanedDrawings,
    isLoading,
    error,
    refetch,

    // Single record mutations
    createDrawing: createMut,
    updateDrawing: updateMut,
    deleteDrawing: deleteMut,

    // Bulk mutations
    bulkUpdateStage: bulkUpdateStageMut,
    bulkDelete: bulkDeleteMut,

    // Set-level operations
    approveSet: approveSetMut,
    rejectSet: rejectSetMut,
    supersedeSet: supersedeSetMut,

    // Invalidation (for external callers like upload modals)
    invalidateAll,
  };
}
