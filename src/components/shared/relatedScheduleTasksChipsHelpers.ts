/** Month-day UTC display for related task chips; null if unparseable. */
export function fmtMD(iso: unknown): string | null {
  if (!iso) return null;
  try {
    const d = typeof iso === "string" ? new Date(iso + "T00:00:00Z") : (iso as Date);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  } catch {
    return null;
  }
}

export const VALID_RELATED_FIELDS = new Set([
  "related_rfi_ids",
  "related_change_order_ids",
  "related_action_item_ids",
]);
