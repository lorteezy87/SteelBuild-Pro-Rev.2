/**
 * Pure helpers for PhotoGallery filter/sort/group.
 */

export type PhotoLike = {
  title?: string | null;
  description?: string | null;
  location?: string | null;
  category?: string | null;
  taken_date?: string | null;
  [k: string]: unknown;
};

export type PhotoSortBy = "date_desc" | "date_asc" | "title_asc" | "category" | string;

export function filterAndSortPhotos<T extends PhotoLike>(
  photos: T[] | null | undefined,
  opts: { searchTerm?: string; sortBy?: PhotoSortBy } = {},
): T[] {
  const searchTerm = opts.searchTerm || "";
  const sortBy = opts.sortBy || "date_desc";
  const filtered = searchTerm.trim()
    ? (photos || []).filter((p) => {
        const hay = `${p.title || ""} ${p.description || ""} ${p.location || ""} ${p.category || ""}`.toLowerCase();
        return hay.includes(searchTerm.toLowerCase());
      })
    : [...(photos || [])];

  const arr = [...filtered];
  arr.sort((a, b) => {
    if (sortBy === "date_desc")
      return new Date(b.taken_date || 0).getTime() - new Date(a.taken_date || 0).getTime();
    if (sortBy === "date_asc")
      return new Date(a.taken_date || 0).getTime() - new Date(b.taken_date || 0).getTime();
    if (sortBy === "title_asc")
      return (a.title || "").localeCompare(b.title || "");
    if (sortBy === "category")
      return (a.category || "").localeCompare(b.category || "");
    return 0;
  });
  return arr;
}

export function groupPhotosByMonth<T extends PhotoLike>(
  sortedPhotos: T[] | null | undefined,
  groupByMonth: boolean,
  formatGroupKey: (date: string | null | undefined) => string,
): Array<{ key: string | null; items: T[] }> {
  const list = sortedPhotos || [];
  if (!groupByMonth) return [{ key: null, items: list }];
  const groups = new Map<string, T[]>();
  for (const p of list) {
    const key = formatGroupKey(p.taken_date);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }
  return Array.from(groups, ([key, items]) => ({ key, items }));
}
