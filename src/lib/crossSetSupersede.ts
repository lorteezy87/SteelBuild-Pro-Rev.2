/**
 * crossSetSupersede.ts — "this upload replaces pages in another set".
 *
 * The detailing team revises by issuing a NEW drawing set (new name, new
 * submittal) that carries only the revised pages. Until now the upload wizard
 * superseded sheets only inside the set being uploaded into, so the old copy of
 * each revised page stayed live — and, if its set was Released, passed the fab
 * preflight (which blocks only is_superseded sheets).
 *
 * This module is the pure half of the fix:
 *   - planCrossSetSupersede — which LIVE sheets in OTHER sets of the project the
 *     upload replaces, one row per old drawing, each with a default tick and the
 *     reason for it. Matching is number-only (normalizeSheetKey); the protection
 *     against sets that restart their numbering lives in the defaults, never in
 *     hidden writes. Nothing is superseded unless the user leaves its row ticked.
 *   - applyCrossSetSupersede — the commit: re-reads fresh data, re-checks every
 *     confirmed page against the rows that actually saved, and writes
 *     is_superseded + metadata.superseded_by in one UPDATE per page.
 */
import { normalizeSheetKey, normalizeSheetTitle } from "@/lib/sheetKey";

export { normalizeSheetKey, normalizeSheetTitle };

// ─── Types ─────────────────────────────────────────────────────────────

export interface CrossSetSourceDrawing {
  id: string;
  sheet_number?: string | null;
  title?: string | null;
  revision_number?: string | null;
  stage?: string | null;
  drawing_set_id?: string | null;
  drawing_set_name?: string | null;
  is_superseded?: boolean | null;
  is_deleted?: boolean | null;
  metadata?: unknown;
}

export interface CrossSetSourceSet {
  id: string;
  set_name?: string | null;
  is_locked?: boolean | null;
  is_deleted?: boolean | null;
}

/** The project's non-deleted drawings and drawing sets (crossSetSupersedeRepository). */
export interface CrossSetSource {
  drawings: readonly CrossSetSourceDrawing[];
  sets: readonly CrossSetSourceSet[];
}

/** A Review-step sheet row (useFileUploadAndExtract shape). */
export interface UploadSheetLike {
  sheetNumber?: string | null;
  sheetTitle?: string | null;
  revision?: string | number | null;
  selected?: boolean | null;
}

export interface UploadMetaLike {
  setName?: string | null;
  revision?: string | null;
}

/** Why a row got its default tick — the first rule that applies, in this order. */
export type SupersedeDefaultReason =
  | "locked"
  | "set_name_case"
  | "title_missing"
  | "title_differs"
  | "short_number"
  | "older_revision"
  | "replaces";

export type RevisionComparison = "newer" | "older" | "same" | "not_comparable" | "unknown";
export type TitleRelation = "same" | "missing" | "differs";

export interface CrossSetRow {
  /** The OLD drawing's id — the page that would be marked superseded. */
  oldId: string;
  oldSetId: string;
  oldSetName: string;
  oldSheetNumber: string;
  oldTitle: string;
  oldRevision: string;
  oldStage: string;
  newSheetNumber: string;
  newTitle: string;
  newRevision: string;
  key: string;
  titleRelation: TitleRelation;
  revisionComparison: RevisionComparison;
  reason: SupersedeDefaultReason;
  defaultChecked: boolean;
  /** Locked set: the lock trigger and RLS would refuse the write, so it can't be ticked. */
  disabled: boolean;
  note: string | null;
}

export interface CrossSetGroup {
  setId: string;
  setName: string;
  locked: boolean;
  /** Rows whose titles match (or are missing) — the replacements the owner described. */
  rows: CrossSetRow[];
}

