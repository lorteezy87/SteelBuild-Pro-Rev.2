/**
 * Pure helpers for ActionItems page shell.
 */
import { downloadTextFile } from "@/lib/exports/fabRelease";

import { ACTION_ITEM_STATUS, PRIORITY } from "@/lib/enums";

export type ActionItemLike = {
  id?: string;
  category?: string | null;
  status?: string | null;
  priority?: string | null;
  title?: string | null;
  description?: string | null;
  assigned_to?: string | null;
  due_date?: string | null;
  metadata?: { sort_order?: number; created_from?: string; [k: string]: unknown } | null;
  [k: string]: unknown;
};

export function splitSetupItems(allItems: ActionItemLike[]) {
  const setupItems = (allItems || [])
    .filter((ai) => ai.category === "SETUP")
    .sort((a, b) => (a.metadata?.sort_order ?? 99) - (b.metadata?.sort_order ?? 99));
  const actionItems = (allItems || []).filter((ai) => ai.category !== "SETUP");
  return { setupItems, actionItems };
}

export function computeSetupStats(setupItems: ActionItemLike[]) {
  const total = setupItems.length;
  const complete = setupItems.filter((si) => si.status === ACTION_ITEM_STATUS.COMPLETE).length;
  return { total, complete, pct: total > 0 ? Math.round((complete / total) * 100) : 0 };
}

export function collectKnownAssignees(actionItems: ActionItemLike[]): string[] {
  const names = new Set<string>();
  for (const ai of actionItems || []) {
    if (ai.assigned_to) names.add(ai.assigned_to);
  }
  return Array.from(names).sort();
}

export function computeActionItemStats(actionItems: ActionItemLike[]) {
  return {
    total: actionItems.length,
    open: actionItems.filter((ai) => ai.status === ACTION_ITEM_STATUS.OPEN).length,
    inProgress: actionItems.filter((ai) => ai.status === ACTION_ITEM_STATUS.IN_PROGRESS).length,
    complete: actionItems.filter((ai) => ai.status === ACTION_ITEM_STATUS.COMPLETE).length,
    cancelled: actionItems.filter((ai) => ai.status === ACTION_ITEM_STATUS.CANCELLED).length,
    critical: actionItems.filter((ai) => ai.priority === PRIORITY.CRITICAL).length,
  };
}

export function filterActionItems(
  actionItems: ActionItemLike[],
  opts: { filterStatus: string; filterPriority: string; search: string },
): ActionItemLike[] {
  const q = opts.search.trim().toLowerCase();
  return (actionItems || []).filter((ai) => {
    const statusMatch = opts.filterStatus === "all" || ai.status === opts.filterStatus;
    const priorityMatch = opts.filterPriority === "all" || ai.priority === opts.filterPriority;
    const searchMatch =
      !q
      || ai.title?.toLowerCase().includes(q)
      || ai.description?.toLowerCase().includes(q)
      || ai.assigned_to?.toLowerCase().includes(q);
    return statusMatch && priorityMatch && searchMatch;
  });
}

export function executionScore(
  ai: ActionItemLike,
  daysUntilFn: (d: string) => number | null,
): number {
  const days = ai.due_date ? daysUntilFn(ai.due_date) : null;
  let value = 0;
  if (ai.priority === PRIORITY.CRITICAL) value += 50;
  else if (ai.priority === PRIORITY.HIGH) value += 35;
  else if (ai.priority === PRIORITY.MEDIUM) value += 20;
  if (days !== null && days < 0) value += 60 + Math.min(30, Math.abs(days) * 4);
  else if (days === 0) value += 45;
  else if (days === 1) value += 30;
  else if (days === 2) value += 20;
  if (!ai.assigned_to) value += 12;
  if (ai.metadata?.created_from === "production_meeting_parser") value += 8;
  return value;
}

export function buildExecutionQueue(
  actionItems: ActionItemLike[],
  daysUntilFn: (d: string) => number | null,
  limit = 8,
) {
  const activeItems = (actionItems || []).filter(
    (ai) => ai.status !== ACTION_ITEM_STATUS.COMPLETE && ai.status !== ACTION_ITEM_STATUS.CANCELLED,
  );
  return activeItems
    .map((ai) => ({
      ...ai,
      _daysUntil: ai.due_date ? daysUntilFn(ai.due_date) : null,
      _executionScore: executionScore(ai, daysUntilFn),
    }))
    .sort((a, b) => b._executionScore - a._executionScore)
    .slice(0, limit);
}

export function resolveToggleStatus(currentStatus: string | null | undefined): string {
  const isComplete = currentStatus === ACTION_ITEM_STATUS.COMPLETE;
  return isComplete ? ACTION_ITEM_STATUS.OPEN : ACTION_ITEM_STATUS.COMPLETE;
}


export const ACTION_ITEMS_CSV_HEADERS = [
  "ID",
  "Title",
  "Status",
  "Priority",
  "Assigned To",
  "Due Date",
  "Category",
  "Project Area",
  "Meeting Reference",
] as const;

export function buildActionItemsCsvRows(
  items: Array<{
    id?: string | null;
    title?: string | null;
    status?: string | null;
    priority?: string | null;
    assigned_to?: string | null;
    due_date?: string | null;
    category?: string | null;
    project_area?: string | null;
    meeting_reference?: string | null;
  }>,
): Array<Array<string>> {
  return (items || []).map((ai) => [
    ai.id ?? "",
    ai.title || "",
    ai.status || "",
    ai.priority || "",
    ai.assigned_to || "",
    ai.due_date || "",
    ai.category || "",
    ai.project_area || "",
    ai.meeting_reference || "",
  ]);
}

/** Shift a YYYY-MM-DD date string forward by N days (local calendar math). */
export function shiftDate(dateStr: string | null | undefined, days: number): string | null {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Serialize action-item CSV rows (header + data) to a downloadable string. */
export function buildActionItemsCsvString(
  items: Parameters<typeof buildActionItemsCsvRows>[0],
): string {
  const rows = [[...ACTION_ITEMS_CSV_HEADERS], ...buildActionItemsCsvRows(items)];
  return rows
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

/** Filter / form priority options (canonical enum order). */
export const ACTION_ITEM_PRIORITIES = [
  PRIORITY.CRITICAL,
  PRIORITY.HIGH,
  PRIORITY.MEDIUM,
  PRIORITY.LOW,
] as const;

/** Display colors for priority chips on the Action Items shell. */
export const PRIORITY_COLORS: Record<string, string> = {
  [PRIORITY.CRITICAL]: "var(--status-error)",
  [PRIORITY.HIGH]: "var(--status-warning)",
  [PRIORITY.MEDIUM]: "var(--status-info)",
  [PRIORITY.LOW]: "var(--text-muted)",
};

/** Side-effect CSV download for Action Items page. */
export function downloadActionItemsCsv(
  items: Parameters<typeof buildActionItemsCsvString>[0],
  filename = "action-items.csv",
): void {
  downloadTextFile(buildActionItemsCsvString(items), filename, "text/csv;charset=utf-8");
}
