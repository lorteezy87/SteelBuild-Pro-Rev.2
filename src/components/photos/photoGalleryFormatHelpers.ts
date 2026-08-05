/** Pure date formatters for PhotoGallery. */

export function formatPhotoDate(d: unknown): string {
  if (!d) return "—";
  const dt = new Date(d as any);
  return dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function formatPhotoGroupKey(d: unknown): string {
  if (!d) return "Unknown";
  const dt = new Date(d as any);
  if (Number.isNaN(dt.getTime())) return "Unknown";
  return dt.toLocaleDateString(undefined, { year: "numeric", month: "long" });
}