export interface CrossSetPlan {
  /** Every row, in display order. */
  rows: CrossSetRow[];
  /** Rows whose titles don't differ, one group per old set. */
  groups: CrossSetGroup[];
  /** Same number, different drawing — shown collapsed, unticked. */
  differentRows: CrossSetRow[];
  /** The typed set name matches an existing set except for letter case. */
  setNameCaseConflict: { typed: string; existing: string } | null;
  /** The set the upload goes into, when it already exists. */
  targetSetId: string | null;
}

export const EMPTY_CROSS_SET_PLAN: CrossSetPlan = Object.freeze({
  rows: [],
  groups: [],
  differentRows: [],
  setNameCaseConflict: null,
  targetSetId: null,
}) as CrossSetPlan;

// ─── Small pure helpers ───────────────────────────────────────────────

/**
 * The set name an upload lands in. Shared by the Review-step preview and the
 * commit (useDrawingSetCreation) so both look up the same exact-case name.
 */
export function resolveUploadSetName(meta: UploadMetaLike | null | undefined): string {
  return (meta?.setName || "").trim() || meta?.revision || "Drawing Set";
}

const SHORT_SHEET_KEY = /^([A-Z]{1,2})?\d{1,2}$/;

/** C1, D3, S1 — vendor packages (joists, deck) restart these. S201, E101, 101E111 are not short. */
export function isShortSheetKey(value: unknown): boolean {
  return SHORT_SHEET_KEY.test(normalizeSheetKey(value));
}

/** Strip a leading "REV", trim, uppercase. */
export function normalizeRevisionToken(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/^REV(?:ISION)?\.?\s*/i, "")
    .trim()
    .toUpperCase();
}

// '0' is what the extractor and the filename fallback write when no revision
// was found (useFileUploadAndExtract.js, drawingSetUploadHelpers.js,
// normalizeRevisionNumber), so it carries no information.
const UNKNOWN_REVISIONS = new Set(["", "0", "-"]);

/**
 * Compare the uploaded revision with the live one. Comparable only when both
 * are all digits or both a single letter (A → 1 crosses IFC: not comparable).
 */
export function compareRevisions(newRevision: unknown, oldRevision: unknown): RevisionComparison {
  const next = normalizeRevisionToken(newRevision);
  const prev = normalizeRevisionToken(oldRevision);
  if (UNKNOWN_REVISIONS.has(next) || UNKNOWN_REVISIONS.has(prev)) return "unknown";
  if (next === prev) return "same";
  if (/^\d+$/.test(next) && /^\d+$/.test(prev)) {
    const a = Number(next);
    const b = Number(prev);
    if (a === b) return "same";
    return a < b ? "older" : "newer";
  }
  if (/^[A-Z]$/.test(next) && /^[A-Z]$/.test(prev)) return next < prev ? "older" : "newer";
  return "not_comparable";
}

