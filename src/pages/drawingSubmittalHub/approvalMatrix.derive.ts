/**
 * approvalMatrix.derive — the per-set columns the Approval Matrix borrowed from
 * SteelBuild-Pro-2026's matrix (live sheet count, sheets on hold, workflow
 * stage, last transmittal, last outgoing transmittal and what changed since),
 * the matrix's click-through quick filters, and its deep links into sibling
 * hub tabs.
 *
 * It deliberately does NOT re-pick the governing submittal. buildApprovalMatrixRows
 * (format.ts) resolves that with pickMostRecentSubmittal over stage-mappable
 * submittals, and the stage here comes from resolvePackageStage — the Process
 * Board's own rule — so the two tabs can never show one set in two stages.
 * (2026 governs by submittal-number order instead; that rule was not ported.)
 *
 * Pure: no React, no fetching.
 */
import { resolvePackageStage } from "@/components/submittals/processBoard.derive";
import { resolveTransmittalDisplay } from "@/components/drawings/register/docControl.derive";
import type { DrawingHoldRow } from "@/hooks/useDrawingHolds";
import type { TransmittalLog, TransmittalRow } from "@/hooks/useTransmittals";
import { hasUnansweredApproverNotes } from "@/lib/approverNotes";
import { submittalStatusToStage } from "@/lib/submittalStageMapping";
import { buildApprovalMatrixRows, matrixStatusBucket, summarizeApprovalMatrix } from "./format";
import { createSubmittalHref, hubHref, submittalRecordHref } from "./hubLinks";
import type { ApprovalMatrixRow, DrawingSet, SetPackage, Submittal } from "./types";

/** The subset of a buildApprovalMatrixRows row this module reads. */
export interface MatrixRowLike {
  id: string;
  submittals?: any[] | null;
  latestSubmittal?: any | null;
  due?: { overdue?: boolean; dueSoon?: boolean } | null;
  pendingEorResponse?: boolean;
}

/**
 * Where a row's stage came from. "sheets" is Rev.2's legacy fallback for a set
 * no submittal governs yet (derivedSetStage's dominant sheet stage) — shown
 * as such so it is never mistaken for a workflow stage.
 */
export type MatrixStageSource = "submittal" | "sheets" | "none";

export interface MatrixTransmittal {
  id: string;
  number: string;
  direction: TransmittalRow["direction"];
  party: string | null;
  date: string | null;
}

/**
 * The newest dated OUTGOING transmittal that carried a sheet of the set, and
 * what has become of the sheets it carried.
 */
export interface LastOutgoingTransmittal {
  id: string;
  number: string;
  /** The entered send date as a calendar day (YYYY-MM-DD). */
  dateSent: string;
  sentTo: string | null;
  /** Distinct sheets of this set on it, live or since superseded. */
  sheetCount: number;
  /**
   * Sheets whose current revision is known and is none of the revisions this
   * transmittal carried for them: revised since it went out.
   */
  revisedSinceSent: number;
  /**
   * Sheets superseded NOW (drawings.is_superseded). Present state only:
   * drawings record no supersession date, so this can include a sheet that was
   * already superseded when the transmittal went out. Never labelled "since".
   */
  supersededNow: number;
  /**
   * Sheets with nothing to compare, superseded or not: no current revision is
   * loaded, or the transmittal recorded no revision for the sheet (m4_1 items
   * can carry only drawing_id). Whether they were revised couldn't be checked,
   * so revisedSinceSent is a lower bound.
   */
  uncheckedSheets: number;
}

/** An outgoing transmittal with no send date: it carried the set, but when is unknown. */
export interface UndatedOutgoingTransmittal {
  id: string;
  number: string;
  /**
   * status 'draft'. An undated draft is either a Rev.2 log entry with the date
   * left blank or a 2026 draft not sent yet, and the row can't tell which, so
   * it is never shown as sent.
   */
  draft: boolean;
}

