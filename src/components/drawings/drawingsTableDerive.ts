// Pure derive helpers extracted from DrawingsTable.jsx — column defs, sort
// helpers, flat row builders, and expand/collapse persistence. No React imports.
import { SORTABLE_FIELDS } from "./drawingsConfig";

export const EXPAND_LS_KEY = "sbp-drawings-expanded-sets-v2";

type SortState = { field: string; dir: "asc" | "desc" } | null;

type DrawingGroup = {
  key: string;
  setOnly?: boolean;
  sheets: Record<string, unknown>[];
};

type FlatDrawingRow =
  | { type: "group"; group: DrawingGroup; isExpanded: boolean }
  | { type: "setOnlyInfo"; group: DrawingGroup }
  | { type: "sheet"; drawing: Record<string, unknown>; group: DrawingGroup };

/** Monospace header cell styles (stable reference for the table thead). */
export const TABLE_HEADER_STYLE = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.15em",
  color: "var(--text-muted)",
  textTransform: "uppercase",
  padding: "8px 12px",
  textAlign: "left",
  borderBottom: "1px solid var(--border-default)",
  whiteSpace: "nowrap",
  background: "var(--bg-surface)",
};

/**
 * Column definitions for the register table.
 * Default visible: checkbox | sheet # | title | rev | stage | due | actions.
 * Discipline, reviewer, submitted_date, and approval stay in the DOM for
 * colSpan stability but are hidden — secondary data lives behind expand / ⋮.
 */
export const TABLE_COLUMNS = [
  { key: "checkbox", field: null as null, label: "", width: 36 },
  { key: "sheet_number", field: "sheet_number", label: SORTABLE_FIELDS.sheet_number.label },
  { key: "title", field: "title", label: SORTABLE_FIELDS.title.label },
  { key: "discipline", field: "discipline", label: SORTABLE_FIELDS.discipline.label, hidden: true },
  { key: "revision_number", field: "revision_number", label: SORTABLE_FIELDS.revision_number.label },
  { key: "stage", field: "stage", label: SORTABLE_FIELDS.stage.label },
  { key: "submitted_date", field: "submitted_date", label: SORTABLE_FIELDS.submitted_date.label, hidden: true },
  { key: "due_date", field: "due_date", label: SORTABLE_FIELDS.due_date.label },
  { key: "reviewer", field: "reviewer", label: SORTABLE_FIELDS.reviewer.label, hidden: true },
  { key: "approval", field: null as null, label: "APPROVAL", hidden: true },
  { key: "actions", field: null as null, label: "" },
];

export function loadExpandedSets(): Set<string> | null {
  try {
    const raw = localStorage.getItem(EXPAND_LS_KEY);
    if (!raw) return null;
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return null;
  }
}

export function saveExpandedSets(set: Set<string>): void {
  try {
    localStorage.setItem(EXPAND_LS_KEY, JSON.stringify([...set]));
  } catch { /* noop */ }
}

/**
 * Toggle sort state: off → asc → desc → off (null).
 * Byte-identical to DrawingsTable handleSort reducer logic.
 */
export function nextSortState(prev: SortState, field: string): SortState {
  if (!prev || prev.field !== field) return { field, dir: "asc" };
  if (prev.dir === "asc") return { field, dir: "desc" };
  return null;
}

/** Sort sheet lists within each group; groups stay in alphabetical order. */
export function sortDrawingGroups(groups: DrawingGroup[], sort: SortState): DrawingGroup[] {
  if (!sort) return groups;
  const { field, dir } = sort;
  const cmp = SORTABLE_FIELDS[field as keyof typeof SORTABLE_FIELDS]?.cmp;
  if (!cmp) return groups;
  const sign = dir === "desc" ? -1 : 1;
  return groups.map((g) => ({
    ...g,
    sheets: [...g.sheets].sort((a, b) => sign * cmp(a, b)),
  }));
}

/**
 * Flatten grouped sets into a virtual row list for @tanstack/react-virtual.
 * Emits group headers, optional set-only info rows, and child sheet rows.
 */
export function buildFlatDrawingRows(sortedGroups: DrawingGroup[], expanded: Set<string>): FlatDrawingRow[] {
  const rows: FlatDrawingRow[] = [];
  for (const group of sortedGroups) {
    const isExpanded = expanded.has(group.key);
    rows.push({ type: "group", group, isExpanded });
    if (isExpanded && group.setOnly) {
      rows.push({ type: "setOnlyInfo", group });
    }
    if (isExpanded && !group.setOnly) {
      for (const d of group.sheets) {
        rows.push({ type: "sheet", drawing: d, group });
      }
    }
  }
  return rows;
}

/** Virtualizer row height estimate by flat row type. */
export function estimateFlatRowHeight(row: FlatDrawingRow): number {
  if (row.type === "group") return 48;
  if (row.type === "setOnlyInfo") return 120;
  return 44;
}

/** Sort arrow suffix for active column headers. */
export function sortArrow(sort: SortState, field: string): string {
  if (sort?.field !== field) return "";
  return sort.dir === "asc" ? " ▲" : " ▼";
}

/** Style helper: hide cells on compact viewports without changing colSpan. */
export function compactHideStyle(compact: boolean): { display: string } | undefined {
  return compact ? { display: "none" } : undefined;
}

/** Discover group keys that appeared since last render (for auto-expand). */
export function findBrandNewGroupKeys(groups: DrawingGroup[], seenKeys: Set<string>): DrawingGroup[] {
  return groups.filter((g) => !seenKeys.has(g.key));
}
