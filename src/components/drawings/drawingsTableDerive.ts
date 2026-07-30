// Pure derive helpers extracted from DrawingsTable.jsx — column defs, sort
// helpers, flat row builders, and expand/collapse persistence. No React imports.
import { SORTABLE_FIELDS } from "./drawingsConfig";

export const EXPAND_LS_KEY = "sbp-drawings-expanded-sets-v2";

/** Monospace header cell styles (stable reference for the table thead). */
export const TABLE_HEADER_STYLE = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.15em",
  color: "var(--text-muted)",
  textTransform: "uppercase",
  padding: "10px 12px",
  textAlign: "left",
  borderBottom: "1px solid var(--border-default)",
  whiteSpace: "nowrap",
  background: "var(--bg-surface)",
};

/**
 * Column definitions for the register table. `field: null` marks non-sortable
 * columns (approval / actions). Discipline and reviewer are hidden in the DOM
 * but kept for colSpan stability.
 */
export const TABLE_COLUMNS = [
  { key: "checkbox", field: null, label: "", width: 36 },
  { key: "sheet_number", field: "sheet_number", label: SORTABLE_FIELDS.sheet_number.label },
  { key: "title", field: "title", label: SORTABLE_FIELDS.title.label },
  { key: "discipline", field: "discipline", label: SORTABLE_FIELDS.discipline.label, hidden: true },
  { key: "revision_number", field: "revision_number", label: SORTABLE_FIELDS.revision_number.label },
  { key: "stage", field: "stage", label: SORTABLE_FIELDS.stage.label },
  { key: "submitted_date", field: "submitted_date", label: SORTABLE_FIELDS.submitted_date.label, compactHide: true },
  { key: "due_date", field: "due_date", label: SORTABLE_FIELDS.due_date.label },
  { key: "reviewer", field: "reviewer", label: SORTABLE_FIELDS.reviewer.label, hidden: true },
  { key: "approval", field: null, label: "APPROVAL" },
  { key: "actions", field: null, label: "" },
];

export function loadExpandedSets() {
  try {
    const raw = localStorage.getItem(EXPAND_LS_KEY);
    if (!raw) return null;
    return new Set(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveExpandedSets(set) {
  try {
    localStorage.setItem(EXPAND_LS_KEY, JSON.stringify([...set]));
  } catch { /* noop */ }
}

/**
 * Toggle sort state: off → asc → desc → off (null).
 * Byte-identical to DrawingsTable handleSort reducer logic.
 */
export function nextSortState(prev, field) {
  if (!prev || prev.field !== field) return { field, dir: "asc" };
  if (prev.dir === "asc") return { field, dir: "desc" };
  return null;
}

/** Sort sheet lists within each group; groups stay in alphabetical order. */
export function sortDrawingGroups(groups, sort) {
  if (!sort) return groups;
  const { field, dir } = sort;
  const cmp = SORTABLE_FIELDS[field]?.cmp;
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
export function buildFlatDrawingRows(sortedGroups, expanded) {
  const rows = [];
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
export function estimateFlatRowHeight(row) {
  if (row.type === "group") return 62;
  if (row.type === "setOnlyInfo") return 120;
  return 48;
}

/** Sort arrow suffix for active column headers. */
export function sortArrow(sort, field) {
  if (sort?.field !== field) return "";
  return sort.dir === "asc" ? " ▲" : " ▼";
}

/** Style helper: hide cells on compact viewports without changing colSpan. */
export function compactHideStyle(compact) {
  return compact ? { display: "none" } : undefined;
}

/** Discover group keys that appeared since last render (for auto-expand). */
export function findBrandNewGroupKeys(groups, seenKeys) {
  return groups.filter((g) => !seenKeys.has(g.key));
}