export function joinSheetNumbers(numbers: readonly string[]): string {
  const list = numbers.filter(Boolean);
  if (list.length <= 1) return list[0] ?? "";
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

/** "S-201, S-204 and S-209 replace pages in Main Steel – L2. Mark the old ones superseded?" */
export function buildReplaceSentence(
  sheetNumbers: readonly string[],
  setName: string,
  { ask = false }: { ask?: boolean } = {},
): string {
  const list = sheetNumbers.filter(Boolean);
  const one = list.length === 1;
  const base = `${joinSheetNumbers(list)} ${one ? "replaces a page" : "replace pages"} in ${setName}.`;
  return ask ? `${base} Mark the old ${one ? "one" : "ones"} superseded?` : base;
}

// ─── Planning ─────────────────────────────────────────────────────────

const naturalCompare = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

function noteFor(reason: SupersedeDefaultReason, comparison: RevisionComparison, newRev: string, oldRev: string): string | null {
  switch (reason) {
    case "locked":
      return "Set is locked";
    case "set_name_case":
      return "This set's name matches the one you typed except for letter case — check the set name";
    case "title_missing":
      return "Title missing — compare the drawings before ticking";
    case "title_differs":
      return "Different title — likely a different drawing";
    case "short_number":
      return "Short sheet number — vendor packages often restart numbering";
    case "older_revision":
      return `Uploaded rev ${newRev} is older than the live rev ${oldRev}`;
    case "replaces":
      if (comparison === "same") return "Same revision — check this isn't a re-upload";
      if (comparison === "not_comparable" || comparison === "unknown") return `Rev ${oldRev || "—"} → ${newRev || "—"}`;
      return null;
  }
}

function buildRow(
  drawing: CrossSetSourceDrawing,
  set: CrossSetSourceSet,
  incoming: UploadSheetLike,
  key: string,
  setNameCase: boolean,
): CrossSetRow {
  const oldTitle = String(drawing.title ?? "").trim();
  const newTitle = String(incoming.sheetTitle ?? "").trim();
  const oldT = normalizeSheetTitle(oldTitle);
  const newT = normalizeSheetTitle(newTitle);
  const titleRelation: TitleRelation = !oldT || !newT ? "missing" : oldT === newT ? "same" : "differs";
  const oldRevision = String(drawing.revision_number ?? "").trim();
  const newRevision = String(incoming.revision ?? "").trim();
  const revisionComparison = compareRevisions(newRevision, oldRevision);
  const locked = !!set.is_locked;
  const reason: SupersedeDefaultReason = locked
    ? "locked"
    : setNameCase
      ? "set_name_case"
      : titleRelation === "missing"
        ? "title_missing"
        : titleRelation === "differs"
          ? "title_differs"
          : isShortSheetKey(key)
            ? "short_number"
            : revisionComparison === "older"
              ? "older_revision"
              : "replaces";
  return {
    oldId: drawing.id,
    oldSetId: set.id,
    oldSetName: set.set_name || drawing.drawing_set_name || "Unnamed set",
    oldSheetNumber: String(drawing.sheet_number ?? "").trim(),
    oldTitle,
    oldRevision,
    oldStage: String(drawing.stage ?? "").trim(),
    newSheetNumber: String(incoming.sheetNumber ?? "").trim(),
    newTitle,
    newRevision,
    key,
    titleRelation,
    revisionComparison,
    reason,
    defaultChecked: reason === "replaces",
    disabled: locked,
    note: noteFor(reason, revisionComparison, normalizeRevisionToken(newRevision), normalizeRevisionToken(oldRevision)),
  };
}

export interface PlanCrossSetSupersedeArgs {
  source: CrossSetSource;
  newSheets: readonly UploadSheetLike[];
  meta?: UploadMetaLike | null;
  /** The resolved parent set at commit. In the preview it is looked up by exact name. */
  targetSetId?: string | null;
  /** Defaults to resolveUploadSetName(meta). */
  targetSetName?: string | null;
}

/**
 * Which live sheets in OTHER sets the upload replaces. A sheet matches when it
 * is live (not deleted, not superseded) in a live set of the project other than
 * the upload's target, and its normalizeSheetKey equals a ticked new sheet's.
 */
export function planCrossSetSupersede({
  source,
  newSheets,
  meta,
  targetSetId,
  targetSetName,
}: PlanCrossSetSupersedeArgs): CrossSetPlan {
  const typedName = targetSetName ?? resolveUploadSetName(meta);

  const liveSets = new Map<string, CrossSetSourceSet>();
  for (const set of source.sets) {
    if (set?.id && set.is_deleted !== true) liveSets.set(set.id, set);
  }

  // Preview: the same exact-case lookup handleCreate does (uq_drawing_sets_project_set_name).
  let target: string | null = targetSetId ?? null;
  if (!target) {
    for (const set of liveSets.values()) {
      if ((set.set_name ?? "") === typedName) {
        target = set.id;
        break;
      }
    }
  }

  // SetInfoStep warns about duplicates ignoring case, but the lookup is exact —
  // "main steel – l2" creates a NEW set beside "Main Steel – L2". Without this
  // guard a case typo would supersede pages in the very set the user meant.
  const typedLower = typedName.toLowerCase();
  const caseVariantSetIds = new Set<string>();
  let setNameCaseConflict: CrossSetPlan["setNameCaseConflict"] = null;
  for (const set of liveSets.values()) {
    const name = set.set_name ?? "";
    if (set.id === target || name === typedName || name.toLowerCase() !== typedLower) continue;
    caseVariantSetIds.add(set.id);
    if (!target && !setNameCaseConflict) setNameCaseConflict = { typed: typedName, existing: name };
  }

  const newByKey = new Map<string, UploadSheetLike>();
  for (const sheet of newSheets) {
    if (!sheet?.selected) continue;
    const key = normalizeSheetKey(sheet.sheetNumber);
    if (!key || newByKey.has(key)) continue;
    newByKey.set(key, sheet);
  }

  const rows: CrossSetRow[] = [];
  if (newByKey.size > 0) {
    for (const drawing of source.drawings) {
      if (!drawing?.id || drawing.is_deleted === true || drawing.is_superseded) continue;
      const setId = drawing.drawing_set_id;
      if (!setId || setId === target) continue;
      const set = liveSets.get(setId);
      if (!set) continue;
      const key = normalizeSheetKey(drawing.sheet_number);
      if (!key) continue;
      const incoming = newByKey.get(key);
      if (!incoming) continue;
      rows.push(buildRow(drawing, set, incoming, key, caseVariantSetIds.has(setId)));
    }
  }
  rows.sort((a, b) => naturalCompare(a.oldSetName, b.oldSetName) || naturalCompare(a.oldSheetNumber, b.oldSheetNumber));

  const groupsById = new Map<string, CrossSetGroup>();
  const differentRows: CrossSetRow[] = [];
  for (const row of rows) {
    if (row.titleRelation === "differs") {
      differentRows.push(row);
      continue;
    }
    let group = groupsById.get(row.oldSetId);
    if (!group) {
      group = { setId: row.oldSetId, setName: row.oldSetName, locked: row.disabled, rows: [] };
      groupsById.set(row.oldSetId, group);
    }
    group.rows.push(row);
  }

  return {
    rows: [...rows.filter((row) => row.titleRelation !== "differs"), ...differentRows],
    groups: [...groupsById.values()],
    differentRows,
    setNameCaseConflict,
    targetSetId: target,
  };
}

// ─── Commit ───────────────────────────────────────────────────────────

export type SupersedeSkipReason = "no_longer_live" | "now_in_this_set" | "replacement_not_saved";

export interface SupersedeItem {
  id: string;
  sheetNumber: string;
  setId: string | null;
  setName: string;
  /** Short reason for a failed or skipped page. */
  message?: string;
  skipReason?: SupersedeSkipReason;
  /** failed only: the fresh re-read failed (nothing was written) or the UPDATE was refused. */
  failure?: "fetch" | "write";
  /** superseded only: the saved new drawing that replaced it. */
  replacedById?: string | null;
}

export interface CrossSetSupersedeResult {
  superseded: SupersedeItem[];
  failed: SupersedeItem[];
  skipped: SupersedeItem[];
}

export interface SupersededBy {
  drawing_id: string | null;
  drawing_set_id: string;
  drawing_set_name: string;
  sheet_number: string | null;
  upload_batch_id: string | null;
  at: string;
}

export interface SupersedePatch {
  is_superseded: true;
  metadata: Record<string, unknown>;
}

export interface SavedRowLike {
  id?: string | null;
  sheet_number?: string | null;
}

export type SupersedeLabels = Readonly<Record<string, { sheetNumber?: string | null; setName?: string | null }>>;

export const SUPERSEDE_FETCH_FAILED = "Couldn't reload the old pages — nothing was superseded";
export const SKIP_MESSAGES: Record<SupersedeSkipReason, string> = {
  no_longer_live: "already superseded or deleted",
  now_in_this_set: "now part of this set",
  replacement_not_saved: "its replacement didn't save — left live",
};

/** Keep every existing metadata key (drawing_log, …); a legacy non-object value is kept under previous_metadata. */
export function mergeSupersededBy(existing: unknown, supersededBy: SupersededBy): Record<string, unknown> {
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    return { ...(existing as Record<string, unknown>), superseded_by: supersededBy };
  }
  if (existing === null || existing === undefined) return { superseded_by: supersededBy };
  return { previous_metadata: existing, superseded_by: supersededBy };
}

