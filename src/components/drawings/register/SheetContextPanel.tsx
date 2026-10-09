/**
 * Selected shop sheet evidence. A revision's distribution state is not its
 * submittal approval and neither grants fabrication release. Every unknown
 * field stays explicit instead of appearing as a clear/zero condition.
 */
import { Link } from "react-router-dom";
import type { Ref } from "react";
import { pickMostRecentSubmittal } from "@/lib/submittalStageMapping";
import { createSubmittalHref, hubHref, submittalRecordHref } from "@/pages/drawingSubmittalHub/hubLinks";
import { fmtDate } from "@/pages/drawingSubmittalHub/format";
import type { IndexedRegisterRow } from "./docControl.derive";
import { useSheetSetEvidence } from "./useSheetSetEvidence";
import { useSheetTransmittalEvidence } from "./useSheetTransmittalEvidence";
import "./sheetContextPanel.css";

const NOT_VERIFIED = "Not verified";

const DISTRIBUTION_LABELS: Record<string, string> = {
  received: "Received",
  pending_review: "Pending review",
  reviewed: "Reviewed",
  released_for_estimate: "Estimate distribution",
  released_for_shop: "Shop distribution",
  released_for_field: "Field distribution",
  on_hold: "On hold",
  superseded: "Superseded",
  void: "Void",
};

function legacyLinkEvidence(count: number | null): string {
  // drawing_register_view counts only legacy drawing_links. A zero here does
  // not prove the absence of RFIs or work-package/piece-set relationships.
  return typeof count === "number" && count > 0
    ? `At least ${count} linked`
    : NOT_VERIFIED;
}

