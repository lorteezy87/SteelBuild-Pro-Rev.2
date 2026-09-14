import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  createPhotoUploadItem,
  selectPhotoFiles,
  type PhotoUploadDefaults,
  type PhotoUploadItem,
  type PhotoUploadItemPatch,
} from "./PhotoUploadDerive";
import { extractPhotoExifDate } from "./PhotoUploadMedia";

type ApplyToAllField = "category" | "location";

export function usePhotoUploadItems() {
  const [items, setItems] = useState<PhotoUploadItem[]>([]);
  const itemsRef = useRef(items);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(
    () => () => {
      for (const item of itemsRef.current) {
        if (item.preview) URL.revokeObjectURL(item.preview);
      }
    },
    [],
  );

  const addFiles = useCallback(
    async (fileList: FileList | Iterable<File>, defaults: PhotoUploadDefaults) => {
      const selection = selectPhotoFiles(fileList, itemsRef.current.length);
      if (selection.kind === "empty") {
        toast.error("Only image files are supported");
        return;
      }
      if (selection.kind === "full") {
        toast.error("Max 25 photos per upload");
        return;
      }
      if (selection.omittedCount > 0) {
        toast.warning(`Only ${selection.remainingCapacity} more photos can be added`);
      }

      const nextItems = await Promise.all(
        selection.files.map(async (file) =>
          createPhotoUploadItem(
            file,
            defaults,
            URL.createObjectURL(file),
            await extractPhotoExifDate(file),
            `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          ),
        ),
      );
      setItems((current) => [...current, ...nextItems]);
    },
    [],
  );

  const updateItem = useCallback((id: string, patch: PhotoUploadItemPatch) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((current) => {
      const item = current.find((candidate) => candidate.id === id);
      if (item?.preview) URL.revokeObjectURL(item.preview);
      return current.filter((candidate) => candidate.id !== id);
    });
  }, []);

  const applyToAll = useCallback(
    <Field extends ApplyToAllField>(field: Field, value: PhotoUploadItem[Field]) => {
      setItems((current) => current.map((item) => ({ ...item, [field]: value })));
    },
    [],
  );

  return { items, addFiles, updateItem, removeItem, applyToAll };
}
