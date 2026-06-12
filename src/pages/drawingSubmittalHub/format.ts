import { ClipboardList, FileStack, Gauge, Layers3, ShieldCheck, Workflow } from "lucide-react";
import { compareDrawingSetPackages } from "@/lib/drawingSetOrdering";
import { STAGE_MAP } from "@/components/drawings/drawingsConfig";
import { effectiveDetailingState, hasGoverningSubmittal } from "@/lib/detailingPackageState";
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
  { key: "doccontrol", label: "Doc Control", icon: ShieldCheck },
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

// "Closed" here means CLOSED FOR DUE-DATE / TRIAGE PURPOSES — the workflow has
// truly ended: Released for Fabrication (the terminal stage) or Void (dead).
// It is deliberately NARROW: "Approved" / "Approved as Noted" are NOT closed,
// because submittalStageMapping maps them to BFA/OFS/IFC — there is still
// Out-For-Scrub → IFC → Release work (with its own due dates) ahead. Including
// them here made a drawing set's due status flip to "Closed" the instant an
// approved submittal was linked, hiding the real stage. Mirrors the canonical
// set in components/submittals/SubmittalVisualBoard.jsx.
//
// NOT the same as useSubmittals' TERMINAL_APPROVED_STATUSES (which DOES include
// Approved/AAN) — that set governs auto-LOCKING the linked drawing set from
// edits, a separate concern from "closed" for due/triage. Don't merge the two.
export const CLOSED_SUBMITTAL_STATUSES = new Set([
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

/** YYYY-MM-DD for an `<input type="date">`, read as a LOCAL calendar day so a
 *  stored value round-trips without the UTC shift that `toISOString()` causes. */
export function toDateInputValue(input: any): string {
  const local = toLocalDay(input);
  if (!local) return "";
  return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
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

// A package is CLOSED when a terminal signal fires. "Who governs" is decided
// exactly as everywhere else (hasGoverningSubmittal / pickMostRecentSubmittal
// over USABLE submittals, inside effectiveDetailingState), so the closed flag
// ALWAYS agrees with the operational stage the hub shows for the same package:
//   1. Manual release states (drawing_sets.detailing_state = Partially Released
//      / Released for Erection) are explicit and always terminal — e.g. a
//      manually-released anchor-bolt set stays closed without a RFF submittal.
//   2. detailing_state "Released" closes the package ONLY when a submittal drove
//      it (status Released for Fabrication). When it comes from the deprecated
//      drawings.stage MAJORITY fallback (no governing submittal), defer to the
//      stricter all-sheets gate in (4): a plurality of legacy 'Released' sheets
//      must not close a package that still has open sheets.
//   3. When NO submittal governs, a closed-status latest submittal closes the
//      package — the dead/Void-only set case (Void is never "usable", so it
//      never governs; an all-Void set has no stage and is treated as closed).
//   4. Legacy/DEPRECATED columns (§20-21) — drawing_sets.set_approval_status and
//      EVERY sheet released — but ONLY when no submittal governs. A governing
//      submittal's stage (decided above) always wins, so a stale 'approved'
//      column can't mask a real mid-flow submittal.
// Critically NOT the same as the round_number-based "latest" used before: a Void
// or Released-for-Fab submittal with a higher round_number must not mask a lower
// round that still governs the package. Used by the hit-list triage and the
// "Released" KPI so both agree on "done".
export function isClosedPackage(pkg: SetPackage | null | undefined): boolean {
  if (!pkg) return false;
  const governs = hasGoverningSubmittal(pkg.submittals);
  const detailingState = effectiveDetailingState(pkg.parent, pkg.submittals, pkg.sheets);

  // (1) Explicit manual release states — always terminal.
  if (detailingState === "Partially Released" || detailingState === "Released for Erection") return true;
  // (2) "Released" is terminal only when a submittal drove it (RFF), not when it
  //     came from the deprecated sheet-stage majority fallback.
  if (detailingState === "Released" && governs) return true;

  if (!governs) {
    // (3) Dead/Void-only set: no usable submittal governs, but a terminal-status
    //     submittal (Void) is present → closed.
    const latest = (pkg.submittals || []).slice().sort((a, b) => (b.round_number || 0) - (a.round_number || 0))[0] || null;
    if (latest && isClosedSubmittal(latest)) return true;
    // (4) Deprecated legacy columns — strict: the SET flag, or EVERY sheet closed.
    if (pkg.parent?.set_approval_status === "approved") return true;
    if (pkg.sheets.length > 0 && pkg.sheets.every(isClosedDrawing)) return true;
  }
  return false;
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

// Colors for the coalesced OPERATIONAL state vocabulary (drafting + release
// states; the submittal stages IFA..Released reuse the canonical STAGE_MAP).
const OPERATIONAL_STATE_COLORS: Record<string, string> = {
  "Not Started":          "#64748b", // slate
  "In Detailing":         "#64748b", // slate
  "Internal Review":      "#38bdf8", // sky
  "Ready to Submit":      "#818cf8", // indigo
  "Partially Released":   "#10b981", // emerald
  "Released for Erection":"#14b8a6", // teal
};

/** Color for any operational state: drafting/release overrides, then the
 *  canonical stage color (IFA..Released), then submittal status, then muted. */
export function getOperationalStateColor(state: string): string {
  if (OPERATIONAL_STATE_COLORS[state]) return OPERATIONAL_STATE_COLORS[state];
  const stage = STAGE_MAP[state];
  if (stage?.color) return stage.color;
  return STATUS_COLORS[state] || textMuted;
}

export function getActionTone(item: any): string {
  if (item?.due?.overdue) return error;
  if (item?.needsAction) return review;
  if (item?.due?.dueSoon) return warning;
  return info;
}

export function fmtDate(d: any): string {
  if (!d) return "—";
  // Parse through toLocalDay so a date-only string ("2026-06-10") is read as a
  // LOCAL calendar day, not UTC midnight. Arizona is UTC-7 with no DST, so the
  // naive `new Date("2026-06-10").toLocaleDateString()` renders one day early
  // (the value lands at 17:00 the previous local day). toLocalDay already backs
  // daysUntil/dueInfo — fmtDate must agree with it or the chip label and the
  // printed date disagree by a day.
  const local = toLocalDay(d);
  if (!local) return "—";
  return local.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
}
