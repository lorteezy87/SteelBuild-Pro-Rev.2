/**
 * fabReleaseGate.ts — the deterministic "Ready for Fab?" gate. Blocks a Fab
 * Release while a package isn't truly ready, across every readiness dimension —
 * not just status:
 *
 *   1. Open RFIs       — an unanswered RFI references a sheet (the classic rework
 *                        trap: the shop builds to a detail the engineer may change).
 *   2. Rejected sheets — a sheet came back Rejected / Revise-and-Resubmit.
 *   3. Revision conflict — a sheet is superseded by a newer revision.
 *   4. Required sign-offs (opt-in) — an approved sheet lacks its fab sign-off.
 *
 * "Approved status" is enforced upstream by the export's approved-filter (only
 * approved sheets ship); this gate then checks the rest. Any failing check blocks
 * the release, with an explicit, audited PM override as the escape hatch (e.g. a
 * deliberate partial release).
 *
 * LINK MODEL: `drawings.linked_rfi_ids` is a COMMA-SEPARATED STRING of RFI
 * *numbers* (e.g. "RFI-001, RFI #002"), NOT an id array. We match those numbers
 * against the project's RFIs by a normalized rfi_number (upper-cased,
 * non-alphanumerics stripped) so "RFI #001" links to "RFI-001". "Open" reuses the
 * canonical isRfiOpen predicate so this gate agrees with every open-RFI rollup.
 *
 * Pure + side-effect free (no fetching, no `new Date()`).
 */
import { isRfiOpen } from "@/lib/entityPredicates";
import { isApprovedForFab } from "@/lib/exports/fabRelease";

/** Minimal drawing shape the fab-release gate reads. */
export interface DrawingLike {
  id?: string | null;
  sheet_number?: string | null;
  /** CSV of RFI numbers (canonical); array tolerated defensively. */
  linked_rfi_ids?: string | string[] | null;
  is_deleted?: boolean | null;
  stage?: string | null;
  set_approval_status?: string | null;
  ifc_status?: string | null;
  is_superseded?: boolean | null;
  current_revision_missing?: boolean | null;
  current_revision_id?: string | null;
  has_revision_ledger?: boolean | null;
  current_release_status?: string | null;
  current_revision_status?: string | null;
}

/** Minimal RFI shape used for open-RFI blocking. */
export interface RfiLike {
  id?: string | null;
  rfi_number?: string | null;
  status?: string | null;
  is_deleted?: boolean | null;
}

/** Minimal fab/construction sign-off shape. */
export interface SignoffLike {
  drawing_id?: string | null;
  stamp_type?: string | null;
  status?: string | null;
  is_voided?: boolean | null;
}

/** One structured blocking reason surfaced to the UI. */
export interface FabGateReason {
  kind:
    | "rejected_sheets"
    | "revision_conflict"
    | "unresolved_revision"
    | "open_rfis"
    | "missing_signoffs"
    | "not_ifc_ready";
  title: string;
  sheets: DrawingLike[];
  rfis?: RfiLike[];
  /** Optional remediation hint (e.g. unresolved_revision). */
  action?: string;
}

/** Full gate evaluation result (includes legacy RFI-only KPI fields). */
export interface FabGateResult {
  blocked: boolean;
  reasons: FabGateReason[];
  /** Legacy RFI-only fields (Dashboard "RFIs Blocking Fab" KPI + existing callers). */
  blockingRfis: RfiLike[];
  affectedSheets: DrawingLike[];
  blockingCount: number;
}

export interface FabReleaseGateArgs {
  drawings?: Array<DrawingLike | null | undefined> | null;
  rfis?: Array<RfiLike | null | undefined> | null;
  signoffs?: Array<SignoffLike | null | undefined> | null;
  requireSignoffs?: boolean;
  /** Submittal evidence for IFC/Released readiness (Slice 8). */
  submittals?: Array<{
    id: string;
    status: string;
    ball_in_court?: string | null;
    drawing_set_ids?: string[] | null;
    submitted_date?: string | null;
    updated_at?: string | null;
    round_number?: number | null;
    is_deleted?: boolean | null;
    deleted_at?: string | null;
  }> | null;
  drawingRevisions?: Array<{
    id: string;
    drawing_id: string;
    is_current: boolean;
    archived_at?: string | null;
  }> | null;
}

