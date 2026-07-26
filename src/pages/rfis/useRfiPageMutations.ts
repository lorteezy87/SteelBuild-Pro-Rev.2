/**
 * RFIs page mutations — CRUD, bulk, notify-field, and PDF attachment upload.
 * Behavior-preserving extract from RFIs.jsx (ID 23).
 */

import { useCallback, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { entities, auth, integrations } from "@/api/supabaseClient";
import { toast } from "sonner";
import { getNextFormattedNumber } from "@/components/shared/numberSequencing";
import {
  appendRecordToCaches,
  replaceRecordInCaches,
  removeRecordFromCaches,
  invalidateCrudQueries,
  toastCrudError,
} from "@/components/shared/crudFeedback";
import { batchProcess } from "@/utils/batchProcess";
import {
  buildRfiAlertPayload,
  buildRfiAttachmentDocumentPayload,
  buildRfiCreatePayload,
  formatBulkRfiToast,
  formatRfiNotifyError,
} from "./rfiMutationHelpers";
import {
  buildRfiAttachmentDocumentFields,
  canUploadRfiAttachments,
  formatRfiAttachmentUploadToast,
} from "./rfiAttachmentUpload";

type RfiRow = {
  id: string;
  project_id?: string | null;
  project_name?: string | null;
  rfi_number?: string | null;
  title?: string | null;
  priority?: string | null;
  answer?: string | null;
  discipline?: string | null;
  [key: string]: unknown;
};

type ProjectRow = {
  id: string;
  name?: string | null;
};

export function useRfiPageMutations(args: {
  projectId: string | undefined;
  projects: ProjectRow[];
  projectMap: Record<string, string>;
  selectedRFI: RfiRow | null;
  setSelectedRFI: (rfi: RfiRow | null) => void;
  setDeleteTarget: (rfi: RfiRow | null) => void;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setShowBulkDelete: (open: boolean) => void;
  setShowForm: (open: boolean) => void;
  setEditingRFI: (rfi: RfiRow | null) => void;
  editingRFI: RfiRow | null;
}) {
  const {
    projectId,
    projects,
    projectMap,
    selectedRFI,
    setSelectedRFI,
    setDeleteTarget,
    setSelectedIds,
    setShowBulkDelete,
    setShowForm,
    setEditingRFI,
    editingRFI,
  } = args;

  const qc = useQueryClient();
  const rfiQueryKeys = [["rfis", projectId], ["rfis"]];
  const [savingAttachments, setSavingAttachments] = useState(false);
  const saveInFlightRef = useRef(false);

  const createMut = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      entities.RFI.create(buildRfiCreatePayload(data, projectId)),
    onSuccess: async (created) => {
      appendRecordToCaches(
        qc,
        rfiQueryKeys,
        created,
        // crudFeedback.js types include as `() => boolean`; runtime passes (record, key).
        ((record: { project_id?: string }, key: unknown[]) =>
          !key[1] || record.project_id === key[1]) as unknown as () => boolean,
      );
      await invalidateCrudQueries(qc, rfiQueryKeys);
      toast.success("RFI created");
    },
    onError: (e: unknown) => toastCrudError(e, "Failed to create RFI"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      entities.RFI.update(id, data),
    onSuccess: async (updated: RfiRow) => {
      replaceRecordInCaches(qc, rfiQueryKeys, updated);
      if (selectedRFI?.id === updated.id) setSelectedRFI(updated);
      await invalidateCrudQueries(qc, rfiQueryKeys);
      toast.success("RFI updated");
    },
    onError: (e: unknown) => toastCrudError(e, "Failed to update RFI"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => entities.RFI.delete(id),
    onSuccess: async (_: unknown, deletedId: string) => {
      removeRecordFromCaches(qc, rfiQueryKeys, deletedId);
      if (selectedRFI?.id === deletedId) setSelectedRFI(null);
      setDeleteTarget(null);
      await invalidateCrudQueries(qc, rfiQueryKeys);
      toast.success("RFI deleted");
    },
    onError: (e: unknown) => toastCrudError(e, "Failed to delete RFI"),
  });

  const bulkUpdateMut = useMutation({
    mutationFn: async ({ ids, data }: { ids: string[]; data: Record<string, unknown> }) => {
      const results = await batchProcess(ids, (id) => entities.RFI.update(id, data));
      if (results.failed.length > 0 && results.succeeded.length === 0) {
        throw new Error(`All ${results.failed.length} updates failed.`);
      }
      return results;
    },
    onSuccess: async (results) => {
      const succeededIds = new Set(results.succeeded.map(({ item }: { item: string }) => item));
      setSelectedIds((current) => new Set([...current].filter((id) => !succeededIds.has(id))));
      await invalidateCrudQueries(qc, rfiQueryKeys);
      const toastInfo = formatBulkRfiToast("updated", results.succeeded.length, results.failed.length);
      toast[toastInfo.level](toastInfo.message);
    },
    onError: (e: unknown) => toastCrudError(e, "Bulk update failed"),
  });

  const bulkDeleteMut = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await batchProcess(ids, (id) => entities.RFI.delete(id));
      if (results.failed.length > 0 && results.succeeded.length === 0) {
        throw new Error(`All ${results.failed.length} deletes failed.`);
      }
      return results;
    },
    onSuccess: async (results) => {
      const deletedIds = new Set(results.succeeded.map(({ item }: { item: string }) => item));
      setSelectedIds((current) => new Set([...current].filter((id) => !deletedIds.has(id))));
      setShowBulkDelete(false);
      if (selectedRFI && deletedIds.has(selectedRFI.id)) setSelectedRFI(null);
      await invalidateCrudQueries(qc, rfiQueryKeys);
      const toastInfo = formatBulkRfiToast("deleted", results.succeeded.length, results.failed.length);
      toast[toastInfo.level](toastInfo.message);
    },
    onError: (e: unknown) => toastCrudError(e, "Bulk delete failed"),
  });

  const notifyFieldMut = useMutation({
    mutationFn: (r: RfiRow) =>
      entities.Alert.create(
        buildRfiAlertPayload(
          {
            alert_type: "RFI_Field_Action",
            severity:
              r.priority === "Critical" ? "Critical" : r.priority === "High" ? "High" : "Medium",
            title: `${r.rfi_number || "RFI"} answered — field action`,
            description: `"${(r.title || "RFI").slice(0, 60)}" · Answer: ${(r.answer || "see RFI").slice(0, 90)}`,
            project_name: projectMap[r.project_id || ""] || "",
            related_record_id: r.id,
          },
          r.project_id,
        ),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alerts"] });
      qc.invalidateQueries({ queryKey: ["alerts-nav"] });
      toast.success("Field notified — alert posted");
    },
    onError: (e: unknown) => toast.error(formatRfiNotifyError(e)),
  });

  const uploadRfiPdfDocuments = useCallback(
    async (rfiRecord: RfiRow | null | undefined, files: File[] = []) => {
      if (!canUploadRfiAttachments(rfiRecord, files)) return { succeeded: 0, failed: [] as { name: string; message: string }[] };

      setSavingAttachments(true);
      const failed: { name: string; message: string }[] = [];
      let succeeded = 0;
      try {
        const uploadedBy = await auth.me?.()
          .then((user: { email?: string }) => user?.email)
          .catch(() => "");
        const project = projects.find((p) => p.id === (rfiRecord?.project_id || projectId));
        const now = new Date().toISOString();

        for (const file of files) {
          try {
            const uploaded = await integrations.Core.UploadFile({ file, workflow: "attachment" });
            await entities.Document.create(
              buildRfiAttachmentDocumentPayload(
                buildRfiAttachmentDocumentFields({
                  rfiRecord: rfiRecord!,
                  file,
                  fileUrl: uploaded.file_url,
                  projectName: project?.name || "",
                  uploadedBy: uploadedBy || "",
                  nowIso: now,
                }),
                rfiRecord!.project_id || projectId,
              ),
            );
            succeeded += 1;
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Upload failed";
            failed.push({ name: file.name, message });
          }
        }

        if (succeeded > 0) {
          await qc.invalidateQueries({ queryKey: ["rfi-documents", rfiRecord!.id] });
          await qc.invalidateQueries({
            queryKey: ["documents", rfiRecord!.project_id || projectId],
          });
        }
        const toastInfo = formatRfiAttachmentUploadToast(
          succeeded,
          failed.length,
          rfiRecord!.rfi_number,
        );
        if (toastInfo) toast[toastInfo.level](toastInfo.message);
        return { succeeded, failed };
      } finally {
        setSavingAttachments(false);
      }
    },
    [projects, projectId, qc],
  );

  const saveRfi = useCallback(
    async (data: Record<string, unknown>, pdfFiles: File[] = []) => {
      if (saveInFlightRef.current) return;
      saveInFlightRef.current = true;
      try {
        if (editingRFI) {
          const updated = await updateMut.mutateAsync({
            id: editingRFI.id,
            data: {
              ...data,
              project_name:
                projects.find((p) => p.id === ((data.project_id as string) || projectId))?.name ||
                (data.project_name as string) ||
                editingRFI.project_name ||
                "",
            },
          });
          await uploadRfiPdfDocuments(
            (updated as RfiRow) || { ...editingRFI, ...data },
            pdfFiles,
          );
        } else {
          const allocationProjectId = (data.project_id as string) || projectId;
          if (!allocationProjectId) throw new Error("Select a project before creating an RFI.");
          const num =
            (data.rfi_number as string) ||
            (await getNextFormattedNumber({
              projectId: allocationProjectId,
              recordType: "RFI",
              entityName: "RFI",
              fieldName: "rfi_number",
              prefix: "RFI #",
            }));
          if (!num) throw new Error("RFI number allocation failed. The RFI was not saved.");
          const created = await createMut.mutateAsync({
            ...data,
            rfi_number: num,
            project_name:
              projects.find((p) => p.id === ((data.project_id as string) || projectId))?.name ||
              (data.project_name as string) ||
              "",
          });
          await uploadRfiPdfDocuments(created as RfiRow, pdfFiles);
        }
        setShowForm(false);
        setEditingRFI(null);
      } catch (error) {
        toastCrudError(error, "Failed to save RFI");
      } finally {
        saveInFlightRef.current = false;
      }
    },
    [
      editingRFI,
      updateMut,
      createMut,
      projects,
      projectId,
      uploadRfiPdfDocuments,
      setShowForm,
      setEditingRFI,
    ],
  );

  return {
    rfiQueryKeys,
    createMut,
    updateMut,
    deleteMut,
    bulkUpdateMut,
    bulkDeleteMut,
    notifyFieldMut,
    uploadRfiPdfDocuments,
    saveRfi,
    savingAttachments,
    isSaving: createMut.isPending || updateMut.isPending || savingAttachments,
  };
}
