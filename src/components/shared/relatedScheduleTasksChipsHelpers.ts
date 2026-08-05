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

export const SECTION_LABEL_STYLE: Record<string, string | number> = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  color: "var(--text-muted)",
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  display: "block",
  marginBottom: 6,
};
