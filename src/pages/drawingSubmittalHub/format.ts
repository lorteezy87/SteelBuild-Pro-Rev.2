import { ClipboardList, FileStack, Gauge, GitCompareArrows, Layers3, ShieldCheck, Workflow } from "lucide-react";
import { compareDrawingSetPackages, formatDrawingSetNumber } from "@/lib/drawingSetOrdering";
import { STAGE_MAP } from "@/components/drawings/drawingsConfig";
import { DRAFTING_STATES, effectiveDetailingState, hasGoverningSubmittal, isPackageRR } from "@/lib/detailingPackageState";
import { computeSequenceReadiness } from "@/lib/detailingReadiness";
import { workingDaysBetween } from "@/lib/workingDays";
import { todayLocalISO } from "@/lib/dateMath";
import { pickMostRecentSubmittal, submittalStatusToStage } from "@/lib/submittalStageMapping";
import type { CurrentRevisionInfo, Drawing, DrawingRevision, DrawingSet, DueInfo, SetPackage, Submittal, TriageItem } from "./types";

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
  { key: "revimpact", label: "Revision Impact", icon: GitCompareArrows },
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
// set in the canonical process board.
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

// ── Working-day-aware due display (Phase 5, flag-gated at the call site) ──────
// When the `submittal_workday_dues` flag is ON, the countdown/overdue signal is
// counted in WORKING days (Mon–Fri) rather than calendar days, so "3d left" on
// a Thursday means three business days, not "includes the weekend". Flag OFF
// keeps today's calendar-day dueInfo untouched. Pure + tested; `today` is
// injected (defaults to local today) so it stays deterministic.

/** Working days left until `input`; negative = working days overdue. null on no/bad date. */
export function workdaysUntil(input: any, today?: string): number | null {
  const due = toDateInputValue(input); // normalize to a local 'YYYY-MM-DD'
  if (!due) return null;
  return workingDaysBetween(today || todayLocalISO(), due);
}

/**
 * Working-day variant of dueInfo. Same DueInfo shape + tone tokens as the
 * calendar-day version so the UI is a drop-in swap, but the day count, the "Nd
 * left / Nd late" label, and the due-soon window are all in WORKING days. The
 * dueSoon window is 5 working days (~ one week) to match the calendar 7-day one.
 */
export function workdayDueInfo(input: any, closed = false, today?: string): DueInfo {
  if (closed) {
    return { label: "Closed", days: null, overdue: false, dueSoon: false, tone: success, sort: 99999 };
  }
  const days = workdaysUntil(input, today);
  if (days === null) {
    return { label: "No date", days: null, overdue: false, dueSoon: false, tone: textMuted, sort: 99998 };
  }
  if (days < 0) {
    return { label: `${Math.abs(days)}d late`, days, overdue: true, dueSoon: false, tone: error, sort: days };
  }
  if (days === 0) {
    return { label: "Due today", days, overdue: false, dueSoon: true, tone: warning, sort: 0 };
  }
  if (days <= 5) {
    return { label: `${days}d left`, days, overdue: false, dueSoon: true, tone: warning, sort: days };
  }
  return { label: fmtDate(input), days, overdue: false, dueSoon: false, tone: textMuted, sort: days };
}

/**
 * Flag-aware dispatcher: the working-day dueInfo when `useWorkdays` is true,
 * else the calendar-day one. Callers pass the resolved `submittal_workday_dues`
 * flag here; every existing call site keeps its calendar-day behavior by simply
 * not opting in (useWorkdays defaults false).
 */