export interface LastOutgoingRollup {
  /** Sets carried by a dated outgoing transmittal: the newest one. */
  bySet: Map<string, LastOutgoingTransmittal>;
  /**
   * Sets carried by an outgoing transmittal with a blank date_sent: the newest
   * by created_at. Used only for a set no dated transmittal carried.
   */
  undatedBySet: Map<string, UndatedOutgoingTransmittal>;
  /**
   * Items on outgoing transmittals, dated or not, whose sheet is in no loaded
   * package: its revision wasn't in the read, the sheet was deleted, or a row
   * cap cut it off. Project-wide, because such an item could belong to any set.
   */
  unresolvedItems: number;
  /**
   * The log's transmittals or items read hit the row cap (useTransmittals'
   * TransmittalLog.possiblyTruncated), so rows may be missing without a trace.
   */
  possiblyTruncated: boolean;
}

/**
 * One set's Last sent value. "undated" and "unknown" are never shown as "not
 * sent". On "sent" and "undated", possiblyTruncated means the log was cut off:
 * a dated transmittal for the set, or more of this one's items, may be
 * missing, so every count is a lower bound.
 */
export type LastSent =
  | { kind: "sent"; transmittal: LastOutgoingTransmittal; possiblyTruncated: boolean }
  | { kind: "undated"; transmittal: UndatedOutgoingTransmittal; possiblyTruncated: boolean }
  | { kind: "unknown"; unresolvedItems: number; possiblyTruncated: boolean }
  | { kind: "none" };

export interface MatrixEnrichment {
  stage: string;
  stageSource: MatrixStageSource;
  /** Live (non-superseded) sheets in the set; null when the set has no package. */
  sheetCount: number | null;
  /** Live sheets in the set carrying an ACTIVE hold. */
  onHold: number;
  lastTransmittal: MatrixTransmittal | null;
  /** The newest outgoing transmittal and what changed since (expanded row). */
  lastSent: LastSent;
}

export type EnrichedMatrixRow<T extends MatrixRowLike = MatrixRowLike> = T & MatrixEnrichment;

type SheetLike = { id?: string | null };

interface TransmittalOrder {
  day: string;
  createdAt: string;
  number: string;
}

function sheetIds(sheets: readonly SheetLike[] | null | undefined): string[] {
  const ids: string[] = [];
  for (const sheet of sheets || []) {
    const id = sheet?.id ? String(sheet.id) : "";
    if (id) ids.push(id);
  }
  return ids;
}

function packagesBySetId(setPackages: readonly SetPackage[] | null | undefined): Map<string, SetPackage> {
  const map = new Map<string, SetPackage>();
  for (const pkg of setPackages || []) {
    if (pkg?.setId) map.set(String(pkg.setId), pkg);
  }
  return map;
}

/**
 * Transmittal order: the date the direction implies (received for incoming,
 * sent otherwise) by calendar day, then created_at, then transmittal number.
 * Day-first because date_sent / date_received are plain dates while
 * created_at is a timestamp — comparing the raw strings would rank
 * "2026-03-02T09:00Z" above "2026-03-02" for the same day.
 *
 * An undated row's day is blank, and a blank day sorts before every date: an
 * undated row never outranks a dated one, and undated rows order among
 * themselves by created_at, then number.
 */
function compareTransmittals(a: TransmittalOrder, b: TransmittalOrder): number {
  return (
    a.day.localeCompare(b.day) ||
    a.createdAt.localeCompare(b.createdAt) ||
    a.number.localeCompare(b.number, undefined, { numeric: true })
  );
}

/**
 * drawing_set_id → the newest transmittal that carried any of the set's sheets.
 *
 * Rev.2 transmittals carry no submittal_id, so the link is re-derived:
 * transmittal item → sheet → set. useTransmittals gives each item a
 * drawing_id: the item's own (m4_1 keys items by it), else its revision's.
 * Superseded sheets count — they were transmitted as part of the set. Both
 * directions count: a set coming back from the EOR moved just as much as one
 * going out, and the direction is shown beside the number. Void (m4_1's
 * retraction of a sent transmittal) and deleted rows don't count; every other
 * status, and a missing one, does.
 *
 * Dated rows rank by the day their direction implies, as entered. A row with
 * no such date can't be placed against them: a blank date is unknown, not
 * "newest". Under the shared DB's m4_1 rules every undated row is an unsent
 * draft, and 2026's create_transmittal fills one with every live sheet of a
 * round, so letting its created_at compete would show a draft in place of
 * the transmittal that went out. An undated row therefore shows only for a
 * set that no dated transmittal carried.
 */
