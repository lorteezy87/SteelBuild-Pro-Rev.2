import { ClipboardList, FileStack, Gauge, Layers3, Workflow } from "lucide-react";
import { compareDrawingSetPackages } from "@/lib/drawingSetOrdering";
import type { Drawing, DrawingSet, DueInfo, SetPackage, Submittal, TriageItem } from "./types";

// ── Design-system tokens ──────────────────────────────────────────────────
// Use the SAME CSS custom-property names as the rest of the app (Submittals,
// Drawings, RFIs, etc.).
export const accent = "var(--accent)";
export const surface1 = "var(--bg-surface-low)";
export const surface2 = "var(--bg-surface-high)";
export const border = "var(--border-default)";
export const textPrimary = "var(--text-primary)";
export const textMuted = "var(--text-muted)";
export const mono = "var(--font-mono)";
export const success = "var(--status-success)";
export const warning = "var(--status-warning)";
export const error = "var(--status-error)";
export const info = "var(--status-info)";
export const review = "var(--status-review)";

export const TABS = [
  { key: "overview", label: "Control Board", icon: Gauge },
  { key: "process", label: "Process Board", icon: Layers3 },
  { key: "drawings", label: "Drawing Register", icon: FileStack },
  { key: "submittals", label: "Submittal Register", icon: ClipboardList },
  { key: "matrix", label: "Approval Matrix", icon: Workflow },
];

// ── Status colors for matrix ───────────────────────────────────────────────
export const STATUS_COLORS: Record<string, string> = {
  Draft:                 "#64748b",
  Submitted:             "#3b82f6",
  "Under Review":        "#0d9488",
  Approved:              "#10b981",
  "Approved as Noted":   "#84cc16",
  "Revise and Resubmit": "#f59e0b",
  Rejected:              "#ef4444",
  "Released for Fabrication": "#0ea5e9",
  Void:                  "#6b7280",
};

export const CLOSED_SUBMITTAL_STATUSES = new Set([
  "Approved",
  "Approved as Noted",
  "Released for Fabrication",
  "Void",
]);

// Ball-in-court choices — matches the canonical list used in submittal modals
// (src/components/submittals/NewRoundModal.jsx).
export const BIC_CHOICES = [
  "Detailer", "S&H", "Contractor", "Subcontractor",
  "EOR", "Architect", "AOR",
  "GC", "Owner",
];

export const ACTION_STATUSES = new Set([
  "Rejected",
  "Revise and Resubmit",
]);