export function dueInfoFor(
  input: any,
  { closed = false, useWorkdays = false, today }: { closed?: boolean; useWorkdays?: boolean; today?: string } = {},
): DueInfo {
  return useWorkdays ? workdayDueInfo(input, closed, today) : dueInfo(input, closed);
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

/** Returns the entity ids to update when an operator edits the due date on a
 *  Control Board triage item.
 *
 *  - Submittal-governed packages: one submittal id (required_date is the source
 *    of truth; the read side is getSubmittalDueDate).
 *  - Drawing-set packages (no linked submittal): ALL sheet ids so that the
 *    displayed due date (earliestDate over all sheets) always reflects the write.
 *    Writing only sheets[0] produced a stale display because earliestDate could
 *    return a different sheet's date after the refetch.
 *
 * Returns { submittalId } | { sheetIds } so the caller never confuses the two paths.
 */
export function dueDateWriteTargets(
  item: Pick<TriageItem, "_submittalId" | "_sheetIds">
): { submittalId: string } | { sheetIds: string[] } {
  if (item._submittalId) {
    return { submittalId: item._submittalId };
  }
  return { sheetIds: item._sheetIds ?? [] };
}

function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

/** Return a user-facing failure reason before a due-date mutation is sent. */
export function validateDueDateWrite(
  item: Partial<TriageItem> & { closed?: boolean },
  date: unknown,
): string | null {
  if (item?.closed) return "Closed work cannot receive an active due date.";
  if (!isValidIsoDate(date)) return "Enter a valid calendar date.";
  const targets = dueDateWriteTargets(item as Pick<TriageItem, "_submittalId" | "_sheetIds">);
  if ("sheetIds" in targets && targets.sheetIds.length === 0) return "No package sheets are available for a due-date update.";
  return null;
}

const WORKFLOW_STAGE_STATES = new Set(["IFA", "OFA", "BFA", "R&R", "OFS", "IFC", "Released", "Partially Released", "Released for Erection"]);

/** Manual detailing state is a pre-submittal recovery action only. */
export function validateDetailingStateWrite(
  item: { _drawingSetId?: string | null; _submittalId?: string | null; detailingState?: string | null } | null | undefined,
  next: unknown,
): string | null {
  if (!item?._drawingSetId) return "No drawing set is available for a detailing-state update.";
  if (item._submittalId) return "Formal detailing state is owned by the linked Submittal.";
  if (typeof next !== "string" || !DRAFTING_STATES.includes(next)) return "Only pre-submittal detailing states can be set here.";
  if (WORKFLOW_STAGE_STATES.has(item.detailingState || "")) return "The package has reached the formal workflow and cannot move back to drafting here.";
  return null;
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
  return CLOSED_SUBMITTAL_STATUSES.has(submittal?.status ?? "");
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
  if (sheets.some((d) => ["Rejected", "Revise and Resubmit", "Returned"].includes(d.stage ?? ""))) return "Needs Action";
  if (sheets.some((d) => ["IFA", "OFA", "BFA", "OFS", "IFC"].includes(d.stage ?? ""))) return "In Review";
  return sheets[0]?.stage || "No stage";
}

export function buildSetPackages(drawings: Drawing[], drawingSets: DrawingSet[], submittals: Submittal[]): SetPackage[] {
  const parentsById = new Map<string, DrawingSet>(
    (drawingSets || []).filter((set) => !set?.is_deleted).map((set): [string, DrawingSet] => [set.id as string, set])
  );
  const parentNameGroups = new Map<string, DrawingSet[]>();
  for (const parent of parentsById.values()) {
    const name = (parent.set_name || "").trim().toLowerCase();
    if (!name) continue;
    const group = parentNameGroups.get(name) || [];
    group.push(parent);
    parentNameGroups.set(name, group);
  }
  // A name-only legacy link is safe only when exactly one active parent owns
  // that name. Ambiguous names remain unlinked instead of merging IDs.
  const parentsByName = new Map<string, DrawingSet>(
    Array.from(parentNameGroups.entries())
      .filter(([, parents]) => parents.length === 1)
      .map(([name, parents]) => [name, parents[0]])
  );
  const packages = new Map<string, SetPackage>();

  const ensurePackage = ({ setId = null, legacyName = "", parent = null }: { setId?: string | null; legacyName?: string; parent?: DrawingSet | null }): SetPackage => {
    const key = setId ? `id:${setId}` : `name:${(legacyName || "").trim() || "Ungrouped drawing set"}`;
    let pkg = packages.get(key);
    if (!pkg) {
      pkg = {
        key,
        setId,
        name: getSetDisplayName({ parent, legacyName }),
        parent,
        sheets: [],
        submittals: [],
      };
      packages.set(key, pkg);
    }
    return pkg;
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
        if (parent) ensurePackage({ setId, legacyName: parent.set_name || submittal.drawing_set_name, parent }).submittals.push(submittal);
      });
      continue;
    }
    if (submittal.drawing_set_name) {
      const parent = parentsByName.get(submittal.drawing_set_name.trim().toLowerCase()) || null;
      // No unique active parent means this is an actionable unlinked
      // Submittal, not a synthetic package that could imply the wrong owner.
      if (parent) ensurePackage({ setId: parent.id, legacyName: parent.set_name || submittal.drawing_set_name, parent }).submittals.push(submittal);
    }
  }

  return Array.from(packages.values())
    .filter((pkg) => pkg.name && pkg.name !== "Ungrouped drawing set" ? true : pkg.sheets.length || pkg.submittals.length)
    .sort(compareDrawingSetPackages);
}