export function buildLastTransmittalBySet(
  transmittals: readonly TransmittalRow[] | null | undefined,
  setPackages: readonly SetPackage[] | null | undefined,
): Map<string, MatrixTransmittal> {
  const setIdByDrawingId = new Map<string, string>();
  for (const pkg of setPackages || []) {
    if (!pkg?.setId) continue;
    for (const id of [...sheetIds(pkg.sheets), ...sheetIds(pkg.supersededSheets)]) {
      setIdByDrawingId.set(id, String(pkg.setId));
    }
  }

  const best = new Map<string, { value: MatrixTransmittal; day: string; createdAt: string; number: string }>();
  for (const transmittal of transmittals || []) {
    // Void (m4_1) is a retraction: it keeps its dates and is_deleted=false.
    if (!transmittal || transmittal.is_deleted || transmittal.status === "void") continue;
    const { party, date } = resolveTransmittalDisplay(transmittal);
    const entered = String(date ?? "").trim();
    const candidate = {
      value: {
        id: String(transmittal.id),
        number: String(transmittal.transmittal_number || ""),
        direction: transmittal.direction,
        party: party ?? null,
        date: entered ? date : null,
      },
      // An entered date is a calendar day (stored at midnight UTC — slice it,
      // don't shift it). A blank or missing one leaves the day blank, which
      // ranks the row below every dated one (see compareTransmittals). Its
      // created_at never stands in for a date: under m4_1 it is when an unsent
      // draft was logged, not when anything went out.
      day: entered.slice(0, 10),
      createdAt: String(transmittal.created_at || ""),
      number: String(transmittal.transmittal_number || ""),
    };
    const touched = new Set<string>();
    for (const item of transmittal.items || []) {
      const setId = item?.drawing_id ? setIdByDrawingId.get(String(item.drawing_id)) : undefined;
      if (setId) touched.add(setId);
    }
    for (const setId of touched) {
      const current = best.get(setId);
      if (!current || compareTransmittals(candidate, current) > 0) best.set(setId, candidate);
    }
  }

  const out = new Map<string, MatrixTransmittal>();
  for (const [setId, entry] of best) out.set(setId, entry.value);
  return out;
}

/**
 * useTransmittals marks a log whose transmittals or items read hit the row cap
 * (TransmittalLog.possiblyTruncated). A log built anywhere else reads as whole.
 */
function logPossiblyTruncated(transmittals: readonly TransmittalRow[] | null | undefined): boolean {
  return (transmittals as Pick<TransmittalLog, "possiblyTruncated"> | null | undefined)?.possiblyTruncated === true;
}

/**
 * drawing_set_id → the newest OUTGOING transmittal carrying any of the set's
 * sheets, and what has become of those sheets since.
 *
 * Kept apart from buildLastTransmittalBySet on purpose. That one is the Last
 * Transmittal column: the newest in EITHER direction, an undated one only when
 * the set has no dated one. This one answers "what did we last send, and is it
 * still what's current?".
 *
 * - Outgoing transmittals with a date_sent go in bySet. Newest wins by that
 *   day (the entered date as written, never shifted), then created_at, then
 *   transmittal number.
 * - Outgoing transmittals with a blank date_sent still carried their sets: a
 *   missing date is unknown, not "never sent". They go in undatedBySet (newest
 *   by created_at, then number) and never compete with a dated one, because
 *   they can't be ordered against it.
 * - item → drawing (useTransmittals takes the item's own drawing_id, else its
 *   revision's) → set, over every loaded sheet, live AND superseded. A sheet in
 *   no set (a legacy ungrouped package) is known, just set-less: skipped, not
 *   unresolved. Items on dated and undated transmittals alike count as
 *   unresolved when their sheet isn't loaded.
 * - For each sheet on the winning dated transmittal: revised since sent when
 *   its current revision is known and is none of the revisions carried for it;
 *   unchecked when no current revision is loaded; superseded now when
 *   drawings.is_superseded is set. That last is how the owner's
 *   revise-as-a-new-set workflow shows (the old sheet stays in the old set and
 *   is marked superseded), but drawings keep no supersession date, so it is a
 *   present-state count, never a "since".
 */
