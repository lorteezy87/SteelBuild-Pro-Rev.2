/** Pure relative-time label for KpiTile. */

export function formatRelative(input: unknown, nowMs: number = Date.now()): string | null {
  if (input === null || input === undefined) return null;
  const d = input instanceof Date ? input : new Date(input as any);
  const t = d.getTime();
  if (!Number.isFinite(t)) return null;
  const diff = nowMs - t;
  if (diff < 0) return "just now";
  const s = Math.floor(diff / 1000);
  if (s < 30) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days <= 30) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
}