export function SheetContextPanel({ entry, projectId, panelRef }: {
  entry: IndexedRegisterRow | null;
  projectId: string;
  panelRef?: Ref<HTMLElement>;
}) {
  const explicitSetId = entry?.row.drawing_set_id && entry.pkg?.setId
    && String(entry.row.drawing_set_id) === String(entry.pkg.setId)
    ? String(entry.row.drawing_set_id)
    : null;
  const scopedProjectId = entry?.row.project_id === projectId ? projectId : null;
  const { gate, scope, sourceReadsFetching, scopeSourcesFetching } = useSheetSetEvidence(scopedProjectId, explicitSetId);
  const transmittal = useSheetTransmittalEvidence(
    scopedProjectId,
    scopedProjectId ? entry?.row.drawing_id ?? null : null,
    entry?.row.current_revision_id ?? null,
  );

  if (!entry) {
    return (
      <aside ref={panelRef} className="sheet-context-panel" aria-label="Sheet context" tabIndex={0}>
        <h3>Sheet context</h3>
        <p className="sheet-context-panel__muted">Select a sheet to inspect its drawing and approval evidence.</p>
      </aside>
    );
  }

  const { row, pkg } = entry;
  const gateRefreshing = gate.isFetching || sourceReadsFetching;
  const scopeRefreshing = scope.isFetching || scopeSourcesFetching;
  const trustedGate = scopedProjectId && explicitSetId && !gate.isPending && !gate.isError && !gateRefreshing
    ? gate.data
    : null;
  const trustedScope = scopedProjectId && explicitSetId && !scope.isPending && !scope.isError && !scopeRefreshing
    ? scope.data
    : null;
  const trustedTransmittal = !transmittal.isPending && !transmittal.isError && !transmittal.isFetching
    && transmittal.data?.kind === "found" ? transmittal.data : null;
  // The server gate selects the governing record. The package cache provides
  // ball-in-court context only after an exact ID match to that selection.
  const governingId = trustedGate?.submittalId ?? null;
  const governing = governingId && explicitSetId
    ? (pkg?.submittals ?? []).find((submittal) =>
      submittal.id === governingId
      && !submittal.is_deleted
      && !submittal.deleted_at
      && Array.isArray(submittal.drawing_set_ids)
      && submittal.drawing_set_ids.includes(explicitSetId))
    : null;
  const matchingName = (pkg?.name || row.drawing_set_name || "").trim().toLowerCase();
  const historicalNameMatches = (pkg?.historicalSubmittals ?? []).filter((submittal) =>
    !submittal.is_deleted
    && !submittal.deleted_at
    && (!Array.isArray(submittal.drawing_set_ids) || submittal.drawing_set_ids.length === 0)
    && Boolean(matchingName)
    && String(submittal.drawing_set_name || "").trim().toLowerCase() === matchingName,
  );
  const historical = pickMostRecentSubmittal(historicalNameMatches);
  const relatedSetLinks = (pkg?.relatedSubmittals ?? []).filter((submittal) =>
    !submittal.is_deleted
    && !submittal.deleted_at
    && explicitSetId !== null
    && Array.isArray(submittal.drawing_set_ids)
    && submittal.drawing_set_ids.includes(explicitSetId)
    && submittal.submittal_type !== "Shop Drawing",
  );
  const related = pickMostRecentSubmittal(relatedSetLinks);
  const needsShopDrawingPackage = Boolean(
    !governingId && related && trustedGate?.blockers.some((blocker) => blocker.kind === "no_submittal"),
  );
  const approvalStage = governingId && trustedGate?.governingStage !== "Not Started"
    ? trustedGate?.governingStage
    : null;
  const revision = row.current_revision_id && row.current_revision
    ? `Revision ${row.current_revision}`
    : NOT_VERIFIED;
  const distribution = row.current_revision_id && row.current_status
    ? DISTRIBUTION_LABELS[row.current_status] ?? row.current_status.replace(/_/g, " ")
    : NOT_VERIFIED;
  const hold = row.active_hold_id
    ? "1 active"
    : row.active_hold_id === null ? "None recorded" : NOT_VERIFIED;
  const sheetNumber = row.sheet_number || "Untitled sheet";
  const viewerUrl = `/DrawingViewer?recordId=${encodeURIComponent(row.drawing_id)}`;
  const setUrl = explicitSetId
    ? hubHref("drawings", { hub_view: "sets", set: explicitSetId })
    : null;
  const action = row.active_hold_id
    ? { label: "Resolve active hold", href: hubHref("holds") }
    : typeof row.open_impact_count === "number" && row.open_impact_count > 0
      ? { label: "Review revision impact", href: hubHref("revimpact") }
      : typeof row.pending_review_count === "number" && row.pending_review_count > 0
        ? { label: "Review current revision", href: hubHref("drawings", { hub_view: "reviews" }) }
        : approvalStage === "R&R" && governingId
          ? { label: "Respond to returned submittal", href: submittalRecordHref(governingId) }
          : needsShopDrawingPackage && explicitSetId
            ? { label: "Create a Shop Drawing package", href: createSubmittalHref(explicitSetId) }
          : !governingId && historical && explicitSetId
            ? { label: "Verify and link historical submittal", href: submittalRecordHref(historical.id) }
            : !governingId && trustedGate && explicitSetId
            ? { label: "Create or link approval record", href: createSubmittalHref(explicitSetId) }
            : !governingId && explicitSetId
              ? { label: "Verify set approval records", href: hubHref("submittals") }
            : { label: "Inspect drawing evidence", href: viewerUrl };

  return (
    <aside ref={panelRef} className="sheet-context-panel" aria-label="Sheet context" tabIndex={0}>
      <div className="sheet-context-panel__eyebrow">SELECTED SHOP SHEET</div>
      <h3>{sheetNumber}</h3>
      <p className="sheet-context-panel__subtitle">{row.sheet_title || "Title not recorded"}</p>

      <dl className="sheet-context-panel__facts">
        <div>
          <dt>Drawing set</dt>
          <dd>{pkg?.name || row.drawing_set_name || NOT_VERIFIED}</dd>
          {setUrl ? <Link to={setUrl}>Open linked set</Link> : <small>Set link {NOT_VERIFIED.toLowerCase()}</small>}
        </div>
        <div>
          <dt>Current revision</dt>
          <dd data-evidence="revision">{revision}</dd>
          {!row.current_revision_id && row.current_revision && <small>Legacy label {row.current_revision}; current revision is untracked.</small>}
        </div>
        <div>
          <dt>Revision distribution</dt>
          <dd data-evidence="distribution">{distribution}</dd>
          <small>Distribution is separate from fabrication authorization.</small>
        </div>
        <div>
          <dt>Last sheet transmittal <small>exact shop-sheet attachment</small></dt>
          <dd data-evidence="transmittal">
            {!scopedProjectId ? NOT_VERIFIED
              : transmittal.isPending || transmittal.isFetching ? "Checking…"
                : transmittal.isError ? "Unavailable"
                  : trustedTransmittal
                    ? trustedTransmittal.number || "Number not recorded"
                    : transmittal.data?.kind === "none" ? "No active sheet transmittal recorded" : NOT_VERIFIED}
          </dd>
          {trustedTransmittal && (
            <>
              <small>{trustedTransmittal.direction === "incoming" ? "Incoming" : trustedTransmittal.direction === "outgoing" ? "Outgoing" : "Internal"} · {trustedTransmittal.lifecycle} · {trustedTransmittal.date ? fmtDate(trustedTransmittal.date) : "Date not recorded"}</small>
              <small>{trustedTransmittal.revision === "current"
                ? "Current tracked revision is attached."
                : trustedTransmittal.revision === "different"
                  ? "A different tracked revision is attached; current revision is not."
                  : "Current revision comparison is not verified."}</small>
              <Link to={hubHref("transmittals", { transmittal: trustedTransmittal.id })}>Open exact transmittal</Link>
            </>
          )}
          {transmittal.isError && (
            <>
              <small>Transmittal evidence could not be verified. {transmittal.error instanceof Error ? transmittal.error.message : "Retry the read."}</small>
              <button type="button" className="cmd-btn cmd-btn--ghost" onClick={() => { void transmittal.refetch(); }}>Retry transmittal read</button>
            </>
          )}
          <small>Transmittal distribution does not authorize fabrication.</small>
        </div>
        <div>
          <dt>Set approval stage <small>server-selected governing submittal</small></dt>
          <dd data-evidence="approval">{approvalStage || NOT_VERIFIED}</dd>
          {governingId ? (
            <>
              <small>{trustedGate?.submittalNumber || "Governing record"} · Ball in court: {governing?.ball_in_court || NOT_VERIFIED}</small>
              <Link to={submittalRecordHref(governingId)}>Open governing submittal</Link>
            </>
          ) : (
            <>
              <small>{gate.isPending && scopedProjectId && explicitSetId
                ? "Checking server approval evidence."
                : gate.isError || !trustedGate
                  ? "Server approval evidence unavailable."
                  : "Server found no governing Shop Drawing submittal."}</small>
              {needsShopDrawingPackage && related && explicitSetId && (
                <>
                  <small>{relatedSetLinks.length} set-ID-linked record{relatedSetLinks.length === 1 ? "" : "s"} do not govern Shop Drawing approval.</small>
                  <small>Reviewed non-Shop records cannot be reclassified. Create a Shop Drawing package linked to this set for drawing review and fabrication authorization.</small>
                </>
              )}
              {historical && (
                <>
                  <small>{historicalNameMatches.length} historical name-only match{historicalNameMatches.length === 1 ? "" : "es"}; approval unverified until linked by set ID.</small>
                  <Link to={submittalRecordHref(historical.id)}>Open historical submittal</Link>
                </>
              )}
            </>
          )}
        </div>
        <div>
          <dt>Active hold <small>drawing_holds</small></dt>
          <dd data-evidence="hold">{hold}</dd>
          {row.active_hold_id && row.active_hold_reason && <small>{row.active_hold_reason}</small>}
        </div>
        <div>
          <dt>RFI links <small>legacy links only</small></dt>
          <dd data-evidence="rfi">{legacyLinkEvidence(row.rfi_count)}</dd>
        </div>
        <div>
          <dt>Work-package links <small>legacy links only</small></dt>
          <dd data-evidence="work-package">{legacyLinkEvidence(row.work_package_count)}</dd>
        </div>
        <div>
          <dt>Canonical linked scope <small>piece-to-set and piece-to-sheet links · active leaf lots</small></dt>
          <dd data-evidence="canonical-scope">
            {!scopedProjectId || !explicitSetId ? NOT_VERIFIED
              : scope.isPending ? "Loading…"
              : scopeRefreshing ? "Checking…"
              : scope.isError ? "Unavailable"
              : trustedScope?.unresolvedWorkPackageCount
                ? `${trustedScope.linkedLeafLotCount} leaf lots · at least ${trustedScope.workPackages.length} active work package${trustedScope.workPackages.length === 1 ? "" : "s"}`
                : trustedScope
                  ? `${trustedScope.linkedLeafLotCount} leaf lots · ${trustedScope.workPackages.length} active work package${trustedScope.workPackages.length === 1 ? "" : "s"}`
                  : NOT_VERIFIED}
          </dd>
          {trustedScope && (
            <>
              {trustedScope.unassignedLeafLotCount > 0 && <small>{trustedScope.unassignedLeafLotCount} linked leaf lot(s) unassigned to a work package.</small>}
              {trustedScope.splitParentSetLinks > 0 && (
                <>
                  <small>{trustedScope.splitParentSetLinks} drawing-set link(s) belong to split parents, which are excluded from actionable leaf-lot scope. Verify the child-lot links before release.</small>
                  <Link to="/PieceRegister">Review piece relationships</Link>
                </>
              )}
              {trustedScope.unresolvedWorkPackageCount > 0 && <small>{trustedScope.unresolvedWorkPackageCount} work-package assignment(s) could not be verified.</small>}
              {trustedScope.workPackages.map((wp) => (
                <Link key={wp.id} to={`/PieceRegister?wp=${encodeURIComponent(wp.id)}`}>
                  {wp.wp_number || wp.name || wp.id} · {wp.leafLotCount} linked lot{wp.leafLotCount === 1 ? "" : "s"}
                </Link>
              ))}
            </>
          )}
          {scope.isError && <button type="button" className="cmd-btn cmd-btn--ghost" onClick={() => { void scope.refetch(); }}>Retry scope read</button>}
        </div>
        <div>
          <dt>Last sheet activity</dt>
          <dd>{row.last_activity ? fmtDate(row.last_activity) : NOT_VERIFIED}</dd>
        </div>
        <div>
          <dt>Drawing-set gate <small>evaluate_fab_release_set · server evaluation</small></dt>
          <dd data-evidence="drawing-set-gate">
            {!scopedProjectId || !explicitSetId ? NOT_VERIFIED
              : gate.isPending || gateRefreshing ? "Checking…"
              : gate.isError ? "Unavailable"
              : trustedGate ? trustedGate.ok ? "Set check clear" : `Blocked · ${trustedGate.blockers.length} issue${trustedGate.blockers.length === 1 ? "" : "s"}`
                : NOT_VERIFIED}
          </dd>
          {trustedGate?.blockers.map((blocker, index) => <small key={`${blocker.kind}-${index}`}>{blocker.title}</small>)}
          {trustedGate && <small>{trustedGate.blockingRfiNumbers.length} open blocking RFI(s) at drawing-set scope. Work-package release has a separate server gate.</small>}
          {gate.isError && <button type="button" className="cmd-btn cmd-btn--ghost" onClick={() => { void gate.refetch(); }}>Retry set check</button>}
        </div>
        <div>
          <dt>Work-package fabrication release <small>separate server gate</small></dt>
          <dd data-evidence="fab-release">{NOT_VERIFIED}</dd>
          <Link to="/FabRelease">Open Fab Release check</Link>
        </div>
      </dl>

      <div className="sheet-context-panel__actions">
        <Link className="cmd-btn cmd-btn--primary" to={action.href}>{action.label}</Link>
        <Link className="cmd-btn cmd-btn--ghost" to={viewerUrl}>Open drawing viewer</Link>
      </div>
    </aside>
  );
}
