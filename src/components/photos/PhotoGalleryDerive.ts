import type { RowWithAliases, Update } from "@/api/client/supabaseTypes";

export const PHOTO_CATEGORIES = [
  "Progress",
  "Safety",
  "Issue",
  "Delivery",
  "Punchlist",
  "Other",
] as const;

export const PHOTO_CATEGORY_COLORS: Record<(typeof PHOTO_CATEGORIES)[number], string> = {
  Progress: "var(--status-info)",
  Safety: "var(--status-error)",
  Issue: "var(--status-warning)",
  Delivery: "var(--status-success)",
  Punchlist: "var(--accent)",
  Other: "var(--text-muted)",
};

export type PhotoRecord = RowWithAliases<"photos">;
export type PhotoSort = "date_desc" | "date_asc" | "title_asc" | "category";
export type PhotoEditPatch = Pick<
  Update<"photos">,
  "title" | "description" | "location" | "category" | "taken_date"
>;

export type PhotoGroup = {
  key: string | null;
  items: PhotoRecord[];
};

export type PhotoSelection = {
  currentPhoto: PhotoRecord | null;
  canGoPrevious: boolean;
  canGoNext: boolean;
};

export function formatPhotoDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatPhotoGroupKey(value: string | null | undefined): string {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long" });
}

export function getPhotoCategoryColor(category: string | null | undefined): string {
  return PHOTO_CATEGORY_COLORS[category as keyof typeof PHOTO_CATEGORY_COLORS]
    ?? PHOTO_CATEGORY_COLORS.Other;
}

export function deriveVisiblePhotos(
  photos: readonly PhotoRecord[],
  searchTerm: string,
  sortBy: PhotoSort,
): PhotoRecord[] {
  const filtered = searchTerm.trim()
    ? photos.filter((photo) => {
        const haystack =
          `${photo.title || ""} ${photo.description || ""} ${photo.location || ""} ${photo.category || ""}`.toLowerCase();
        return haystack.includes(searchTerm.toLowerCase());
      })
    : photos;

  const sorted = [...filtered];
  sorted.sort((first, second) => {
    if (sortBy === "date_desc") {
      return new Date(second.taken_date || 0).getTime() - new Date(first.taken_date || 0).getTime();
    }
    if (sortBy === "date_asc") {
      return new Date(first.taken_date || 0).getTime() - new Date(second.taken_date || 0).getTime();
    }
    if (sortBy === "title_asc") {
      return (first.title || "").localeCompare(second.title || "");
    }
    if (sortBy === "category") {
      return (first.category || "").localeCompare(second.category || "");
    }
    return 0;
  });
  return sorted;
}

export function groupPhotosByMonth(
  photos: readonly PhotoRecord[],
  groupByMonth: boolean,
): PhotoGroup[] {
  if (!groupByMonth) return [{ key: null, items: [...photos] }];

  const groups = new Map<string, PhotoRecord[]>();
  for (const photo of photos) {
    const key = formatPhotoGroupKey(photo.taken_date);
    const group = groups.get(key);
    if (group) group.push(photo);
    else groups.set(key, [photo]);
  }
  return Array.from(groups, ([key, items]) => ({ key, items }));
}

export function derivePhotoSelection(
  photos: readonly PhotoRecord[],
  selectedIndex: number | null,
): PhotoSelection {
  const currentPhoto = selectedIndex === null ? null : photos[selectedIndex] ?? null;
  return {
    currentPhoto,
    canGoPrevious: currentPhoto !== null && selectedIndex! > 0,
    canGoNext: currentPhoto !== null && selectedIndex! < photos.length - 1,
  };
}

export function createPhotoEditPatch(photo: PhotoRecord): PhotoEditPatch {
  return {
    title: photo.title || "",
    description: photo.description || "",
    location: photo.location || "",
    category: photo.category || "Other",
    taken_date: photo.taken_date ? photo.taken_date.split("T")[0] : "",
  };
}
