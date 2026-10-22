/**
 * useSheetMutations — the single-sheet create / update / soft-delete path.
 *
 * Extracted from useDrawingsPageController so the Document Control Board
 * Report writes sheets through the same code the Drawings page does: the same
 * payload stamping, the same detailing-task auto-create on add, the same soft
 * delete with an Undo toast, the same cache fan-out. Callers supply only what
 * differs — what to close or clear when a write lands.
 */

import { useMutation, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { entities } from "@/api/supabaseClient";
import type { Insert, Update } from "@/api/supabaseClient";
import { autoCreateDetailingTasks } from "@/lib/autoScheduleDetailing";
import { invalidateEntity } from "@/services/cacheRegistry";
import { buildDrawingCreatePayload, formatDrawingWriteError } from "./drawingMutationHelpers";
import { deleteRegisterSheet } from "./drawingRegisterDeletion";

type DrawingUpdate = Update<"drawings">;

/** The minimum a soft delete needs to prove the sheet belongs to the project. */
export interface SheetRef {
  id: string;
  project_id?: string | null;
}

export function useSheetMutations({
  projectId,
  projectName,
  queryClient,
  onCreated,
  onUpdated,
  onDeleted,
}: {
  projectId: string | null | undefined;
  projectName?: string | null;
  queryClient: QueryClient;
  onCreated?: (created: { id?: string } | null | undefined) => void;
  onUpdated?: () => void;
  onDeleted?: () => void;
}) {
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["drawings", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["drawing-register", projectId] }),
      invalidateEntity(queryClient, "drawingSet", projectId),
      invalidateEntity(queryClient, "submittal", projectId),
    ]);
  };

  const createMut = useMutation({
    mutationFn: (payload: Record<string, unknown>) => entities.Drawing.create(
      buildDrawingCreatePayload(
        payload,
        projectId,
        projectName,
      ) as Insert<"drawings">,
    ),
    onSuccess: async (created) => {
      await invalidate();
      toast.success("Sheet added");
      onCreated?.(created);
      if (created?.id) {
        const { created: count, failed } = await autoCreateDetailingTasks(
          [created],
          { projectName: projectName ?? "" },
        );
        if (count > 0) {
          queryClient.invalidateQueries({ queryKey: ["schedule-tasks"] });
          toast.success("Schedule task auto-created");
        } else if (failed) {
          toast.error("Schedule task failed to create");
        }
      }
    },
    onError: (error) => toast.error(formatDrawingWriteError(error, "add")),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...payload }: { id: string } & Record<string, unknown>) =>
      entities.Drawing.update(id, payload as DrawingUpdate),
    onSuccess: async () => {
      await invalidate();
      toast.success("Sheet updated");
      onUpdated?.();
    },
    onError: (error) => toast.error(formatDrawingWriteError(error, "update")),
  });

  const deleteMut = useMutation({
    mutationFn: (sheet: SheetRef | null | undefined) => deleteRegisterSheet(sheet, projectId),
    onSuccess: async (_result, sheet) => {
      await invalidate();
      onDeleted?.();
      const id = sheet?.id;
      toast.success("Sheet deleted", {
        action: {
          label: "Undo",
          onClick: async () => {
            if (!id) return;
            try {
              await entities.Drawing.update(id, {
                is_deleted: false,
                deleted_at: null,
              });
              await invalidate();
              toast.success("Sheet restored");
            } catch (error) {
              toast.error(formatDrawingWriteError(error, "restore"));
            }
          },
        },
      });
    },
    onError: (error) => toast.error(formatDrawingWriteError(error, "delete")),
  });

  return { createMut, updateMut, deleteMut, invalidate };
}
