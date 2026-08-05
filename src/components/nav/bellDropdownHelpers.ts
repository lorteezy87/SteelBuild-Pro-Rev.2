/** Pure alert bucketing / badge format for BellDropdown. */

export type AlertBucket = "rfi" | "co" | "dwg" | "del" | "other";

export function bucketForAlertType(t: unknown): AlertBucket {
  const s = String(t || "").toLowerCase();
  if (s.includes("rfi")) return "rfi";
  if (s.includes("co") || s.includes("change")) return "co";
  if (s.includes("draw") || s.includes("sheet")) return "dwg";
  if (s.includes("deliver") || s.includes("ship")) return "del";
  return "other";
}

export const BUCKET_LABELS: Record<AlertBucket, string> = {
  rfi: "RFI",
  co: "CO",
  dwg: "DWG",
  del: "DEL",
  other: "OTR",
};

export const BUCKET_COLORS: Record<AlertBucket, string> = {
  rfi: "var(--status-warning)",
  co: "var(--status-info)",
  dwg: "var(--accent)",
  del: "var(--status-error)",
  other: "var(--text-muted)",
};

export function formatBadge(n: number): string {
  if (n < 20) return String(n);
  if (n < 100) return `${Math.floor(n / 10) * 10}+`;
  if (n < 500) return `${Math.floor(n / 50) * 50}+`;
  return "500+";
}

export function groupAlertBucketCounts(
  alerts: Array<{ alert_type?: string | null }> | null | undefined,
): Record<AlertBucket, number> {
  const acc: Record<AlertBucket, number> = { rfi: 0, co: 0, dwg: 0, del: 0, other: 0 };
  for (const a of alerts || []) {
    acc[bucketForAlertType(a.alert_type)] += 1;
  }
  return acc;
}
