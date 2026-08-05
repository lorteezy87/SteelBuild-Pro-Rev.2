/** Pure stamp datetime format for SignoffStampPanel. */

export function formatStamp(iso: unknown): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso as any);
    return d.toLocaleString();
  } catch {
    return String(iso);
  }
}
