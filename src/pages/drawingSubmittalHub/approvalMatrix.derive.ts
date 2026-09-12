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
import type { TransmittalRow } from "@/hooks/useTransmittals";
import { hasUnansweredApproverNotes } from "@/lib/approverNotes";
import { submittalStatusToStage } from "@/lib/submittalStageMapping";
import { matrixStatusBucket, toDateInputValue } from "./format";
import { createSubmittalHref, hubHref, submittalRecordHref } from "./hubLinks";
import type { SetPackage } from "./types";

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
 * The newest OUTGOING transmittal that carried a sheet of the set, and how
 * much of what it carried has changed since it went out.
 */
export interface LastOutgoingTransmittal {
  id: string;
  number: string;
  /** The entered send date as a calendar day (YYYY-MM-DD). */
  dateSent: string;
  sentTo: string | null;
  /** Distinct sheets of this set on it, live or since superseded. */
  sheetCount: number;
  /** (a) Sheets whose sent revision is no longer their current one. */
  revisedSinceSent: number;
  /** (b) Sheets now superseded (drawings.is_superseded). */
  supersededSinceSent: number;
  /** Distinct sheets with (a) or (b), counted once: the number shown. */
  changedSinceSent: number;
  /** Live sheets with no current revision loaded, so (a) couldn't be checked. */
  uncheckedSheets: number;
}

export interface LastOutgoingRollup {
  bySet: Map<string, LastOutgoingTransmittal>;
  /**
   * Items on outgoing, dated transmittals whose sheet is in no loaded package:
   * its revision wasn't in the read, the sheet was deleted, or a row cap cut
   * it off. Project-wide, because such an item could belong to any set.
   */
  unresolvedItems: number;
}

/** One set's Last sent value. "unknown" is never shown as "not sent". */
export type LastSent =
  | { kind: "sent"; transmittal: LastOutgoingTransmittal }
  | { kind: "unknown"; unresolvedItems: number }
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
 * Rev.2 transmittals have no submittal_id or status (2026 keyed on both), so
 * the link is re-derived: transmittal item → drawing revision → sheet → set.
 * useTransmittals already resolves each item's drawing_id. Superseded sheets
 * count — they were transmitted as part of the set. Both directions count:
 * a set coming back from the EOR moved just as much as one going out, and the
 * direction is shown beside the number.
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
    if (!transmittal || transmittal.is_deleted) continue;
    const { party, date } = resolveTransmittalDisplay(transmittal);
    const candidate = {
      value: {
        id: String(transmittal.id),
        number: String(transmittal.transmittal_number || ""),
        direction: transmittal.direction,
        party: party ?? null,
        date: date ?? null,
      },
      // An entered date is a calendar day (stored at midnight UTC — slice it,
      // don't shift it). created_at is a real UTC instant, so it becomes the
      // LOCAL day it happened on; slicing it filed evening entries under
      // tomorrow, ahead of transmittals actually dated tomorrow.
      day: date
        ? String(date).slice(0, 10)
        : transmittal.created_at ? toDateInputValue(new Date(transmittal.created_at)) : "",
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
 * drawing_set_id → the newest OUTGOING transmittal carrying any of the set's
 * sheets, and how many of those sheets have changed since it went out.
 *
 * Kept apart from buildLastTransmittalBySet on purpose. That one is the Last
 * Transmittal column: the newest in EITHER direction, undated ones by
 * created_at. This one answers "what did we last send, and is it still
 * what's current?".
 *
 * - Only outgoing transmittals with a date_sent count. Newest wins by that
 *   day (the entered date as written, never shifted), then created_at, then
 *   transmittal number.
 * - item → drawing (useTransmittals resolves it from the item's immutable
 *   revision) → set, over every loaded sheet, live AND superseded. A sheet in
 *   no set (a legacy ungrouped package) is known, just set-less: skipped, not
 *   unresolved.
 * - A sheet is changed since sent when (a) its current revision is known and
 *   is none of the revisions this transmittal carried for it, or (b) it is
 *   now superseded. (b) is how the owner's revise-as-a-new-set workflow shows:
 *   the old sheet stays current in the old set and is marked superseded.
 *   Both at once count once.
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
  let unresolvedItems = 0;
  for (const transmittal of transmittals || []) {
    if (!transmittal || transmittal.is_deleted || transmittal.direction !== "outgoing") continue;
    const dateSent = String(transmittal.date_sent ?? "").trim();
    if (!dateSent) continue;

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
    const sentTo = String(transmittal.sent_to ?? "").trim();
    for (const [setId, sheets] of sentBySet) {
      const held = best.get(setId);
      if (held && compareTransmittals(order, held.order) <= 0) continue;
      let revised = 0;
      let superseded = 0;
      let changed = 0;
      let unchecked = 0;
      for (const [drawingId, sentRevisionIds] of sheets) {
        const isSuperseded = sheetIndex.get(drawingId)?.superseded === true;
        const currentId = currentRevisionIdByDrawingId?.get(drawingId);
        const isRevised = currentId !== undefined && !sentRevisionIds.has(currentId);
        if (isRevised) revised++;
        if (isSuperseded) superseded++;
        if (isRevised || isSuperseded) changed++;
        else if (currentId === undefined) unchecked++;
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
          supersededSinceSent: superseded,
          changedSinceSent: changed,
          uncheckedSheets: unchecked,
        },
      });
    }
  }

  const bySet = new Map<string, LastOutgoingTransmittal>();
  for (const [setId, entry] of best) bySet.set(setId, entry.value);
  return { bySet, unresolvedItems };
}

/**
 * One set's Last sent. Its own transmittal if one matched. Otherwise Unknown
 * while any item couldn't be placed, because that item might be this set's.
 * Only with every item placed is it "not sent yet".
 */
export function lastSentForSet(rollup: LastOutgoingRollup, setId: string): LastSent {
  const transmittal = rollup.bySet.get(String(setId));
  if (transmittal) return { kind: "sent", transmittal };
  if (rollup.unresolvedItems > 0) return { kind: "unknown", unresolvedItems: rollup.unresolvedItems };
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