/** Turn an RLS / lock-trigger / PostgREST refusal into something a detailer can act on. */
export function describeSupersedeWriteError(err: unknown): string {
  let raw = "";
  if (err instanceof Error) raw = err.message;
  else if (typeof err === "string") raw = err;
  else if (err && typeof err === "object" && "message" in err && typeof (err as { message?: unknown }).message === "string") {
    raw = (err as { message: string }).message;
  }
  const message = raw.replace(/^\[[^\]]+\]\s*/, "").trim();
  if (/DRAWING_SET_LOCKED|\block(ed)?\b/i.test(message)) return "Set is locked";
  // Production drawings RLS refuses non-admin UPDATEs on locked sets with the same error as a missing role.
  if (/row-level security|permission denied|42501/i.test(message)) return "You don't have permission to change it, or its set is locked";
  if (/PGRST116|coerce the result to a single JSON object|multiple \(or no\) rows/i.test(message)) {
    return "The update was refused — you may not have access to it, or its set is locked";
  }
  return message || "The update was refused";
}

export interface ApplyCrossSetSupersedeArgs {
  /** Old drawing ids the user left ticked. */
  confirmedIds: readonly string[];
  /** Preview labels, used only to name pages when the fresh re-read fails. */
  labels?: SupersedeLabels | null;
  /** Rows that actually saved: same-set in-place updates plus inserts. */
  savedRows: readonly SavedRowLike[];
  parentSetId: string;
  resolvedSetName: string;
  batchId: string | null;
  now: string;
  fetchSource: () => Promise<CrossSetSource>;
  update: (id: string, patch: SupersedePatch) => Promise<unknown>;
}

