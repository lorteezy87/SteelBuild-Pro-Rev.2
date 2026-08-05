/**
 * Pure drawing-set grouping and hour-burn helpers for WPFormModal.
 */
import { sortDrawingSetPackages } from "@/lib/drawingSetOrdering";
import {
  inputStyle,
  inputDisabledStyle,
} from "@/components/shared/PhoenixModal";

export const APPROVED_DRAWING_STAGES = [
  "Released",
  "IFC",
  "Issued for Construction",
  "OFS",
  "Approved",
  "Approved as Noted",
] as const;

export type DrawingLike = {
  id?: string | null;
  drawing_set_name?: string | null;
  stage?: string | null;
  status?: string | null;
};

export type DrawingSetOption = {
  key: string;
  set_name: string;
  isUngrouped: boolean;
  drawings: DrawingLike[];
};

export type DrawingSetOptionWithCounts = DrawingSetOption & {
  linkedCount: number;
  approvedCount: number;
  total: number;
};

export type LinkedSetGroup = {
  key: string;
  set_name: string;
  isUngrouped: boolean;
  ids: string[];
  total: number;
};

/** Group project drawings into set packages (assignable unit). */
export function buildDrawingSetOptions(
  projectDrawings: DrawingLike[] | null | undefined,
): DrawingSetOption[] {
  const map = new Map<string, DrawingSetOption>();
  for (const d of projectDrawings || []) {
    if (!d?.id) continue;
    const name = (d.drawing_set_name || "").trim();
    const key = name.toLowerCase() || "__unassigned__";
    let opt = map.get(key);
    if (!opt) {
      opt = { key, set_name: name || "Unassigned", isUngrouped: !name, drawings: [] };
      map.set(key, opt);
    }
    opt.drawings.push(d);
  }
  return sortDrawingSetPackages([...map.values()]);
}

/** Sets with at least one un-linked sheet, filtered by search. */
export function filterDrawingSetOptions(
  drawingSetOptions: DrawingSetOption[],
  linkedIdSet: Set<string>,
  setSearch: string,
  approvedStages: readonly string[] = APPROVED_DRAWING_STAGES,
): DrawingSetOptionWithCounts[] {
  return drawingSetOptions
    .map((opt) => {
      let linkedCount = 0;
      let approvedCount = 0;
      for (const d of opt.drawings) {
        if (d.id && linkedIdSet.has(d.id)) linkedCount += 1;
        if (approvedStages.includes(d.stage || d.status || "")) approvedCount += 1;
      }
      return { ...opt, linkedCount, approvedCount, total: opt.drawings.length };
    })
    .filter(
      (opt) =>
        opt.linkedCount < opt.total &&
        (!setSearch || opt.set_name.toLowerCase().includes(setSearch.toLowerCase())),
    );
}

/** Linked sheets grouped back into their sets. */
export function buildLinkedSetGroups(
  linkedDrawingIds: string[],
  allDrawings: DrawingLike[],
  drawingSetOptions: DrawingSetOption[],
): LinkedSetGroup[] {
  const map = new Map<string, LinkedSetGroup>();
  for (const id of linkedDrawingIds) {
    const d = allDrawings.find((dw) => dw.id === id);
    const name = (d?.drawing_set_name || "").trim();
    const key = name.toLowerCase() || "__unassigned__";
    let g = map.get(key);
    if (!g) {
      g = { key, set_name: name || "Unassigned", isUngrouped: !name, ids: [], total: 0 };
      map.set(key, g);
    }
    g.ids.push(id);
  }
  for (const opt of drawingSetOptions) {
    const g = map.get(opt.key);
    if (g) g.total = opt.drawings.length;
  }
  return sortDrawingSetPackages([...map.values()]);
}

export function hasApprovedLinkedDrawings(
  linkedDrawingIds: string[],
  allDrawings: DrawingLike[],
  approvedStages: readonly string[] = APPROVED_DRAWING_STAGES,
): boolean {
  return linkedDrawingIds.some((id) => {
    const d = allDrawings.find((dw) => dw.id === id);
    return Boolean(d && approvedStages.includes(d.stage || d.status || ""));
  });
}

export function computeHourBurns(form: {
  shop_hours_budget?: number | string | null;
  shop_hours_actual?: number | string | null;
  field_hours_budget?: number | string | null;
  field_hours_actual?: number | string | null;
}) {
  const shopBudget = Number(form.shop_hours_budget) || 0;
  const shopActual = Number(form.shop_hours_actual) || 0;
  const fieldBudget = Number(form.field_hours_budget) || 0;
  const fieldActual = Number(form.field_hours_actual) || 0;
  const shopBurn = shopBudget > 0 ? (shopActual / shopBudget) * 100 : 0;
  const fieldBurn = fieldBudget > 0 ? (fieldActual / fieldBudget) * 100 : 0;
  const totalBudget = shopBudget + fieldBudget;
  const totalActual = shopActual + fieldActual;
  const totalBurn = totalBudget > 0 ? (totalActual / totalBudget) * 100 : 0;
  return { shopBurn, fieldBurn, totalBudget, totalActual, totalBurn };
}

/** Plain object id → drawing map (legacy list lookup shape). */
export function buildDrawingIdRecord<T extends { id?: string | null }>(
  drawings: T[] | null | undefined,
): Record<string, T> {
  const m: Record<string, T> = {};
  for (const d of drawings || []) {
    if (d?.id) m[d.id] = d;
  }
  return m;
}

/** Default empty form state for create mode. */
export const EMPTY_WP_FORM = {
  name: "",
  project_id: "",
  project_name: "",
  phase: "Detailing",
  released_date: "",
  scheduled_start_date: "",
  scheduled_end_date: "",
  status: "Not Started",
  tonnage: 0,
  shop_hours_budget: 0,
  shop_hours_actual: 0,
  field_hours_budget: 0,
  field_hours_actual: 0,
  crew: "",
  linked_drawing_ids: "",
  linked_rfi_ids: "",
  notes: "",
  percent_complete: 0,
  vif_confirmed: false,
  vif_confirmed_by: "",
  vif_confirmed_date: "",
  load_list_complete: false,
  sequence_confirmed: false,
  area: "",
  sequence_number: "",
  trade_phase: "",
  shipping_phase: "",
  install_phase: "",
};

export const selectStyle = {
  ...inputStyle,
  cursor: "pointer",
};

/** Over-budget actual fields flip to error color. */
export function calcStyle(val: unknown, ref: unknown) {
  return {
    ...inputDisabledStyle,
    color:
      Number(val) > Number(ref) && Number(ref) > 0
        ? "var(--status-error)"
        : "var(--text-muted)",
  };
}