export function toLocalDay(input: any): Date | null {
  if (!input) return null;
  if (input instanceof Date) {
    if (!Number.isFinite(input.getTime())) return null;
    return new Date(input.getFullYear(), input.getMonth(), input.getDate());
  }
  if (typeof input === "string") {
    const match = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    }
  }
  const parsed = new Date(input);
  if (!Number.isFinite(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

export function daysUntil(input: any): number | null {
  const due = toLocalDay(input);
  if (!due) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

export function dueInfo(input: any, closed = false): DueInfo {
  if (closed) {
    return { label: "Closed", days: null, overdue: false, dueSoon: false, tone: success, sort: 99999 };
  }
  const days = daysUntil(input);
  if (days === null) {
    return { label: "No date", days: null, overdue: false, dueSoon: false, tone: textMuted, sort: 99998 };
  }
  if (days < 0) {
    return { label: `${Math.abs(days)}d late`, days, overdue: true, dueSoon: false, tone: error, sort: days };
  }
  if (days === 0) {
    return { label: "Due today", days, overdue: false, dueSoon: true, tone: warning, sort: 0 };
  }
  if (days <= 7) {
    return { label: `${days}d left`, days, overdue: false, dueSoon: true, tone: warning, sort: days };
  }
  return { label: fmtDate(input), days, overdue: false, dueSoon: false, tone: textMuted, sort: days };
}

export function getSubmittalDueDate(submittal: Submittal | null | undefined): string | null {
  return submittal?.required_date || submittal?.due_date || submittal?.date_required || null;
}

export function getDrawingDueDate(drawing: Drawing | null | undefined): string | null {
  return drawing?.due_date || drawing?.required_date || drawing?.target_date || null;
}

export function getSetDisplayName({ parent, legacyName, fallback = "Ungrouped drawing set" }: { parent?: DrawingSet | null; legacyName?: string; fallback?: string } = {}): string {
  return (parent?.set_name || legacyName || fallback).trim();
}

export function compareDueDates(a: any, b: any): number {
  const ad = daysUntil(a);
  const bd = daysUntil(b);
  if (ad === null && bd === null) return 0;
  if (ad === null) return 1;
  if (bd === null) return -1;
  return ad - bd;
}

export function earliestDate(values: any[]): any {
  return values.filter(Boolean).sort(compareDueDates)[0] || null;
}

export function isClosedSubmittal(submittal: Submittal | null | undefined): boolean {
  return CLOSED_SUBMITTAL_STATUSES.has(submittal?.status);
}

export function isClosedDrawing(drawing: Drawing | null | undefined): boolean {
  return drawing?.stage === "Released" || drawing?.set_approval_status === "approved";
}

export function rollupDrawingStage(sheets: Drawing[]): string {
  if (!sheets.length) return "No sheets";
  if (sheets.every(isClosedDrawing)) return "Released";
  if (sheets.some((d) => ["Rejected", "Revise and Resubmit", "Returned"].includes(d.stage))) return "Needs Action";
  if (sheets.some((d) => ["IFA", "OFA", "BFA", "OFS", "IFC"].includes(d.stage))) return "In Review";
  return sheets[0]?.stage || "No stage";
}

export function buildSetPackages(drawings: Drawing[], drawingSets: DrawingSet[], submittals: Submittal[]): SetPackage[] {
  const parentsById = new Map<string, DrawingSet>(
    (drawingSets || []).filter((set) => !set?.is_deleted).map((set): [string, DrawingSet] => [set.id as string, set])
  );
  const parentsByName = new Map<string, DrawingSet>(
    Array.from(parentsById.values())
      .map((set): [string, DrawingSet] => [(set.set_name || "").trim().toLowerCase(), set])
      .filter(([name]) => !!name)
  );
  const packages = new Map<string, SetPackage>();

  const ensurePackage = ({ setId = null, legacyName = "", parent = null }: { setId?: string | null; legacyName?: string; parent?: DrawingSet | null }) => {
    const key = setId ? `id:${setId}` : `name:${(legacyName || "").trim() || "Ungrouped drawing set"}`;
    if (!packages.has(key)) {
      packages.set(key, {
        key,
        setId,
        name: getSetDisplayName({ parent, legacyName }),
        parent,
        sheets: [],
        submittals: [],
      });
    }
    return packages.get(key);
  };

  for (const parent of parentsById.values()) {
    ensurePackage({ setId: parent.id, legacyName: parent.set_name, parent });
  }

  for (const drawing of drawings || []) {
    if (!drawing || drawing.is_deleted || drawing.is_superseded) continue;
    const parent = drawing.drawing_set_id ? parentsById.get(drawing.drawing_set_id) : null;
    const pkg = ensurePackage({
      setId: drawing.drawing_set_id || null,
      legacyName: drawing.drawing_set_name,
      parent,
    });
    pkg.sheets.push(drawing);
  }

  for (const submittal of submittals || []) {
    if (!submittal || submittal.is_deleted) continue;
    const ids = Array.isArray(submittal.drawing_set_ids) ? submittal.drawing_set_ids.filter(Boolean) : [];
    if (ids.length) {
      ids.forEach((setId) => {
        const parent = parentsById.get(setId);
        ensurePackage({ setId, legacyName: parent?.set_name || submittal.drawing_set_name, parent }).submittals.push(submittal);
      });
      continue;
    }
    if (submittal.drawing_set_name) {
      const parent = parentsByName.get(submittal.drawing_set_name.trim().toLowerCase()) || null;
      ensurePackage({
        setId: parent?.id || null,
        legacyName: submittal.drawing_set_name,
        parent,
      }).submittals.push(submittal);
    }
  }

  return Array.from(packages.values())
    .filter((pkg) => pkg.name && pkg.name !== "Ungrouped drawing set" ? true : pkg.sheets.length || pkg.submittals.length)
    .sort(compareDrawingSetPackages);
}

export function itemUrgency(a: TriageItem, b: TriageItem): number {
  const rank = (item: TriageItem) => {
    if (item.due.overdue) return 0;
    if (item.due.dueSoon) return 1;
    if (item.needsAction) return 2;
    if (!item.dueDate) return 3;
    return 4;
  };
  return rank(a) - rank(b) || a.due.sort - b.due.sort || a.title.localeCompare(b.title);
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function getStatusColor(status: string): string {
  return STATUS_COLORS[status] || textMuted;
}

export function getActionTone(item: any): string {
  if (item?.due?.overdue) return error;
  if (item?.needsAction) return review;
  if (item?.due?.dueSoon) return warning;
  return info;
}

export function fmtDate(d: any): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
  } catch {
    return "—";
  }
}