/**
 * Supersede the confirmed old pages. Never trusts the preview: re-reads fresh
 * data and skips any page that is no longer live, now belongs to the upload's
 * own set, or whose replacement didn't save. One UPDATE per page, one at a time,
 * each in its own try/catch — a page is either fully superseded with its
 * provenance or untouched. Never throws.
 */
export async function applyCrossSetSupersede(args: ApplyCrossSetSupersedeArgs): Promise<CrossSetSupersedeResult> {
  const result: CrossSetSupersedeResult = { superseded: [], failed: [], skipped: [] };
  const ids = [...new Set((args.confirmedIds || []).filter((id): id is string => typeof id === "string" && id.length > 0))];
  if (ids.length === 0) return result;

  const labelFor = (id: string) => ({
    sheetNumber: String(args.labels?.[id]?.sheetNumber || "A page"),
    setName: String(args.labels?.[id]?.setName || "another set"),
  });

  let source: CrossSetSource;
  try {
    source = await args.fetchSource();
    if (!source || !Array.isArray(source.drawings) || !Array.isArray(source.sets)) {
      throw new Error("Old pages were not returned.");
    }
  } catch {
    for (const id of ids) {
      result.failed.push({ id, ...labelFor(id), setId: null, message: SUPERSEDE_FETCH_FAILED, failure: "fetch" });
    }
    return result;
  }

  const liveSets = new Map<string, CrossSetSourceSet>();
  for (const set of source.sets) if (set?.id && set.is_deleted !== true) liveSets.set(set.id, set);
  const drawings = new Map<string, CrossSetSourceDrawing>();
  for (const drawing of source.drawings) if (drawing?.id) drawings.set(drawing.id, drawing);
  const savedByKey = new Map<string, SavedRowLike>();
  for (const row of args.savedRows || []) {
    const key = normalizeSheetKey(row?.sheet_number);
    if (key && row?.id && !savedByKey.has(key)) savedByKey.set(key, row);
  }

  for (const id of ids) {
    const drawing = drawings.get(id);
    const label = labelFor(id);
    const setId = drawing?.drawing_set_id ?? null;
    const set = setId ? liveSets.get(setId) : undefined;
    const item: SupersedeItem = {
      id,
      sheetNumber: String(drawing?.sheet_number || label.sheetNumber),
      setId,
      setName: String(set?.set_name || drawing?.drawing_set_name || label.setName),
    };
    const skip = (skipReason: SupersedeSkipReason) =>
      result.skipped.push({ ...item, skipReason, message: SKIP_MESSAGES[skipReason] });

    if (!drawing || drawing.is_deleted === true || drawing.is_superseded || !set) {
      skip("no_longer_live");
      continue;
    }
    if (setId === args.parentSetId) {
      skip("now_in_this_set");
      continue;
    }
    const key = normalizeSheetKey(drawing.sheet_number);
    const replacement = key ? savedByKey.get(key) : undefined;
    if (!replacement) {
      skip("replacement_not_saved");
      continue;
    }

    const metadata = mergeSupersededBy(drawing.metadata, {
      drawing_id: replacement.id ?? null,
      drawing_set_id: args.parentSetId,
      drawing_set_name: args.resolvedSetName,
      sheet_number: replacement.sheet_number ?? null,
      upload_batch_id: args.batchId ?? null,
      at: args.now,
    });
    try {
      await args.update(id, { is_superseded: true, metadata });
      result.superseded.push({ ...item, replacedById: replacement.id ?? null });
    } catch (err) {
      result.failed.push({ ...item, message: describeSupersedeWriteError(err), failure: "write" });
    }
  }
  return result;
}