/** Normalize an RFI number for matching: "RFI #001" → "RFI001". */
function normNum(value: string | number | null | undefined): string {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Parse a drawing's linked RFI numbers (CSV string; array tolerated defensively). */
export function linkedRfiNumbers(drawing: DrawingLike | null | undefined): string[] {
  const raw = drawing?.linked_rfi_ids;
  if (!raw) return [];
  const parts = Array.isArray(raw) ? raw : String(raw).split(",");
  return parts.map((s) => String(s).trim()).filter(Boolean);
}

/**
 * The OPEN RFIs that reference a sheet in the package (deduped).
 */
export function findBlockingRfis({
  drawings = [],
  rfis = [],
}: {
  drawings?: Array<DrawingLike | null | undefined> | null;
  rfis?: Array<RfiLike | null | undefined> | null;
} = {}): RfiLike[] {
  // Index OPEN, non-deleted RFIs by normalized number.
  const openByNum = new Map<string, RfiLike>();
  for (const r of rfis || []) {
    if (!r || r.is_deleted || !isRfiOpen(r)) continue;
    const key = normNum(r.rfi_number);
    if (key) openByNum.set(key, r);
  }
  if (openByNum.size === 0) return [];

  const blocking = new Map<string | null | undefined, RfiLike>(); // dedupe by id (fallback rfi_number)
  for (const d of drawings || []) {
    for (const num of linkedRfiNumbers(d)) {
      const r = openByNum.get(normNum(num));
      if (r) blocking.set(r.id ?? r.rfi_number, r);
    }
  }
  return Array.from(blocking.values());
}

/**
 * A sheet whose review came back Rejected / Revise-and-Resubmit / Returned —
 * checked across the status fields we persist (stage / set_approval_status /
 * ifc_status), so it's robust to the exact vocabulary.
 */
export function isRejectedSheet(d: DrawingLike | null | undefined): boolean {
  if (!d || d.is_deleted) return false;
  const sig = `${d.stage || ""} ${d.set_approval_status || ""} ${d.ifc_status || ""}`.toLowerCase();
  return /reject|revise|resubmit|\breturned\b|r&r/.test(sig);
}

/** A sheet superseded by a newer revision — a live revision conflict for release. */
export function isSupersededSheet(d: DrawingLike | null | undefined): boolean {
  return !!d && d.is_deleted !== true && d.is_superseded === true;
}

/**
 * Current revision is missing or not fabrication-usable (on hold / void /
 * pending review). Callers may populate `current_revision_missing` or
 * `current_release_status` from drawing_register_view / revision joins.
 */
export function isUnresolvedCurrentRevision(d: DrawingLike | null | undefined): boolean {
  if (!d || d.is_deleted === true || d.is_superseded === true) return false;
  if (d.current_revision_missing === true) return true;
  if (d.current_revision_id == null && d.has_revision_ledger === true) return true;
  const status = String(d.current_release_status || d.current_revision_status || "").toLowerCase();
  return status === "on_hold" || status === "void" || status === "pending_review";
}

/** A non-voided fab/construction-approval sign-off that satisfies the sign-off gate. */
function isFabSignoff(s: SignoffLike | null | undefined): s is SignoffLike {
  if (!s || s.is_voided) return false;
  const t = String(s.stamp_type || s.status || "").toLowerCase();
  return t.includes("approved_for_fabrication") || t.includes("approved_as_noted") || t === "approved";
}

const plural = (n: number): string => (n === 1 ? "" : "s");

/**
 * "Ready for Fab?" gate for a package (the sheet membership of the drawing sets
 * being released). Returns structured `reasons` for the UI plus the legacy
 * RFI-only fields so existing callers (Dashboard KPI, etc.) keep working.
 */
export function computeFabReleaseGate({
  drawings = [],
  rfis = [],
  signoffs = [],
  requireSignoffs = false,
  submittals = [],
  drawingRevisions = [],
}: FabReleaseGateArgs = {}): FabGateResult {
  const live = (drawings || []).filter((d): d is DrawingLike => !!d && d.is_deleted !== true);
  const evidence = {
    submittals: submittals ?? [],
    drawingSignoffs: (signoffs || [])
      .filter((s): s is SignoffLike => !!s && !!s.drawing_id)
      .map((s) => ({
        drawing_id: String(s.drawing_id),
        stamp_type: String(s.stamp_type || s.status || ""),
        is_voided: s.is_voided ?? false,
        drawing_revision_id: null,
      })),
    drawingRevisions: drawingRevisions ?? [],
  };

  // 1. Open RFIs.
  const blockingRfis = findBlockingRfis({ drawings: live, rfis });
  const blockingNums = new Set(blockingRfis.map((r) => normNum(r.rfi_number)));
  const affectedSheets = live.filter((d) =>
    linkedRfiNumbers(d).some((num) => blockingNums.has(normNum(num))),
  );

  // 2/3. Rejected + superseded sheets (a superseded sheet that's also flagged
  // rejected is reported once, under "rejected").
  const rejected = live.filter(isRejectedSheet);
  const superseded = live.filter((d) => isSupersededSheet(d) && !isRejectedSheet(d));
  const unresolved = live.filter(
    (d) => isUnresolvedCurrentRevision(d) && !isRejectedSheet(d) && !isSupersededSheet(d),
  );
  // Slice 8: package sheets that are not IFC/Released fail closed (unless already
  // counted as rejected / superseded).
  const notIfcReady = live.filter(
    (d) =>
      !isRejectedSheet(d) &&
      !isSupersededSheet(d) &&
      !isApprovedForFab(d as any, evidence),
  );

  const reasons: FabGateReason[] = [];
  if (rejected.length) {
    reasons.push({ kind: "rejected_sheets", title: `${rejected.length} rejected / revise-and-resubmit sheet${plural(rejected.length)}`, sheets: rejected });
  }
  if (superseded.length) {
    reasons.push({ kind: "revision_conflict", title: `${superseded.length} sheet${plural(superseded.length)} with a superseded revision`, sheets: superseded });
  }
  if (unresolved.length) {
    reasons.push({
      kind: "unresolved_revision",
      title: `${unresolved.length} sheet${plural(unresolved.length)} with an unresolved current revision`,
      sheets: unresolved,
      action: "Publish or clear the current revision before releasing for fabrication.",
    });
  }
  if (notIfcReady.length) {
    reasons.push({
      kind: "not_ifc_ready",
      title: `${notIfcReady.length} sheet${plural(notIfcReady.length)} not IFC / Released for fabrication`,
      sheets: notIfcReady,
      action: "Advance governing submittals to IFC or Released before releasing the package.",
    });
  }
  if (blockingRfis.length) {
    reasons.push({ kind: "open_rfis", title: `${blockingRfis.length} open RFI${plural(blockingRfis.length)} reference this package`, rfis: blockingRfis, sheets: affectedSheets });
  }
  // Required sign-offs (opt-in via project setting). Only IFC/Released sheets need
  // one — an in-progress sheet isn't expected to be signed off yet.
  if (requireSignoffs) {
    const signed = new Set(
      (signoffs || [])
        .filter(isFabSignoff)
        .map((s) => s.drawing_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    );
    const missing = live.filter(
      (d) => isApprovedForFab(d as any, evidence) && d.id != null && !signed.has(d.id),
    );
    if (missing.length) {
      reasons.push({ kind: "missing_signoffs", title: `${missing.length} IFC/Released sheet${plural(missing.length)} missing a fab sign-off`, sheets: missing });
    }
  }

  return {
    blocked: reasons.length > 0,
    reasons,
    // Legacy RFI-only fields (Dashboard "RFIs Blocking Fab" KPI + existing callers).
    blockingRfis,
    affectedSheets,
    blockingCount: blockingRfis.length,
  };
}
