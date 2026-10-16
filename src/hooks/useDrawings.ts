/**
 * useDrawings.ts — Single source of truth for Drawing CRUD.
 *
 * Replaces scattered mutations in Drawings.jsx, DrawingSetUploadModal, RevisionUploadModal.
 * ONE complete project-scoped query. ONE invalidation path. NO silent fallbacks.
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
import { entities } from "@/api/supabaseClient";
import type { Update, RowWithAliases } from "@/api/supabaseClient";
import { getQueryKey, invalidateEntities } from "@/services/cacheRegistry";
import { buildDrawingMetadataUpdate } from "@/pages/drawings/drawingMutationHelpers";
import { toUserErrorMessage } from "@/lib/mutations/standardMutation";



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
    isPending,
    error,
    refetch,
  } = useQuery<Drawing[]>({
    queryKey,
    // A single filter() request is capped at 1000 rows by hosted PostgREST.
    // Counts, set grouping, and release evidence cannot use a partial roster.
    queryFn: () => entities.Drawing.filterAll({ project_id: projectId }),
    enabled: !!projectId,
    staleTime: 60_000,
  });
  const isLoading = !!projectId && isPending;

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

  const held = async (): Promise<never> => { throw new Error("This drawing source/lifecycle action is held. Use the reviewed drawing upload or governing Submittals workflow."); };
  const onError = (err: Error) => toast.error(toUserErrorMessage(err));
  type SheetRef = { id: string; sheet_number?: string | null };
  const createMut = useMutation<Drawing, Error, Record<string, unknown>>({ mutationFn: held, onError });
  const deleteMut = useMutation<string, Error, string>({ mutationFn: held, onError });
  const bulkUpdateStageMut = useMutation<BulkResult, Error, { ids: string[]; stage: string }>({ mutationFn: held, onError });
  const bulkDeleteMut = useMutation<BulkResult, Error, string[]>({ mutationFn: held, onError });
  const approveSetMut = useMutation<BulkResult, Error, { setName?: string; sheets: SheetRef[]; user?: unknown; notes?: string; revisionNumber?: string | number }>({ mutationFn: held, onError });
  const rejectSetMut = useMutation<BulkResult, Error, { setName?: string; sheets: SheetRef[]; notes: string }>({ mutationFn: held, onError });
  const supersedeSetMut = useMutation<BulkResult, Error, { sheets: SheetRef[] }>({ mutationFn: held, onError });
  const updateMut = useMutation<Drawing, Error, { id: string } & Record<string, unknown>>({
    mutationFn: async ({ id, ...patch }) => {
      const current = drawings.find(drawing => drawing.id === id);
      if (!current) throw new Error("Refresh the drawing register before editing.");
      return entities.Drawing.update(id, buildDrawingMetadataUpdate(current, patch) as Update<'drawings'>);
    },
    onSuccess: async () => { await invalidateAll(); toast.success("Drawing updated"); },
    onError,
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
