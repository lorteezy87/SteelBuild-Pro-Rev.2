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

/** Pure query-key builder for CommentThread. */
export function commentThreadQueryKey(
  entityType: string | null | undefined,
  entityId: string | null | undefined,
) {
  return ["comments", entityType, entityId] as const;
}

/** Pure status glyph for comment status chips. */
export function commentStatusIcon(statusKey: string | null | undefined): string {
  if (statusKey === "addressed") return "✓";
  if (statusKey === "rejected") return "✗";
  if (statusKey === "clarification") return "?";
  return "○";
}

/** Pure badge chrome for comment status (cursor applied by caller). */
export function commentStatusBadgeStyle(statusColor: string): Record<string, string | number> {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
    padding: "1px 7px",
    borderRadius: 8,
    background: statusColor,
    color: "var(--on-accent)",
    border: "none",
    fontFamily: "var(--font-mono)",
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: "0.08em",
  };
}

/** Pure initials for comment author avatar. */
export function commentAuthorInitials(name: string | null | undefined): string {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Pure @mention extractor for comment body. */
export function extractMentions(body: string | null | undefined): string[] {
  const matches = String(body || "").match(/@[\w.-]+/g) || [];
  return [...new Set(matches.map((m) => m.slice(1)))];
}

/** Presentational chrome for @mention highlights in comment bodies. */
export const COMMENT_MENTION_STYLE: Record<string, string | number> = {
  background: "var(--accent-muted)",
  color: "var(--accent)",
  padding: "0 3px",
  borderRadius: 3,
  fontWeight: 600,
};
