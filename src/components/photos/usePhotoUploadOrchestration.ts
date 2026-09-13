import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { entities, integrations } from "@/api/supabaseClient";
import { toUserErrorMessage } from "@/lib/mutations/standardMutation";
import {
  createPhotoInsert,
  type PhotoUploadItem,
  type PhotoUploadItemPatch,
  type PhotoUploadProgress,
  type PhotoUploadResult,
} from "./PhotoUploadDerive";
import { compressPhotoForUpload } from "./PhotoUploadMedia";

type UpdatePhotoUploadItem = (id: string, patch: PhotoUploadItemPatch) => void;

type PhotoUploadDependencies = {
  compress: typeof compressPhotoForUpload;
  uploadFile: typeof integrations.Core.UploadFile;
  createPhoto: typeof entities.Photo.create;
};

type UploadPhotoItemsOptions = {
  items: readonly PhotoUploadItem[];
  projectId: string;
  updateItem: UpdatePhotoUploadItem;
  setProgress: (progress: PhotoUploadProgress) => void;
  dependencies?: PhotoUploadDependencies;
};

const defaultDependencies: PhotoUploadDependencies = {
  compress: compressPhotoForUpload,
  uploadFile: integrations.Core.UploadFile,
  createPhoto: entities.Photo.create,
};

export async function uploadPhotoItems({
  items,
  projectId,
  updateItem,
  setProgress,
  dependencies = defaultDependencies,
}: UploadPhotoItemsOptions): Promise<PhotoUploadResult> {
  if (items.length === 0) throw new Error("No photos selected");
  if (!projectId) throw new Error("Select a project");

  setProgress({ done: 0, total: items.length });
  const errors: PhotoUploadResult["errors"] = [];
  let done = 0;

  for (const item of items) {
    if (item.status === "done") {
      done += 1;
      setProgress({ done, total: items.length });
      continue;
    }

    updateItem(item.id, { status: "uploading", error: null });
    try {
      const compressed = await dependencies.compress(item.file);
      const uploaded = await dependencies.uploadFile({ file: compressed, workflow: "photo" });
      await dependencies.createPhoto(
        createPhotoInsert(item, projectId, compressed, uploaded.file_url),
      );
      updateItem(item.id, { status: "done" });
    } catch (error) {
      const message = toUserErrorMessage(error);
      errors.push({ name: item.file.name, error: message });
      updateItem(item.id, { status: "error", error: message });
    }

    done += 1;
    setProgress({ done, total: items.length });
  }

  if (errors.length > 0 && errors.length === items.length) {
    throw new Error(`All uploads failed: ${errors[0].error}`);
  }
  return { errors };
}

type UsePhotoUploadOrchestrationOptions = {
  items: readonly PhotoUploadItem[];
  projectId: string;
  updateItem: UpdatePhotoUploadItem;
  onClose: () => void;
};

export function usePhotoUploadOrchestration({
  items,
  projectId,
  updateItem,
  onClose,
}: UsePhotoUploadOrchestrationOptions) {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<PhotoUploadProgress>({ done: 0, total: 0 });

  const mutation = useMutation({
    mutationFn: () =>
      uploadPhotoItems({
        items,
        projectId,
        updateItem,
        setProgress,
      }),
    onSuccess: ({ errors }) => {
      queryClient.invalidateQueries({ queryKey: ["photos"] });
      if (errors.length === 0) {
        toast.success(`${items.length} photo${items.length === 1 ? "" : "s"} uploaded`);
        onClose();
      } else {
        toast.warning(
          `Uploaded ${items.length - errors.length} of ${items.length}; ${errors.length} failed`,
        );
      }
    },
    onError: (error) => toast.error(toUserErrorMessage(error, "Upload failed")),
  });

  return {
    upload: mutation.mutate,
    isUploading: mutation.isPending,
    progress,
  };
}
