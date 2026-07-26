/**
 * Submittals page mutations — CRUD, bulk, rounds, sheet responses, and the
 * audited advance path. Behavior-preserving extract from Submittals.tsx (ID 21).
 */

import { useCallback, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";
import { addSubmittalRound } from "@/hooks/useSubmittals";
import { logActivity, logTransition } from "@/services/auditLogger";
import { invalidateEntity } from "@/services/cacheRegistry";
import { runSubmittalStatusTriggers } from "@/lib/submittalSmartTriggers";
import { FabReleaseBlockedError } from "@/lib/fabRelease/releaseStatus";
import { withProjectId } from "@/lib/mutations/standardMutation";
import { batchProcess } from "@/utils/batchProcess";
import { toast } from "sonner";
import {
  buildBulkSubmittalCreatePayload,
  buildBulkUpdateRowPatch,
  formatBulkSubmittalToast,
  formatSheetResponseSaveToast,
  formatSubmittalWriteError,
} from "./submittalMutationHelpers";

export type ReleaseBlock = { input: Parameters<typeof addSubmittalRound>[0]; rfis: string[] };

type SubmittalRow = { id: string; notes?: string | null; project_id?: string; [key: string]: unknown };

export function useSubmittalsPageMutations(args: {
  projectId: string | undefined;
  rows: SubmittalRow[];
  activeProject: { project_name?: string; name?: string } | null | undefined;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  setToDelete: (id: string | null) => void;
  setReleaseBlock: (block: ReleaseBlock | null) => void;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setShowBulkEdit: (open: boolean) => void;
  setShowBulkDelete: (open: boolean) => void;
  setShowBulkAdd: (open: boolean) => void;
  setShowNewRound: (open: boolean) => void;
  setShowSheetResponse: (round: unknown) => void;
}) {
  const {
    projectId,
    rows,
    activeProject,
    selectedId,
    setSelectedId,
    setToDelete,
    setReleaseBlock,
    setSelectedIds,
    setShowBulkEdit,
    setShowBulkDelete,
    setShowBulkAdd,
    setShowNewRound,
    setShowSheetResponse,
  } = args;

  const qc = useQueryClient();

  const invalidate = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["submittals", projectId] }),
      qc.invalidateQueries({ queryKey: ["submittal-rounds", projectId] }),
      qc.invalidateQueries({ queryKey: ["sheet-responses", projectId] }),
      // Status moves can auto-queue a detailing task (submittalSmartTriggers).
      qc.invalidateQueries({ queryKey: ["action-items", projectId] }),
      qc.invalidateQueries({ queryKey: ["action-items"] }),
    ]);
    // Fan out the drawingSet family so Doc Control reflects any linked updates.
    await invalidateEntity(qc, "drawingSet", projectId);
  }, [qc, projectId]);

  const createMut = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      entities.Submittal.create(withProjectId(data, projectId)),
    onSuccess: async (row) => {
      await invalidate();
      await logActivity("submittal", "created", row, { projectId });
      setSelectedId(row?.id || null);
    },
    onError: (err: unknown) => toast.error(formatSubmittalWriteError(err, "Create")),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; [key: string]: unknown }) => {
      const prevStatus = rows.find((r) => r.id === id)?.status ?? null;
      const updated = await entities.Submittal.update(id, data);
      // Smart triggers: moves into Rejected / R&R / Approved-as-Noted queue a
      // draft detailing task (deduped inside; never throws).
      if (typeof data.status === "string") {
        await runSubmittalStatusTriggers({
          submittal: updated as never,
          prevStatus: prevStatus as string | null,
          nextStatus: data.status,
        });
        await logTransition("submittal", updated as never, (prevStatus as string) ?? "—", data.status, {
          projectId,
        });
      } else {
        await logActivity("submittal", "updated", updated as never, { projectId });
      }
      return updated;
    },
    onSuccess: async () => {
      await invalidate();
      toast.success("Updated");
    },
    onError: (err: unknown) => toast.error(formatSubmittalWriteError(err, "Update")),
  });

  // Verb CTA → the single audited write path: logs a submittal_rounds row +
  // patches atomically (activates the previously-empty round log).
  const advanceMut = useMutation({
    mutationFn: (input: Parameters<typeof addSubmittalRound>[0]) => addSubmittalRound(input),
    onSuccess: async () => {
      await invalidate();
      toast.success("Round logged");
      setReleaseBlock(null);
    },
    onError: (err: unknown, variables) => {
      // A blocked "Release for Fabrication" opens the override dialog with the
      // pending move so a PM can release with a reason (or cancel + resolve).
      if (err instanceof FabReleaseBlockedError) {
        setReleaseBlock({ input: variables, rfis: err.blockingRfiNumbers || [] });
      } else {
        toast.error(formatSubmittalWriteError(err, "Advance"));
      }
    },
  });

  const advanceInFlight = useRef(false);
  const runAdvance = useCallback(
    (input: Parameters<typeof addSubmittalRound>[0]) => {
      if (advanceInFlight.current) return;
      advanceInFlight.current = true;
      advanceMut.mutate(input, {
        onSettled: () => {
          advanceInFlight.current = false;
        },
      });
    },
    [advanceMut],
  );

  const deleteMut = useMutation({
    mutationFn: (id: string) => entities.Submittal.delete(id),
    onSuccess: async (_d, id) => {
      await logActivity(
        "submittal",
        "deleted",
        rows.find((r) => r.id === id) || { id, project_id: projectId },
        { projectId },
      );
      await invalidate();
      setSelectedId(null);
      setToDelete(null);
      toast.success("Deleted");
    },
    onError: (err: unknown) => toast.error(formatSubmittalWriteError(err, "Delete")),
  });

  // Bulk update — handles the special "__notes_append" sentinel from
  // SubmittalBulkEditModal. When present, we read each row's existing
  // notes off the cache and append the new text per row instead of
  // overwriting. Every other field is a flat patch applied uniformly.
  const bulkUpdateMut = useMutation({
    mutationFn: async ({ ids, data }: { ids: string[]; data: Record<string, unknown> }) => {
      const { __notes_append: notesAppend, ...patch } = data || {};
      // Snapshot the current cache once — avoids N reads per row.
      const cached = (qc.getQueryData(["submittals", projectId]) || []) as SubmittalRow[];
      const byId = new Map(cached.map((r) => [r.id, r]));
      return batchProcess(ids, async (id) => {
        const existing = byId.get(id);
        const rowPatch = buildBulkUpdateRowPatch(
          existing,
          patch,
          typeof notesAppend === "string" ? notesAppend : undefined,
        );
        return entities.Submittal.update(id, rowPatch);
      });
    },
    onSuccess: async (results, variables) => {
      await invalidate();
      const patchStatus = variables?.data?.status;
      await Promise.all(
        results.succeeded.map(async ({ value, item }: { value: unknown; item: string }) => {
          if (patchStatus) {
            await logActivity("submittal", "status_changed", value || { id: item, project_id: projectId }, {
              projectId,
              description: `→ ${patchStatus}`,
            });
          } else {
            await logActivity("submittal", "updated", value || { id: item, project_id: projectId }, {
              projectId,
            });
          }
        }),
      );
      const ok = results.succeeded.length;
      const failed = results.failed.length;
      const succeededIds = new Set(results.succeeded.map(({ item }: { item: string }) => item));
      setSelectedIds((prev) => new Set([...prev].filter((id) => !succeededIds.has(id))));
      if (ok > 0) setShowBulkEdit(false);
      const toastInfo = formatBulkSubmittalToast("updated", ok, failed);
      toast[toastInfo.level](toastInfo.message);
    },
    onError: (err: unknown) => toast.error(formatSubmittalWriteError(err, "Bulk update")),
  });

  const bulkDeleteMut = useMutation({
    mutationFn: async (ids: string[]) => batchProcess(ids, (id) => entities.Submittal.delete(id)),
    onSuccess: async (results) => {
      await invalidate();
      await Promise.all(
        results.succeeded.map(({ item }: { item: string }) =>
          logActivity(
            "submittal",
            "deleted",
            rows.find((r) => r.id === item) || { id: item, project_id: projectId },
            { projectId },
          ),
        ),
      );
      const ok = results.succeeded.length;
      const failed = results.failed.length;
      const deletedIds = new Set(results.succeeded.map(({ item }: { item: string }) => item));
      if (selectedId && deletedIds.has(selectedId)) setSelectedId(null);
      setSelectedIds((prev) => new Set([...prev].filter((id) => !deletedIds.has(id))));
      if (ok > 0) setShowBulkDelete(false);
      const toastInfo = formatBulkSubmittalToast("deleted", ok, failed);
      toast[toastInfo.level](toastInfo.message);
    },
    onError: (err: unknown) => toast.error(formatSubmittalWriteError(err, "Bulk delete")),
  });

  const bulkCreateMut = useMutation({
    mutationFn: async (newRows: Record<string, unknown>[]) =>
      batchProcess(newRows, (row) =>
        entities.Submittal.create(
          buildBulkSubmittalCreatePayload(
            row,
            projectId,
            activeProject?.project_name || activeProject?.name || "",
          ) as never,
        ),
      ),
    onSuccess: async (results) => {
      await invalidate();
      await Promise.all(
        results.succeeded.map(({ value, item }: { value: unknown; item: unknown }) =>
          logActivity("submittal", "created", value || item || { project_id: projectId }, { projectId }),
        ),
      );
      const ok = results.succeeded.length;
      const failed = results.failed.length;
      if (ok > 0) setShowBulkAdd(false);
      const toastInfo = formatBulkSubmittalToast("added", ok, failed);
      toast[toastInfo.level](toastInfo.message);
    },
    onError: (err: unknown) => toast.error(formatSubmittalWriteError(err, "Bulk add")),
  });

  const createRoundMut = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      let round: { id?: string } | null = null;
      try {
        round = await entities.SubmittalRound.create(withProjectId(data, projectId));
        if (round?.id && data.submittal_id) {
          await entities.Submittal.update(data.submittal_id as string, {
            current_round_id: round.id,
            total_rounds: data.round_number || 1,
            status: "Submitted",
            ball_in_court: data.ball_in_court || "EOR",
            submitted_date: data.submitted_date || new Date().toISOString().split("T")[0],
          });
          await logActivity(
            "submittal",
            "round_created",
            {
              id: data.submittal_id,
              project_id: projectId,
              round_number: data.round_number,
            },
            { projectId, description: `Round ${data.round_number || 1} created` },
          );
        }
        return round;
      } catch (err) {
        if (round?.id) {
          try {
            await entities.SubmittalRound.delete(round.id);
          } catch {
            /* preserve original failure */
          }
        }
        throw err;
      }
    },
    onSuccess: async () => {
      await invalidate();
      toast.success("Round created — submittal resubmitted");
      setShowNewRound(false);
    },
    onError: (err: unknown) => toast.error(formatSubmittalWriteError(err, "Round")),
  });

  const saveSheetResponsesMut = useMutation({
    mutationFn: async ({ roundId, responses }: { roundId: string; responses: Record<string, unknown>[] }) => {
      const results = { succeeded: 0, failed: 0 };
      for (const resp of responses) {
        try {
          if (resp.id) {
            await entities.SubmittalSheetResponse.update(resp.id as string, {
              response_status: resp.response_status,
              reviewer_comment: resp.reviewer_comment || null,
            });
          } else {
            await entities.SubmittalSheetResponse.create(
              withProjectId(
                {
                  submittal_round_id: roundId,
                  drawing_id: resp.drawing_id || null,
                  drawing_set_id: resp.drawing_set_id || null,
                  sheet_number: resp.sheet_number || null,
                  response_status: resp.response_status,
                  reviewer_comment: resp.reviewer_comment || null,
                },
                projectId,
              ),
            );
          }
          results.succeeded++;
        } catch {
          results.failed++;
        }
      }
      return results;
    },
    onSuccess: async (results) => {
      await invalidate();
      const toastInfo = formatSheetResponseSaveToast(results.succeeded, results.failed);
      if (toastInfo.closeDialog) setShowSheetResponse(null);
      toast[toastInfo.level](toastInfo.message);
    },
    onError: (err: unknown) => toast.error(formatSubmittalWriteError(err, "Sheet responses")),
  });

  return {
    invalidate,
    createMut,
    updateMut,
    advanceMut,
    runAdvance,
    deleteMut,
    bulkUpdateMut,
    bulkDeleteMut,
    bulkCreateMut,
    createRoundMut,
    saveSheetResponsesMut,
  };
}
