/**
 * Pure helpers extracted from TaskDetailDrawer.
 * Bodies match the originals — mechanical extraction only.
 */

/** Coerce JSONB id arrays that may arrive as strings or null. */
export function asIdArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((id): id is string => typeof id === "string" && id.length > 0);
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === "string" && id.length > 0)
        : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Order-insensitive id-array equality for save-time audit gating. */
export function sameIdSet(a: unknown, b: unknown): boolean {
  const aa = Array.isArray(a) ? a : [];
  const bb = Array.isArray(b) ? b : [];
  if (aa.length !== bb.length) return false;
  const sa = new Set(aa);
  for (const id of bb) if (!sa.has(id)) return false;
  return true;
}