// ── Authoritative current revision (§20-21) ────────────────────────────────
// The Drawing Register's "Rev" column must read the AUTHORITATIVE current
// revision from `drawing_revisions` (the row WHERE is_current=true), NOT the
// deprecated free-text `drawings.revision_number` (which drifts: it lags the
// real revision_code, and values like "A " parse to 0). One row is current per
// drawing (DB-enforced), so the map is a simple drawing_id → {code, version}.

/**
 * Build the per-drawing current-revision lookup from the authoritative source.
 * Only `is_current=true` rows contribute; the last one wins if (against the DB
 * invariant) more than one is flagged current for a drawing.
 */
export function buildCurrentRevisionMap(
  drawingRevisions: DrawingRevision[] | null | undefined,
): Map<string, CurrentRevisionInfo> {
  const map = new Map<string, CurrentRevisionInfo>();
  for (const rev of drawingRevisions || []) {
    if (!rev || rev.is_current !== true) continue;
    const drawingId = rev.drawing_id;
    if (!drawingId) continue;
    map.set(String(drawingId), {
      code: (rev.revision_code ?? "").toString().trim(),
      version: Number(rev.version_number) || 0,
    });
  }
  return map;
}

/**
 * Package-level displayed revision = the current revision of the set's
 * HIGHEST-version sheet (a per-set rollup), shown as that sheet's revision_code.
 *
 * Rules / edge cases:
 *  - A sheet with NO current `drawing_revisions` row contributes nothing.
 *  - If NO sheet in the set has a current revision, fall back to the legacy
 *    `drawings.revision_number` (the max numeric value) as last-resort metadata,
 *    then "—" when even that is empty.
 *  - revision_code is heterogeneous and NOT proportional to version_number
 *    (v2 can be code "0"/"1"/"2"/"A"), so we pick the MAX version_number and
 *    display ITS code — never the lexical/numeric max of the codes.
 */