export function buildLastOutgoingBySet(
  transmittals: readonly TransmittalRow[] | null | undefined,
  setPackages: readonly SetPackage[] | null | undefined,
  currentRevisionIdByDrawingId: ReadonlyMap<string, string> | null | undefined,
): LastOutgoingRollup {
  const sheetIndex = new Map<string, { setId: string | null; superseded: boolean }>();
  for (const pkg of setPackages || []) {
    if (!pkg) continue;
    const setId = pkg.setId ? String(pkg.setId) : null;
    for (const id of sheetIds(pkg.sheets)) sheetIndex.set(id, { setId, superseded: false });
    for (const id of sheetIds(pkg.supersededSheets)) sheetIndex.set(id, { setId, superseded: true });
  }

  const best = new Map<string, { value: LastOutgoingTransmittal; order: TransmittalOrder }>();
  const undated = new Map<string, { value: UndatedOutgoingTransmittal; order: TransmittalOrder }>();
  let unresolvedItems = 0;
  for (const transmittal of transmittals || []) {
    if (!transmittal || transmittal.is_deleted || transmittal.direction !== "outgoing") continue;
    // Void is m4_1's only retraction of a sent transmittal, and it keeps
    // date_sent and is_deleted=false. sent, acknowledged, draft (Rev.2's own
    // inserts land as draft, dated or not) and a missing status all count.
    if (transmittal.status === "void") continue;
    const dateSent = String(transmittal.date_sent ?? "").trim();

    // set → sheet → the revision ids this transmittal carried for that sheet.
    const sentBySet = new Map<string, Map<string, Set<string>>>();
    for (const item of transmittal.items || []) {
      const drawingId = item?.drawing_id ? String(item.drawing_id) : "";
      const sheet = drawingId ? sheetIndex.get(drawingId) : undefined;
      if (!sheet) {
        unresolvedItems++;
        continue;
      }
      if (!sheet.setId) continue;
      let sheets = sentBySet.get(sheet.setId);
      if (!sheets) {
        sheets = new Map();
        sentBySet.set(sheet.setId, sheets);
      }
      let revisionIds = sheets.get(drawingId);
      if (!revisionIds) {
        revisionIds = new Set();
        sheets.set(drawingId, revisionIds);
      }
      if (item.drawing_revision_id) revisionIds.add(String(item.drawing_revision_id));
    }

    const order: TransmittalOrder = {
      day: dateSent.slice(0, 10),
      createdAt: String(transmittal.created_at || ""),
      number: String(transmittal.transmittal_number || ""),
    };

    if (!dateSent) {
      for (const setId of sentBySet.keys()) {
        const held = undated.get(setId);
        if (held && compareTransmittals(order, held.order) <= 0) continue;
        undated.set(setId, { order, value: { id: String(transmittal.id), number: order.number, draft: transmittal.status === "draft" } });
      }
      continue;
    }

    const sentTo = String(transmittal.sent_to ?? "").trim();
    for (const [setId, sheets] of sentBySet) {
      const held = best.get(setId);
      if (held && compareTransmittals(order, held.order) <= 0) continue;
      let revised = 0;
      let superseded = 0;
      let unchecked = 0;
      for (const [drawingId, sentRevisionIds] of sheets) {
        const currentId = currentRevisionIdByDrawingId?.get(drawingId);
        // No revision recorded for the sheet on this transmittal: nothing to
        // compare against, so unchecked, never revised.
        if (currentId === undefined || sentRevisionIds.size === 0) unchecked++;
        else if (!sentRevisionIds.has(currentId)) revised++;
        if (sheetIndex.get(drawingId)?.superseded === true) superseded++;
      }
      best.set(setId, {
        order,
        value: {
          id: String(transmittal.id),
          number: order.number,
          dateSent: order.day,
          sentTo: sentTo || null,
          sheetCount: sheets.size,
          revisedSinceSent: revised,
          supersededNow: superseded,
          uncheckedSheets: unchecked,
        },
      });
    }
  }

  const bySet = new Map<string, LastOutgoingTransmittal>();
  for (const [setId, entry] of best) bySet.set(setId, entry.value);
  const undatedBySet = new Map<string, UndatedOutgoingTransmittal>();
  for (const [setId, entry] of undated) undatedBySet.set(setId, entry.value);
  return { bySet, undatedBySet, unresolvedItems, possiblyTruncated: logPossiblyTruncated(transmittals) };
}

