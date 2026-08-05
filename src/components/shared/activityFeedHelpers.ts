/** Pure accessors + grouping for ActivityFeed. */

export const A = {
  timestamp:    (a) => a?.timestamp ?? a?.created_at ?? null,
  user:         (a) => a?.performed_by ?? a?.userName ?? a?.user_name ?? null,
  entityType:   (a) => a?.entity_type ?? a?.entityType ?? null,
  entityName:   (a) => a?.entity_name ?? a?.entityName ?? null,
  projectName:  (a) => a?.project_name ?? a?.projectName ?? null,
  action:       (a) => a?.action ?? null,
  description:  (a) => a?.description ?? null,
};

export const ENTITY_COLORS = {
  RFI: "var(--status-info)",
  Drawing: "var(--status-warning)",
  WorkPackage: "var(--status-success)",
  ChangeOrder: "var(--status-error)",
  DailyLog: "var(--chart-4)",
  Photo: "var(--status-warning)",
  Project: "var(--accent)",
};

export const ACTION_COLORS = {
  created: "var(--status-success)",
  updated: "var(--status-warning)",
  deleted: "var(--status-error)",
  status_changed: "var(--status-info)",
  moved: "var(--accent)",
  uploaded: "var(--status-info)",
};

export const ACTION_VERBS = {
  created: "created",
  updated: "updated",
  deleted: "deleted",
  status_changed: "changed status of",
  moved: "moved",
  uploaded: "uploaded",
};

export function timeAgo(timestamp) {
  const now = new Date();
  const date = new Date(timestamp);
  const diff = Math.floor((now - date) / 1000);

  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString();
}

export function groupByDate(activities) {
  const groups = {
    Today: [],
    Yesterday: [],
    "This Week": [],
    Older: [],
  };

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  activities.forEach((activity) => {
    const ts = A.timestamp(activity);
    if (!ts) { groups.Older.push(activity); return; }
    const actDate = new Date(ts);
    if (Number.isNaN(actDate.getTime())) { groups.Older.push(activity); return; }
    const actDateOnly = new Date(actDate.getFullYear(), actDate.getMonth(), actDate.getDate());

    if (actDateOnly.getTime() === today.getTime()) {
      groups.Today.push(activity);
    } else if (actDateOnly.getTime() === yesterday.getTime()) {
      groups.Yesterday.push(activity);
    } else if (actDateOnly > weekAgo) {
      groups["This Week"].push(activity);
    } else {
      groups.Older.push(activity);
    }
  });

  return groups;
}

