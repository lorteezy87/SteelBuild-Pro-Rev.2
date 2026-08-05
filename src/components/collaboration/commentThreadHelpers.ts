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

export const COMMENT_STATUS_ORDER = ["open", "addressed", "rejected", "clarification"] as const;

export const COMMENT_STATUS_COLOR: Record<string, string> = {
  open: "#9ca3af",
  addressed: "#10b981",
  rejected: "#ef4444",
  clarification: "#f59e0b",
};

export const COMMENT_STATUS_LABEL: Record<string, string> = {
  open: "OPEN",
  addressed: "DONE",
  rejected: "NO",
  clarification: "?",
};

export function nextCommentStatus(current: string | null | undefined): string {
  const idx = COMMENT_STATUS_ORDER.indexOf((current || "open") as (typeof COMMENT_STATUS_ORDER)[number]);
  const safe = idx >= 0 ? idx : 0;
  return COMMENT_STATUS_ORDER[(safe + 1) % COMMENT_STATUS_ORDER.length];
}
