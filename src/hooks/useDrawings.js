/**
 * useDrawings.js — Single source of truth for Drawing CRUD.
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
import { getQueryKey, invalidateEntities } from "@/services/cacheRegistry";
import { validate } from "@/services/validation";

// ─── Normalize set name ─────────────────────────────────────────────────
function normalizeSetName(name) {
  if (!name || typeof name !== "string") return "";
  return name.trim().replace(/\s+/g, " ");
}

// ─── Hook ───────────────────────────────────────────────────────────────

export function useDrawings(projectId) {
  const qc = useQueryClient();
  const queryKey = getQueryKey("drawing", projectId);

  // ── Primary query ───────────────────────────────────────────────────
  const {
    data: drawings = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: () => base44.entities.Drawing.filter({ project_id: projectId }),
    enabled: !!projectId,
    staleTime: 30_000,
  });

  // ── Derived: group by set name ──────────────────────────────────────
  const { drawingSets, orphanedDrawings } = useMemo(() => {
    const sets = {};
    const orphans = [];

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
  const createMut = useMutation({
    mutationFn: async (data) => {
      // Enforce set name normalization
      const normalized = {
        ...data,
        project_id: projectId,
        drawing_set_name: normalizeSetName(data.drawing_set_name),
      };

      const errors = validate("drawing", normalized, "create");
      if (errors.length > 0) {
        throw new Error(errors.map((e) => e.message).join(" "));
      }

      return await base44.entities.Drawing.create(normalized);
    },
    onSuccess: async (created) => {
      await invalidateAll();
      toast.success("Drawing created");

      // Side effect: auto-create schedule task (reported, not silent)
      if (created && (created.due_date || created.submitted_date)) {
        try {
          const startDate = created.submitted_date || created.due_date;
          const endDate = created.due_date || created.submitted_date;
          await base44.entities.ScheduleTask.create({
            project_id: projectId,
            project_name: created.project_name || "",
            task_name: `${created.sheet_number || "DWG"} — ${created.title || "Drawing Review"}`,
            task_type: "Submittal",
            phase: "Detailing",
            start_date: startDate,
            end_date: endDate,
            status: "Not Started",
            priority: created.priority_flag ? "High" : "Normal",
            percent_complete: 0,
            notes: [
              created.discipline ? `Discipline: ${created.discipline}` : "",
              created.reviewer ? `Reviewer: ${created.reviewer}` : "",
              created.spec_section ? `Spec: ${created.spec_section}` : "",
            ]
              .filter(Boolean)
              .join(" | "),
          });
          toast.success("Schedule task auto-created");
        } catch (err) {
          console.error("[useDrawings] Schedule task creation failed:", err);
          toast.error(`Drawing saved, but schedule task failed: ${err.message}`);
        }
      }
    },
    onError: (err) => {
      toast.error(`Failed to create drawing: ${err.message}`);
    },
  });

  // ── UPDATE single drawing ───────────────────────────────────────────
  const updateMut = useMutation({
    mutationFn: async ({ id, ...data }) => {
      if (!id) throw new Error("Update requires an id.");
      if (data.drawing_set_name !== undefined) {
        data.drawing_set_name = normalizeSetName(data.drawing_set_name);
      }
      return await base44.entities.Drawing.update(id, data);
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
  const deleteMut = useMutation({
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
  const bulkUpdateStageMut = useMutation({
    mutationFn: async ({ ids, stage }) => {
      const results = { succeeded: 0, failed: [] };
      for (const id of ids) {
        try {
          await base44.entities.Drawing.update(id, { stage });
          results.succeeded++;
        } catch (err) {
          results.failed.push({ id, error: err.message });
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
  const bulkDeleteMut = useMutation({
    mutationFn: async (ids) => {
      const results = { succeeded: 0, failed: [] };
      for (const id of ids) {
        try {
          await base44.entities.Drawing.delete(id);
          results.succeeded++;
        } catch (err) {
          results.failed.push({ id, error: err.message });
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
  const approveSetMut = useMutation({
    mutationFn: async ({ setName, sheets, user, notes, revisionNumber }) => {
      const results = { succeeded: 0, failed: [] };

      for (const sheet of sheets) {
        try {
          const updateData = {
            set_approval_status: "approved",
            set_approved_date: new Date().toISOString().split("T")[0],
          };
          if (revisionNumber) updateData.revision_number = revisionNumber;
          if (notes) updateData.notes = notes;

          await base44.entities.Drawing.update(sheet.id, updateData);
          results.succeeded++;
        } catch (err) {
          results.failed.push({ id: sheet.id, sheet_number: sheet.sheet_number, error: err.message });
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
  const rejectSetMut = useMutation({
    mutationFn: async ({ setName, sheets, notes }) => {
      if (!notes?.trim()) throw new Error("Notes are required when rejecting a set.");
      const results = { succeeded: 0, failed: [] };
      for (const sheet of sheets) {
        try {
          await base44.entities.Drawing.update(sheet.id, {
            set_approval_status: "rejected",
            notes: notes.trim(),
          });
          results.succeeded++;
        } catch (err) {
          results.failed.push({ id: sheet.id, error: err.message });
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
  const supersedeSetMut = useMutation({
    mutationFn: async ({ sheets }) => {
      const results = { succeeded: 0, failed: [] };
      for (const sheet of sheets) {
        try {
          await base44.entities.Drawing.update(sheet.id, {
            is_superseded: true,
            set_approval_status: "superseded",
          });
          results.succeeded++;
        } catch (err) {
          results.failed.push({ id: sheet.id, error: err.message });
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
