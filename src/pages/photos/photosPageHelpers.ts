/**
 * Pure helpers for Photos page shell.
 */
/** @deprecated Prefer `@/pages/shared/filterLiveRecords` — re-export kept for local imports. */
export { filterLiveRecords } from "@/pages/shared/filterLiveRecords";

export type PhotoLike = {
  taken_date?: string | null;
  category?: string | null;
  [k: string]: unknown;
};

const DATE_RANGE_DAYS: Record<string, number> = {
  today: 1,
  week: 7,
  month: 30,
};

export function filterPhotosByDate(
  photos: PhotoLike[],
  filterDate: string,
  now: Date = new Date(),
): PhotoLike[] {
  if (filterDate === "all") return photos || [];
  const days = DATE_RANGE_DAYS[filterDate] || 0;
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);
  return (photos || []).filter((p) => new Date(p.taken_date as string) >= cutoff);
}

export function filterPhotos(
  photos: PhotoLike[],
  opts: { filterDate: string; filterCategory: string; now?: Date },
): PhotoLike[] {
  return filterPhotosByDate(photos, opts.filterDate, opts.now).filter((p) => {
    const categoryMatch = opts.filterCategory === "all" || p.category === opts.filterCategory;
    return categoryMatch;
  });
}

export function computePhotoStats(photos: PhotoLike[]) {
  return {
    total: photos.length,
    progress: photos.filter((p) => p.category === "Progress").length,
    safety: photos.filter((p) => p.category === "Safety").length,
    issue: photos.filter((p) => p.category === "Issue").length,
    delivery: photos.filter((p) => p.category === "Delivery").length,
    punchlist: photos.filter((p) => p.category === "Punchlist").length,
    other: photos.filter((p) => p.category === "Other").length,
  };
}

export const PHOTO_CATEGORIES = [
  "Progress",
  "Safety",
  "Issue",
  "Delivery",
  "Punchlist",
  "Other",
] as const;

export const PHOTO_DATE_RANGES = [
  { label: "All Time", value: "all" },
  { label: "This Week", value: "week" },
  { label: "This Month", value: "month" },
  { label: "Today", value: "today" },
] as const;

