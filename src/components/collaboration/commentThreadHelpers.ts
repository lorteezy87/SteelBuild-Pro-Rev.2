/** Pure relative time for CommentThread. */

export function formatRelative(iso: string | null | undefined, nowMs: number = Date.now()): string {
  if (!iso) return "";
  const d = new Date(iso);
  const diffMs = nowMs - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString();
}