export function currentRevisionForPackage(
  sheets: Drawing[] | null | undefined,
  currentRevByDrawingId: Map<string, CurrentRevisionInfo>,
): string {
  let best: CurrentRevisionInfo | null = null;
  for (const sheet of sheets || []) {
    const drawingId = sheet?.id;
    if (!drawingId) continue;
    const cur = currentRevByDrawingId.get(String(drawingId));
    if (!cur) continue;
    if (!best || cur.version > best.version) best = cur;
  }
  if (best) return best.code || "—";

  // Last-resort fallback: legacy free-text revision_number (max numeric).
  const legacyMax = (sheets || []).reduce(
    (m, d) => Math.max(m, Number(String(d?.revision_number || "0").replace(/[^\d]/g, "")) || 0),
    0,
  );
  return legacyMax ? String(legacyMax) : "—";
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

// ── Hub container derivations (extracted from DrawingSubmittalHub.tsx) ────────
// Pure over their inputs; the container's useMemo wrappers keep their exact
// dependency arrays and just call these. `drawings`/`submittals` are the raw
// hook-row arrays (annotated any[] to match the container boundary, same as the
// prior inline `as any[]`); setPackages is the reconciled SetPackage[].

/** Sequence-aware readiness rollup: map the per-package readiness records to
 *  sequence entries, then hand off to computeSequenceReadiness. */
export function buildSequenceReadiness(readinessByKey: Map<string, any>) {
  const entries = Array.from(readinessByKey.values()).map((r: any) => ({
    sequenceNumber: r.sequenceNumber,
    effectiveState: r.effectiveState,
    fabricationReady: r.fabricationReady,
    erectionReady: r.erectionReady,
    atRisk: r.scheduleRisk?.atRisk,
  }));
  return computeSequenceReadiness(entries);
}

/** Top-line drawing KPIs: total sets/sheets, released, in-review, overdue. */
export function buildDrawingKpis(drawings: any[], setPackages: SetPackage[]) {
  const active = drawings.filter((d) => !d.is_superseded && !d.is_deleted);
  const released = setPackages.filter(isClosedPackage).length;
  // "In review" = active workflow stages: IFA / OFA / BFA / R&R / OFS / IFC.
  // R&R counts as in-review — the package is mid-cycle (detailer rework), the
  // same bucket it occupied when R&R still derived to IFA.
  const inReview = setPackages.filter((pkg) =>
    ["IFA", "OFA", "BFA", "R&R", "OFS", "IFC"].includes(effectiveDetailingState(pkg.parent, pkg.submittals, pkg.sheets))
  ).length;
  const overdueDrawings = setPackages.filter((pkg) =>
    pkg.sheets.some((d) => dueInfo(getDrawingDueDate(d), isClosedDrawing(d)).overdue)
  ).length;
  return {
    totalSets: setPackages.length,
    totalSheets: active.length,
    released,
    inReview,
    overdue: overdueDrawings,
  };
}

/** The Control-Board triage model: per-package + unlinked-submittal items,
 *  bucketed (overdue / dueSoon / needsAction / noDate), pipeline counts, and the
 *  overdue/at-risk tallies. Pure over submittals, setPackages, readinessByKey.
 *
 *  `useWorkdays` (resolved from the `submittal_workday_dues` flag by the React
 *  caller — pure fns never read the flag) makes the countdown WORKING-day-aware
 *  for SUBMITTAL-governed dues only. Drawing-set dues (the earliestDate() sheet
 *  fallback when no submittal governs) stay calendar-day regardless. Defaults
 *  false so the canonical read model retains the existing calendar-day behavior. */
export function buildTriage(
  submittals: any[],
  setPackages: SetPackage[],
  readinessByKey: Map<string, any>,
  useWorkdays = false,
) {
    const activeSubmittals = submittals.filter((s) => !s.is_deleted) as any[];

    const setItems = setPackages.map((pkg) => {
      const governingSubmittal = pickMostRecentSubmittal(
        pkg.submittals.filter((submittal) =>
          !submittal.is_deleted && submittalStatusToStage(submittal.status, submittal.ball_in_court, submittal.approved_date) !== null,
        ),
      );
      // Coalesced operational state (drafting → submittal → release). Kept
      // alongside `status` (additive) so the existing pipeline/row display is
      // unchanged; surfaced as its own chip + drives the drafting control.
      const detailingState = effectiveDetailingState(pkg.parent, pkg.submittals, pkg.sheets);
      // R&R is a first-class derived stage (2026-07-25); the flag is kept for
      // surfaces that badge R&R alongside a non-stage display (e.g. status rows).
      const isRR = isPackageRR(pkg.submittals);
      // CLOSED is satisfied by ANY terminal signal — not only a closed
      // submittal status. Previous logic prioritised `latestSubmittal` and
      // ignored the set-level lock + the coalesced detailing state, so a
      // package that was manually released (e.g. anchor bolts: set locked
      // and/or detailing_state=Released for Erection) whose submittal was
      // never rolled to "Released for Fabrication" lingered on the hit list.
      const closed = isClosedPackage(pkg);
      // Prefer the governing submittal's due; only when there is none does the
      // display fall back to the earliest sheet due. Track WHICH source won so
      // the countdown is working-day-aware for submittal-governed dues but stays
      // calendar-day for drawing-set (sheet) dues.
      const submittalDue = getSubmittalDueDate(governingSubmittal);
      const dueDate = submittalDue || earliestDate(pkg.sheets.map(getDrawingDueDate));
      const dueBySubmittal = !!submittalDue;
      // Only surface "needs action" when the package is OPEN (closed items
      // never reach the hit list anyway, but guard against stale per-sheet
      // Rejected/Returned stages on packages that have since been released).
      const needsAction = !closed && (
        (governingSubmittal && ACTION_STATUSES.has(governingSubmittal.status ?? "")) ||
        pkg.sheets.some((drawing) => ["Rejected", "Revise and Resubmit", "Returned"].includes(drawing.stage ?? ""))
      );
      const status = governingSubmittal?.status || rollupDrawingStage(pkg.sheets);
      const canDraft = !hasGoverningSubmittal(pkg.submittals);
      const firstSheet = pkg.sheets[0] || null;
      const owner =
        governingSubmittal?.ball_in_court ||
        governingSubmittal?.assigned_to ||
        governingSubmittal?.reviewer ||
        firstSheet?.ball_in_court ||
        firstSheet?.assigned_to ||
        firstSheet?.reviewer ||
        "Unassigned";
      const submittalLabel = governingSubmittal?.submittal_number ? `Submittal ${governingSubmittal.submittal_number}` : "No linked submittal";
      return {
        id: `set-${pkg.key}`,
        kind: "Drawing Set",
        title: pkg.name,
        group: `${pkg.sheets.length} sheet${pkg.sheets.length === 1 ? "" : "s"} - ${submittalLabel}`,
        status,
        owner,
        dueDate,
        // Working-day only when the flag is on AND a submittal governs the due;
        // a drawing-set (sheet) due always stays calendar-day.
        due: dueInfoFor(dueDate, { closed, useWorkdays: useWorkdays && dueBySubmittal }),
        closed,
        needsAction,
        routeTab: "drawings",
        detailingState,
        isRR,
        _canDraft: canDraft,
        _detailingStateRaw: pkg.parent?.detailing_state ?? null,
        _readiness: readinessByKey.get(pkg.key) || null,
        // Entity references for inline editing
        _submittalId: governingSubmittal?.id || null,
        _drawingSetId: pkg.setId || null,
        _ownerScope: governingSubmittal ? "Submittal BIC" : firstSheet ? "First sheet owner" : "No owner target",
        _firstSheetId: pkg.sheets[0]?.id || null,
        // All sheet ids in the package — the due-date mutation writes every one
        // of these so earliestDate() always reflects the board-level edit.
        _sheetIds: (pkg.sheets || []).map((s) => s.id).filter(Boolean) as string[],
      };
    });

    const linkedSubmittalIds = new Set(
      setPackages.flatMap((pkg) => pkg.submittals.map((submittal) => submittal.id).filter(Boolean))
    );
    const unlinkedSubmittalItems = activeSubmittals
      .filter((submittal) => !linkedSubmittalIds.has(submittal.id))
      .map((submittal) => {
      const closed = isClosedSubmittal(submittal);
      const dueDate = getSubmittalDueDate(submittal);
      const title = [submittal.submittal_number, submittal.title || submittal.description]
        .filter(Boolean)
        .join(" - ") || "Untitled submittal";
      const needsAction = ACTION_STATUSES.has(submittal.status);
      return {
        id: `submittal-${submittal.id}`,
        kind: "Unlinked Submittal",
        title,
        group: "No drawing set name linked",
        status: submittal.status || "Draft",
        owner: submittal.ball_in_court || submittal.assigned_to || submittal.reviewer || "Unassigned",
        dueDate,
        // Always a submittal due date → working-day-aware when the flag is on.
        due: dueInfoFor(dueDate, { closed, useWorkdays }),
        closed,
        needsAction,
        routeTab: "submittals",
        // Entity references for inline editing
        _submittalId: submittal.id,
        _drawingSetId: null as string | null,
        _firstSheetId: null as string | null,
        _ownerScope: "Submittal BIC",
        // Unlinked submittals always dispatch through the submittal branch, so [].
        _sheetIds: [] as string[],
      };
    });

    const openItems = [...setItems, ...unlinkedSubmittalItems].filter((item) => !item.closed);
    const overdue = openItems.filter((item) => item.due.overdue).sort(itemUrgency);
    const dueSoon = openItems
      .filter((item) => item.due.dueSoon)
      .sort(itemUrgency);
    const needsAction = openItems
      .filter((item) => item.needsAction)
      .sort(itemUrgency);
    const noDate = openItems
      .filter((item) => !item.dueDate)
      .sort(itemUrgency);

    const pipelineCounts = openItems.reduce((acc: Record<string, number>, item) => {
      const key = item.status || "No status";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    return {
      setItems,
      unlinkedSubmittalItems,
      openItems: openItems.sort(itemUrgency),
      overdue,
      dueSoon,
      needsAction,
      noDate,
      pipelineCounts,
      overdueDrawingSets: overdue.filter((item) => item.kind === "Drawing Set").length,
      overdueUnlinkedSubmittals: overdue.filter((item) => item.kind === "Unlinked Submittal").length,
      dueSoonDrawingSets: dueSoon.filter((item) => item.kind === "Drawing Set").length,
      noDateDrawingSets: noDate.filter((item) => item.kind === "Drawing Set").length,
      atRiskCount: setItems.filter((item) => item._readiness?.scheduleRisk?.atRisk).length,
    };
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

// ── Approval Matrix ───────────────────────────────────────────────────────

/**
 * Build the Approval Matrix rows: each ACTIVE drawing set joined to the
 * submittals that reference it (via drawing_set_ids), with the latest round and
 * its due info, optionally filtered by `search`, sorted into package order.
 * Pure given the search string (extracted from ApprovalMatrix so it's testable).
 *
 * `useWorkdays` (resolved from `submittal_workday_dues` by the caller) makes each
 * row's Due-Status chip working-day-aware. Every matrix due is a SUBMITTAL date
 * (getSubmittalDueDate over the linked submittals), so — unlike buildTriage —
 * there is no drawing-date fallback to exclude here. Defaults false so the
 * canonical read model retains calendar-day behavior.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildApprovalMatrixRows(drawingSets: any[], submittals: any[], search = "", useWorkdays = false): any[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeSubmittals = (submittals || []).filter((s: any) => !s.is_deleted);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setSubmittalMap: Record<string, any[]> = {};
  for (const sub of activeSubmittals) {
    const setIds = Array.isArray(sub.drawing_set_ids) ? sub.drawing_set_ids : [];
    for (const sid of setIds) {
      if (!setSubmittalMap[sid]) setSubmittalMap[sid] = [];
      setSubmittalMap[sid].push(sub);
    }
  }
  return (drawingSets || [])
    .filter((s: any) => !s.is_deleted)
    .map((set: any) => {
      const linked = setSubmittalMap[set.id] || [];
      const latestSubmittal = linked.slice().sort(
        (a: any, b: any) => (b.round_number || 1) - (a.round_number || 1),
      )[0] || null;
      const due = dueInfoFor(getSubmittalDueDate(latestSubmittal), {
        closed: latestSubmittal ? isClosedSubmittal(latestSubmittal) : false,
        useWorkdays,
      });
      return { ...set, submittals: linked, latestSubmittal, due };
    })
    .filter((set: any) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        formatDrawingSetNumber(set).toLowerCase().includes(q) ||
        (set.set_name || "").toLowerCase().includes(q) ||
        (set.discipline || "").toLowerCase().includes(q) ||
        set.submittals.some((s: any) => (s.submittal_number || "").toLowerCase().includes(q))
      );
    })
    .sort((a: any, b: any) => compareDrawingSetPackages(a, b));
}

export interface ApprovalMatrixSummary {
  noSubmittal: number; pending: number; approved: number; rejected: number;
  overdue: number; dueSoon: number; total: number;
}

/**
 * Summary counts for the Approval Matrix. Status buckets: approved (Approved /
 * Approved as Noted / Released for Fabrication), rejected (Rejected / Revise and
 * Resubmit), else pending; plus no-submittal and overdue/due-soon tallies.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function summarizeApprovalMatrix(matrixRows: any[]): ApprovalMatrixSummary {
  let noSubmittal = 0, pending = 0, approved = 0, rejected = 0, overdue = 0, dueSoon = 0;
  for (const row of matrixRows || []) {
    if (!row.latestSubmittal) { noSubmittal++; continue; }
    const st = row.latestSubmittal.status;
    if (st === "Approved" || st === "Approved as Noted" || st === "Released for Fabrication") approved++;
    else if (st === "Rejected" || st === "Revise and Resubmit") rejected++;
    else pending++;
    if (row.due.overdue) overdue++;
    if (row.due.dueSoon) dueSoon++;
  }
  return { noSubmittal, pending, approved, rejected, overdue, dueSoon, total: (matrixRows || []).length };
}
