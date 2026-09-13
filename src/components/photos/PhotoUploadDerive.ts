import type { Insert, RowWithAliases } from "@/api/client/supabaseTypes";
import { PHOTO_CATEGORIES } from "./PhotoGalleryDerive";

export { PHOTO_CATEGORIES };

export const MAX_PHOTO_UPLOAD_FILES = 25;

export type PhotoCategory = (typeof PHOTO_CATEGORIES)[number];
export type PhotoUploadStatus = "pending" | "uploading" | "done" | "error";

export type PhotoUploadItem = {
  id: string;
  file: File;
  preview: string;
  title: string;
  description: string;
  location: string;
  category: PhotoCategory;
  taken_date: string;
  status: PhotoUploadStatus;
  error: string | null;
};

export type PhotoUploadItemPatch = Partial<
  Pick<
    PhotoUploadItem,
    "title" | "description" | "location" | "category" | "taken_date" | "status" | "error"
  >
>;

export type PhotoUploadDefaults = {
  category: PhotoCategory;
  location: string;
  takenDate: string;
};

export type PhotoUploadProgress = {
  done: number;
  total: number;
};

export type PhotoUploadError = {
  name: string;
  error: string;
};

export type PhotoUploadResult = {
  errors: PhotoUploadError[];
};

export type PhotoProject = Pick<RowWithAliases<"projects">, "id" | "name">;

export type PhotoFileSelection =
  | { kind: "empty" }
  | { kind: "full" }
  | {
      kind: "accepted";
      files: File[];
      omittedCount: number;
      remainingCapacity: number;
    };

export function defaultPhotoUploadDate(now = new Date()): string {
  return now.toISOString().split("T")[0];
}

export function selectPhotoFiles(
  fileList: FileList | Iterable<File>,
  currentCount: number,
  maxFiles = MAX_PHOTO_UPLOAD_FILES,
): PhotoFileSelection {
  const imageFiles = Array.from(fileList).filter((file) => file.type.startsWith("image/"));
  if (imageFiles.length === 0) return { kind: "empty" };

  const remainingCapacity = maxFiles - currentCount;
  if (remainingCapacity <= 0) return { kind: "full" };

  const files = imageFiles.slice(0, remainingCapacity);
  return {
    kind: "accepted",
    files,
    omittedCount: imageFiles.length - files.length,
    remainingCapacity,
  };
}

export function photoTitleFromFilename(filename: string): string {
  return filename.replace(/\.[^.]+$/, "");
}

export function createPhotoUploadItem(
  file: File,
  defaults: PhotoUploadDefaults,
  preview: string,
  exifDate: string | null,
  id: string,
): PhotoUploadItem {
  return {
    id,
    file,
    preview,
    title: photoTitleFromFilename(file.name),
    description: "",
    location: defaults.location,
    category: defaults.category,
    taken_date: exifDate || defaults.takenDate,
    status: "pending",
    error: null,
  };
}

export function createPhotoInsert(
  item: PhotoUploadItem,
  projectId: string,
  uploadedFile: File,
  fileUrl: string,
): Insert<"photos"> {
  return {
    project_id: projectId,
    category: item.category,
    title: item.title,
    description: item.description,
    location: item.location,
    taken_date: item.taken_date,
    file_url: fileUrl,
    file_name: uploadedFile.name,
  };
}

export function totalPhotoUploadBytes(items: readonly PhotoUploadItem[]): number {
  return items.reduce((sum, item) => sum + item.file.size, 0);
}