/**
 * One set's Last sent. Its own dated transmittal if one carried it, else its
 * own undated one ("sent, date not entered"). Otherwise Unknown while any item
 * couldn't be placed (it might be this set's) or the log read may have been
 * cut off. Only with every item placed and the whole log loaded is it
 * "not sent yet".
 */
export function lastSentForSet(rollup: LastOutgoingRollup, setId: string): LastSent {
  const key = String(setId);
  const { possiblyTruncated } = rollup;
  const transmittal = rollup.bySet.get(key);
  if (transmittal) return { kind: "sent", transmittal, possiblyTruncated };
  const undated = rollup.undatedBySet.get(key);
  if (undated) return { kind: "undated", transmittal: undated, possiblyTruncated };
  if (rollup.unresolvedItems > 0 || rollup.possiblyTruncated) {
    return { kind: "unknown", unresolvedItems: rollup.unresolvedItems, possiblyTruncated: rollup.possiblyTruncated };
  }
  return { kind: "none" };
}

/**
 * Add the 2026 columns to buildApprovalMatrixRows output. Row order and the
 * governing submittal are untouched.
 */
export function enrichApprovalMatrixRows<T extends MatrixRowLike>(
  rows: readonly T[],
  {
    setPackages = [],
    holds = [],
    transmittals = [],
    currentRevisionIdByDrawingId = null,
  }: {
    setPackages?: readonly SetPackage[] | null;
    holds?: readonly DrawingHoldRow[] | null;
    transmittals?: readonly TransmittalRow[] | null;
    /** drawing_id → current drawing_revisions.id (format.buildCurrentRevisionIdMap). */
    currentRevisionIdByDrawingId?: ReadonlyMap<string, string> | null;
  } = {},
): Array<EnrichedMatrixRow<T>> {
  const pkgBySetId = packagesBySetId(setPackages);
  // Same predicate as the Holds tab's Active table and the header badge.
  const heldDrawingIds = new Set<string>();
  for (const hold of holds || []) {
    if (hold?.is_active && hold.drawing_id) heldDrawingIds.add(String(hold.drawing_id));
  }
  const lastBySet = buildLastTransmittalBySet(transmittals, setPackages);
  const lastOutgoing = buildLastOutgoingBySet(transmittals, setPackages, currentRevisionIdByDrawingId);

  return (rows || []).map((row) => {
    const pkg = pkgBySetId.get(String(row.id));
    const sheets = pkg?.sheets ?? [];
    const linked = Array.isArray(row.submittals) ? row.submittals : [];
    const governing = row.latestSubmittal ?? null;
    const mapped = governing
      ? submittalStatusToStage(governing.status, governing.ball_in_court, governing.approved_date)
      : null;
    return {
      ...row,
      stage: resolvePackageStage(linked, sheets),
      stageSource: mapped ? "submittal" : sheets.length ? "sheets" : "none",
      sheetCount: pkg ? sheets.length : null,
      onHold: sheetIds(sheets).filter((id) => heldDrawingIds.has(id)).length,
      lastTransmittal: lastBySet.get(String(row.id)) ?? null,
      lastSent: lastSentForSet(lastOutgoing, String(row.id)),
    };
  });
}

export interface ApprovalMatrixModel {
  rows: Array<EnrichedMatrixRow<ApprovalMatrixRow>>;
  visibleRows: Array<EnrichedMatrixRow<ApprovalMatrixRow>>;
  summary: ReturnType<typeof summarizeApprovalMatrix>;
  coverage: ReturnType<typeof summarizeMatrixCoverage>;
}

