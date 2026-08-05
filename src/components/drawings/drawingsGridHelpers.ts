/**
 * Pure drawing-set grouping for DrawingsGrid.
 */
import { isOverdue } from "./drawingsUtils";
import {
  compareDrawingSetPackages,
  getDrawingSetNumber,
} from "@/lib/drawingSetOrdering";

export const UNGROUPED_KEY = "__ungrouped__";
export const UNGROUPED_LABEL = "UNGROUPED SHEETS";

export function buildGroups(drawings, drawingSets) {
  const drawingSetMap = {};
  (drawingSets || []).forEach((set) => {
    if (set?.id) drawingSetMap[set.id] = set;
  });

  const buckets = new Map();
  (drawings || []).forEach((drawing) => {
    const setId = drawing.drawing_set_id || null;
    const legacyName = (drawing.drawing_set_name || "").trim();
    const key = setId ? `id:${setId}` : legacyName ? `name:${legacyName}` : UNGROUPED_KEY;
    if (!buckets.has(key)) {
      const parent = setId ? drawingSetMap[setId] : null;
      buckets.set(key, {
        key,
        setId,
        name: (parent?.set_name || legacyName || UNGROUPED_LABEL).trim(),
        setNumber: getDrawingSetNumber(parent || { name: legacyName }),
        parent,
        isUngrouped: key === UNGROUPED_KEY,
        sheets: [],
      });
    }
    buckets.get(key).sheets.push(drawing);
  });

  Object.values(drawingSetMap).forEach((parent) => {
    const key = `id:${parent.id}`;
    if (buckets.has(key)) return;
    buckets.set(key, {
      key,
      setId: parent.id,
      name: (parent.set_name || "").trim() || UNGROUPED_LABEL,
      setNumber: getDrawingSetNumber(parent),
      parent,
      isUngrouped: false,
      sheets: [],
    });
  });

  return [...buckets.values()]
    .map((group) => {
      const sheets = [...group.sheets].sort((a, b) =>
        String(a.sheet_number || "").localeCompare(String(b.sheet_number || ""), undefined, {
          numeric: true,
          sensitivity: "base",
        }),
      );
      const overdueCount = sheets.filter((sheet) => isOverdue(sheet)).length;
      const approval = group.parent?.set_approval_status
        || sheets.find((sheet) => sheet.set_approval_status)?.set_approval_status
        || null;
      return {
        ...group,
        sheets,
        aggregates: {
          total: sheets.length,
          overdueCount,
          approval,
          sheetCount: Number(group.parent?.sheet_count) || sheets.length,
          processed: Number(group.parent?.processed_count) || 0,
          needsReview: Number(group.parent?.needs_review_count) || 0,
          failed: Number(group.parent?.failed_count) || 0,
          revision: group.parent?.revision || null,
          issuedDate: group.parent?.issued_date || null,
          issuedBy: group.parent?.issued_by || null,
          fileUrl: group.parent?.file_url || null,
        },
      };
    })
    .sort((a, b) => {
      if (a.isUngrouped && !b.isUngrouped) return 1;
      if (!a.isUngrouped && b.isUngrouped) return -1;
      return compareDrawingSetPackages(a, b);
    });
}

export const EXPAND_LS_KEY = "sbp-drawings-grid-expanded-sets";

export function loadExpandedSets(): Set<string> | null {
  try {
    const raw =
      typeof localStorage !== "undefined"
        ? localStorage.getItem(EXPAND_LS_KEY)
        : null;
    if (!raw) return null;
    return new Set(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveExpandedSets(set: Set<string>): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(EXPAND_LS_KEY, JSON.stringify([...set]));
  } catch {
    // noop
  }
}

export function approvalPillTone(approval: string | null | undefined): {
  color: string;
  background: string;
  border: string;
} | null {
  if (!approval) return null;
  if (approval === "approved") {
    return {
      color: "var(--status-success)",
      background: "rgba(16,185,129,0.12)",
      border: "rgba(16,185,129,0.25)",
    };
  }
  if (approval === "rejected") {
    return {
      color: "var(--status-error)",
      background: "var(--danger-muted)",
      border: "var(--danger-border)",
    };
  }
  if (approval === "pending_review") {
    return {
      color: "var(--status-warning)",
      background: "rgba(245,158,11,0.14)",
      border: "rgba(245,158,11,0.25)",
    };
  }
  return {
    color: "var(--text-muted)",
    background: "var(--bg-surface-high)",
    border: "var(--border-default)",
  };
}

