import type { CSSProperties } from "react";
import type { Database } from "@/types/supabase";
import type { Drawing } from "@/hooks/useDrawings";
import { SORTABLE_FIELDS } from "./drawingsConfig";
import { groupByDrawingSet } from "./drawingsUtils";

export const EXPAND_LS_KEY = "sbp-drawings-expanded-sets-v2";

export type DrawingSetRow = Database["public"]["Tables"]["drawing_sets"]["Row"];
export type DrawingTableSortField = keyof typeof SORTABLE_FIELDS;
export type DrawingTableSort = {
  field: DrawingTableSortField;
  dir: "asc" | "desc";
} | null;

export interface DrawingGroupAggregates {
  total: number;
  stageCounts: Record<string, number>;
  releasedCount: number;
  percentReleased: number;
  earliestSubmitted: string | null;
  earliestDue: string | null;
  overdueCount: number;
  maxLate: number;
  aggregateStatus: string | null;
  disciplines: string[];
  hasPriority: boolean;
  maxRev: string | number;
  aiProcessed: number;
  aiNeedsReview: number;
  aiExtracting: number;
  aiFailed: number;
  stageSummary: string | null;
  driveUrl: string | null;
  revisionHistory: string | null;
  eventCount: number | null;
}

export interface DrawingGroup {
  key: string;
  setId: string | null;
  setNumber: string;
  name: string;
  isUngrouped: boolean;
  setOnly: boolean;
  parent: DrawingSetRow | null;
  sheets: Drawing[];
  aggregates: DrawingGroupAggregates;
}

export type FlatDrawingRow =
  | { type: "group"; group: DrawingGroup; isExpanded: boolean }
  | { type: "setOnlyInfo"; group: DrawingGroup }
  | { type: "sheet"; drawing: Drawing; group: DrawingGroup };

export interface DrawingSelectionState {
  selectedCount: number;
  allSelected: boolean;
  indeterminate: boolean;
}

export interface DrawingTableViewModel {
  groups: DrawingGroup[];
  rows: FlatDrawingRow[];
}

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
} satisfies CSSProperties;

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
] satisfies ReadonlyArray<{
  key: string;
  field: DrawingTableSortField | null;
  label: string;
  width?: number;
  hidden?: boolean;
}>;

export function loadExpandedSets(): Set<string> | null {
  try {
    const raw = localStorage.getItem(EXPAND_LS_KEY);
    if (!raw) return null;
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return null;
  }
}

export function saveExpandedSets(set: ReadonlySet<string>): void {
  try {
    localStorage.setItem(EXPAND_LS_KEY, JSON.stringify([...set]));
  } catch {
    // Expansion persistence is optional; storage can be unavailable.
  }
}

export function nextSortState(
  prev: DrawingTableSort,
  field: DrawingTableSortField,
): DrawingTableSort {
  if (!prev || prev.field !== field) return { field, dir: "asc" };
  if (prev.dir === "asc") return { field, dir: "desc" };
  return null;
}

export function sortDrawingGroups(
  groups: DrawingGroup[],
  sort: DrawingTableSort,
): DrawingGroup[] {
  if (!sort) return groups;
  const { field, dir } = sort;
  const cmp = SORTABLE_FIELDS[field].cmp;
  const sign = dir === "desc" ? -1 : 1;
  return groups.map((group) => ({
    ...group,
    sheets: [...group.sheets].sort((a, b) => sign * cmp(a, b)),
  }));
}

export function buildFlatDrawingRows(
  sortedGroups: DrawingGroup[],
  expanded: ReadonlySet<string>,
): FlatDrawingRow[] {
  const rows: FlatDrawingRow[] = [];
  for (const group of sortedGroups) {
    const isExpanded = expanded.has(group.key);
    rows.push({ type: "group", group, isExpanded });
    if (isExpanded && group.setOnly) {
      rows.push({ type: "setOnlyInfo", group });
    }
    if (isExpanded && !group.setOnly) {
      for (const drawing of group.sheets) {
        rows.push({ type: "sheet", drawing, group });
      }
    }
  }
  return rows;
}

export function buildDrawingTableViewModel(
  groups: DrawingGroup[],
  sort: DrawingTableSort,
  expanded: ReadonlySet<string>,
): DrawingTableViewModel {
  const sortedGroups = sortDrawingGroups(groups, sort);
  return {
    groups,
    rows: buildFlatDrawingRows(sortedGroups, expanded),
  };
}

export function buildDrawingGroups(
  drawings: Drawing[],
  drawingSetMap: Record<string, DrawingSetRow>,
): DrawingGroup[] {
  return groupByDrawingSet(drawings, drawingSetMap) as DrawingGroup[];
}

export function deriveSelectionState(
  drawings: ReadonlyArray<Pick<Drawing, "id">>,
  selected: ReadonlySet<string>,
): DrawingSelectionState {
  const selectedCount = drawings.reduce(
    (count, drawing) => count + Number(selected.has(drawing.id)),
    0,
  );
  const allSelected = drawings.length > 0 && selectedCount === drawings.length;
  return {
    selectedCount,
    allSelected,
    indeterminate: selectedCount > 0 && !allSelected,
  };
}

export function deriveGroupSelectionState(
  group: Pick<DrawingGroup, "sheets">,
  selected: ReadonlySet<string>,
): DrawingSelectionState {
  return deriveSelectionState(group.sheets, selected);
}

export function getGroupSelectionToggleIds(
  group: Pick<DrawingGroup, "sheets">,
  selected: ReadonlySet<string>,
): string[] {
  const selection = deriveGroupSelectionState(group, selected);
  return group.sheets
    .filter((drawing) => (
      selection.allSelected ? selected.has(drawing.id) : !selected.has(drawing.id)
    ))
    .map((drawing) => drawing.id);
}

export function estimateFlatRowHeight(row: FlatDrawingRow): number {
  if (row.type === "group") return 48;
  if (row.type === "setOnlyInfo") return 120;
  return 44;
}

export function sortArrow(
  sort: DrawingTableSort,
  field: DrawingTableSortField,
): string {
  if (sort?.field !== field) return "";
  return sort.dir === "asc" ? " ▲" : " ▼";
}

export function compactHideStyle(compact: boolean): CSSProperties | undefined {
  return compact ? { display: "none" } : undefined;
}

export function findBrandNewGroupKeys(
  groups: DrawingGroup[],
  seenKeys: ReadonlySet<string>,
): DrawingGroup[] {
  return groups.filter((group) => !seenKeys.has(group.key));
}