/** Build the matrix's complete read model without coupling it to React state. */
export function buildApprovalMatrixModel({
  drawingSets,
  submittals,
  search,
  useWorkdays,
  filter,
  setPackages,
  holds,
  transmittals,
  currentRevisionIdByDrawingId,
}: {
  drawingSets: DrawingSet[];
  submittals: Submittal[];
  search: string;
  useWorkdays: boolean;
  filter: MatrixFilter | null;
  setPackages: readonly SetPackage[];
  holds: readonly DrawingHoldRow[];
  transmittals?: readonly TransmittalRow[];
  currentRevisionIdByDrawingId: ReadonlyMap<string, string> | null;
}): ApprovalMatrixModel {
  const baseRows = buildApprovalMatrixRows(drawingSets, submittals, search, useWorkdays);
  const rows = enrichApprovalMatrixRows(baseRows, {
    setPackages,
    holds,
    transmittals,
    currentRevisionIdByDrawingId,
  });
  return {
    rows,
    visibleRows: rows.filter((row) => matchesMatrixFilter(row, filter)),
    summary: summarizeApprovalMatrix(rows),
    coverage: summarizeMatrixCoverage(rows),
  };
}

// ── Quick filters (the summary pills, made click-through) ───────────────────

export const MATRIX_FILTERS = ["overdue", "pending", "action", "eor", "nosub", "hold", "approved"] as const;
export type MatrixFilter = (typeof MATRIX_FILTERS)[number];

/** URL value → filter; anything unknown (stale or hand-edited link) → none. */
export function parseMatrixFilter(value: string | null | undefined): MatrixFilter | null {
  return (MATRIX_FILTERS as readonly string[]).includes(String(value)) ? (value as MatrixFilter) : null;
}

/**
 * Row predicate behind each pill. Status buckets come from matrixStatusBucket —
 * the function summarizeApprovalMatrix counts with — so a pill's number is
 * always the number of rows its filter shows.
 */
export function matchesMatrixFilter(row: EnrichedMatrixRow, filter: MatrixFilter | null): boolean {
  if (!filter) return true;
  const latest = row.latestSubmittal ?? null;
  switch (filter) {
    case "overdue":
      // summarizeApprovalMatrix only tallies due flags on rows with a submittal.
      return Boolean(latest) && Boolean(row.due?.overdue);
    case "pending":
      return Boolean(latest) && matrixStatusBucket(latest.status) === "pending";
    case "action":
      return Boolean(latest) && matrixStatusBucket(latest.status) === "rejected";
    case "approved":
      return Boolean(latest) && matrixStatusBucket(latest.status) === "approved";
    case "eor":
      return Boolean(latest) && Boolean(row.pendingEorResponse || hasUnansweredApproverNotes(latest));
    case "nosub":
      return !latest;
    case "hold":
      return row.onHold > 0;
  }
}

export interface MatrixCoverage {
  /** Sets with at least one live sheet on active hold (the "On hold" pill). */
  setsOnHold: number;
  sheetsOnHold: number;
  /** Sets whose stage is Released (fab release reached). */
  released: number;
}

export function summarizeMatrixCoverage(rows: readonly EnrichedMatrixRow[]): MatrixCoverage {
  let setsOnHold = 0;
  let sheetsOnHold = 0;
  let released = 0;
  for (const row of rows || []) {
    if (row.onHold > 0) setsOnHold++;
    sheetsOnHold += row.onHold;
    if (row.stage === "Released") released++;
  }
  return { setsOnHold, sheetsOnHold, released };
}

// ── Deep links into sibling hub tabs ─────────────────────────────────────────
// Absolute in-hub links (hubLinks.hubHref), so they push history (Back returns
// to the matrix) and never re-pin the project. The receiving tab consumes and
// strips its own param: Submittals reads recordId / targetSetId, Transmittals
// reads transmittal.

// The record and create links are hubLinks' own, which the Control and
// Process Boards use too, so the three can't drift apart.
export const submittalHref = submittalRecordHref;

export const createSubmittalForSetHref = createSubmittalHref;

export const transmittalHref = (transmittalId: string): string =>
  hubHref("transmittals", { transmittal: transmittalId });