// ─── Reporting ────────────────────────────────────────────────────────

export interface SupersedeSetSummary {
  setId: string | null;
  setName: string;
  sheetNumbers: string[];
}

export function groupSupersedeItemsBySet(items: readonly SupersedeItem[]): SupersedeSetSummary[] {
  const bySet = new Map<string, SupersedeSetSummary>();
  for (const item of items) {
    const key = item.setId || `name:${item.setName}`;
    let group = bySet.get(key);
    if (!group) {
      group = { setId: item.setId, setName: item.setName, sheetNumbers: [] };
      bySet.set(key, group);
    }
    group.sheetNumbers.push(item.sheetNumber);
  }
  return [...bySet.values()];
}

const pages = (n: number) => `${n} page${n === 1 ? "" : "s"}`;

/** "Marked 3 pages superseded in Main Steel – L2: S-201, S-204, S-209" */
export function describeSupersededSet(summary: SupersedeSetSummary): string {
  return `Marked ${pages(summary.sheetNumbers.length)} superseded in ${summary.setName}: ${summary.sheetNumbers.join(", ")}`;
}

/** The readable activities row per old set. */
export function describeSupersedeActivity(summary: SupersedeSetSummary, replacedBySetName: string): string {
  return `Superseded ${pages(summary.sheetNumbers.length)} in "${summary.setName}" (${summary.sheetNumbers.join(", ")}) — replaced by "${replacedBySetName}"`;
}

/** One line per page that was NOT superseded. */
export function describeSupersedeProblem(item: SupersedeItem): string {
  const who = `${item.sheetNumber} (${item.setName})`;
  if (item.skipReason === "replacement_not_saved") return `${who} is still live — its replacement didn't save.`;
  if (item.skipReason === "no_longer_live") return `${who} was not changed — it was already superseded or deleted.`;
  if (item.skipReason === "now_in_this_set") return `${who} was not changed — it is now part of this set.`;
  if (item.failure === "fetch") return `${who} is still live — the old pages couldn't be reloaded, so nothing was superseded.`;
  return `${who} is still live — ${item.message || "the update was refused"}. Nothing was changed on it.`;
}

export function hasSupersedeProblems(result: CrossSetSupersedeResult | null | undefined): boolean {
  return !!result && (result.failed.length > 0 || result.skipped.length > 0);
}
