import { isRfiOpen } from "@/lib/entityPredicates";
import { findBlockingRfis } from "@/lib/fabReleaseGate";
import { selectActionableLeafPieces } from "./canonicalRollups";
import {
  evaluateWorkPackageReadiness,
  type ReadinessDrawing,
} from "./readiness";
import { deriveRevisionExposure } from "./revisionExposure";
import type { PieceRegisterRow } from "./repository";
import type {
  ExposureLifecycle,
  ImpactVerification,
  NextReleaseReadiness,
  PieceAttentionRow,
  PieceDigitalThreadModel,
  PieceIntelligenceModel,
  PieceIntelligenceSnapshot,
  PieceIntelligenceWorkPackage,
  PieceThreadFact,
  RevisionExposureRow,
  SourceAvailability,
  SourceUnavailableWarning,
} from "./pieceIntelligenceTypes";

const naturalCollator = new Intl.Collator("en-US", {
  numeric: true,
  sensitivity: "base",
});

const lifecycleLabels: Record<ExposureLifecycle, string> = {
  not_started: "Planned",
  released: "Released",
  in_fabrication: "In fabrication",
  fabricated: "Fabricated",
  shipped: "Shipped",
  delivered: "Delivered",
  erected: "Erected",
};

const unavailableSourceOrder: Array<keyof PieceIntelligenceSnapshot["availability"]> = [
  "relationships",
  "approvals",
  "impacts",
  "rfis",
  "events",
];

function isIsoDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function dateFromNow(now: Date): string | null {
  return Number.isNaN(now.valueOf()) ? null : now.toISOString().slice(0, 10);
}

function addUtcDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isFieldRisk(fieldNeededDate: string | null, today: string | null): boolean {
  return Boolean(
    fieldNeededDate &&
    today &&
    fieldNeededDate <= addUtcDays(today, 10),
  );
}

function lifecycleFor(piece: PieceRegisterRow): ExposureLifecycle {
  return piece.lifecycle_status in lifecycleLabels
    ? piece.lifecycle_status as ExposureLifecycle
    : "not_started";
}

function workPackageLabel(workPackage: PieceIntelligenceWorkPackage | undefined): string {
  return workPackage?.wp_number ?? workPackage?.name ?? workPackage?.id ?? "Unassigned";
}

function markAndLot(piece: PieceRegisterRow): string {
  return piece.lot_code ? `${piece.piece_mark} · ${piece.lot_code}` : piece.piece_mark;
}

function openImpactsFor(
  revisionIds: ReadonlySet<string>,
  snapshot: PieceIntelligenceSnapshot,
) {
  if (snapshot.availability.impacts === "unavailable") return [];
  return snapshot.drawingImpacts.filter((impact) =>
    revisionIds.has(impact.drawing_revision_id) &&
    impact.status !== "resolved" &&
    impact.status !== "closed",
  );
}

function exactOpenRfis(
  drawings: ReadinessDrawing[],
  snapshot: PieceIntelligenceSnapshot,
) {
  if (
    snapshot.availability.relationships === "unavailable" ||
    snapshot.availability.rfis === "unavailable"
  ) {
    return [];
  }
  const linked = findBlockingRfis({ drawings, rfis: snapshot.rfis });
  const linkedIds = new Set(linked.map((rfi) => rfi.id).filter(Boolean));
  return snapshot.rfis.filter((rfi) => linkedIds.has(rfi.id));
}

function attentionReason(
  piece: PieceRegisterRow,
  exposures: RevisionExposureRow[],
  fieldRisk: boolean,
  severeImpact: boolean,
  rfiFabHold: boolean,
): { priorityTier: number; reason: string } | null {
  if (exposures.length > 0 && piece.lifecycle_status === "erected") {
    return { priorityTier: 1, reason: "Revision exposure after erection" };
  }
  if (exposures.length > 0 && piece.lifecycle_status === "delivered") {
    return { priorityTier: 2, reason: "Revision exposure after delivery" };
  }
  if (exposures.length > 0 && piece.lifecycle_status === "shipped") {
    return { priorityTier: 3, reason: "Revision exposure after shipment" };
  }
  if (
    exposures.length > 0 &&
    (piece.lifecycle_status === "fabricated" || piece.lifecycle_status === "in_fabrication")
  ) {
    return { priorityTier: 4, reason: "Revision exposure during fabrication" };
  }
  if (fieldRisk) {
    return { priorityTier: 5, reason: "Field need is due within 10 days" };
  }
  if (piece.on_hold) {
    return { priorityTier: 6, reason: "Canonical piece hold is active" };
  }
  if (severeImpact) {
    return { priorityTier: 6, reason: "Critical or high impact remains open" };
  }
  if (rfiFabHold) {
    return { priorityTier: 6, reason: "Linked RFI fabrication hold is active" };
  }
  if (
    exposures.length > 0 &&
    (piece.lifecycle_status === "not_started" || piece.lifecycle_status === "released")
  ) {
    return {
      priorityTier: 7,
      reason: "Planned piece has unresolved revision exposure",
    };
  }
  return null;
}

function compareNullableDates(left: string | null, right: string | null): number {
  if (left && right) return left.localeCompare(right);
  if (left) return -1;
  if (right) return 1;
  return 0;
}

function compareAttentionRows(left: PieceAttentionRow, right: PieceAttentionRow): number {
  return left.priorityTier - right.priorityTier ||
    compareNullableDates(left.fieldNeededDate, right.fieldNeededDate) ||
    naturalCollator.compare(left.workPackageLabel, right.workPackageLabel) ||
    naturalCollator.compare(left.markAndLot, right.markAndLot) ||
    naturalCollator.compare(left.pieceId, right.pieceId);
}

function buildAttentionRows(
  revisions: RevisionExposureRow[],
  snapshot: PieceIntelligenceSnapshot,
  now: Date,
): PieceAttentionRow[] {
  const actionablePieces = selectActionableLeafPieces(snapshot.pieces);
  const workPackageById = new Map(snapshot.workPackages.map((workPackage) => [workPackage.id, workPackage]));
  const exposuresByPieceId = new Map<string, RevisionExposureRow[]>();
  for (const revision of revisions) {
    for (const pieceId of revision.affectedPieceIds) {
      const pieceRevisions = exposuresByPieceId.get(pieceId) ?? [];
      pieceRevisions.push(revision);
      exposuresByPieceId.set(pieceId, pieceRevisions);
    }
  }

  const today = dateFromNow(now);
  const rows: PieceAttentionRow[] = [];
  for (const piece of actionablePieces) {
    const exposures = exposuresByPieceId.get(piece.id) ?? [];
    const revisionIds = new Set(exposures.map((exposure) => exposure.revisionId));
    const impacts = openImpactsFor(revisionIds, snapshot);
    const workPackage = piece.work_package_id
      ? workPackageById.get(piece.work_package_id)
      : undefined;
    const fieldNeededDate = isIsoDate(workPackage?.scheduled_start_date)
      ? workPackage.scheduled_start_date
      : null;
    const fieldRisk = isFieldRisk(fieldNeededDate, today);
    const severeImpact = impacts.some((impact) =>
      impact.status === "blocked" ||
      impact.priority === "critical" ||
      impact.priority === "high",
    );
    const rfiFabHold = exactOpenRfis(
      exactDrawingsForPiece(piece.id, snapshot),
      snapshot,
    ).some((rfi) => rfi.fab_hold === true && isRfiOpen(rfi));
    const fabBlocked = severeImpact || rfiFabHold;
    const leading = attentionReason(
      piece,
      exposures,
      fieldRisk,
      severeImpact,
      rfiFabHold,
    );
    if (!leading) continue;
    const lifecycle = lifecycleFor(piece);
    rows.push({
      pieceId: piece.id,
      revisionId: exposures[0]?.revisionId ?? null,
      priorityTier: leading.priorityTier,
      markAndLot: markAndLot(piece),
      workPackageLabel: workPackageLabel(workPackage),
      lifecycle,
      lifecycleLabel: lifecycleLabels[lifecycle],
      fieldNeededDate,
      fieldRisk,
      onHold: piece.on_hold,
      fabBlocked,
      reason: leading.reason,
    });
  }

  for (const revision of revisions) {
    if (revision.verification !== "link_required") continue;
    rows.push({
      pieceId: revision.revisionId,
      revisionId: revision.revisionId,
      priorityTier: 8,
      markAndLot: `${revision.sheetNumber || "Drawing"} · Rev ${revision.revisionCode || "Unspecified"}`,
      workPackageLabel: "Relationship repair",
      lifecycle: "not_started",
      lifecycleLabel: "Link required",
      fieldNeededDate: null,
      fieldRisk: false,
      onHold: false,
      fabBlocked: false,
      reason: "Explicit drawing relationship required",
    });
  }

  return rows.sort(compareAttentionRows);
}

function compareWorkPackages(
  left: PieceIntelligenceWorkPackage,
  right: PieceIntelligenceWorkPackage,
): number {
  const leftDate = isIsoDate(left.scheduled_start_date) ? left.scheduled_start_date : null;
  const rightDate = isIsoDate(right.scheduled_start_date) ? right.scheduled_start_date : null;
  return compareNullableDates(leftDate, rightDate) ||
    naturalCollator.compare(workPackageLabel(left), workPackageLabel(right)) ||
    naturalCollator.compare(left.id, right.id);
}

function deriveNextReleaseReadiness(
  snapshot: PieceIntelligenceSnapshot,
): NextReleaseReadiness | null {
  const actionablePieces = selectActionableLeafPieces(snapshot.pieces);
  const assignedWorkPackageIds = new Set(
    actionablePieces
      .map((piece) => piece.work_package_id)
      .filter((id): id is string => Boolean(id)),
  );
  const workPackage = snapshot.workPackages
    .filter((candidate) =>
      assignedWorkPackageIds.has(candidate.id) &&
      candidate.is_deleted !== true &&
      !candidate.deleted_at,
    )
    .sort(compareWorkPackages)[0];
  if (!workPackage) return null;

  const readiness = evaluateWorkPackageReadiness(
    [workPackage],
    snapshot.pieces,
    snapshot.pieceDrawings,
    snapshot.drawings,
    {
      drawingSets: snapshot.drawingSets,
      submittals: snapshot.submittals,
      sheetResponses: snapshot.sheetResponses,
      drawingRevisions: snapshot.drawingRevisions,
      drawingReviews: snapshot.drawingReviews,
      drawingSignoffs: snapshot.drawingSignoffs,
    },
    snapshot.pieceDrawingSets,
  )[0];
  if (!readiness) return null;
  return {
    workPackageId: workPackage.id,
    label: workPackageLabel(workPackage),
    isReady: readiness.isReady,
    blockerCount: readiness.blockers.length,
    pieceCount: readiness.pieceCount,
  };
}

function unavailableSourceWarnings(
  snapshot: PieceIntelligenceSnapshot,
): SourceUnavailableWarning[] {
  return unavailableSourceOrder.flatMap((source) =>
    snapshot.availability[source] === "unavailable"
      ? [{ source, reason: null }]
      : [],
  );
}

function modelVerification(
  revisions: RevisionExposureRow[],
  warnings: SourceUnavailableWarning[],
): ImpactVerification {
  if (revisions.some((revision) => revision.verification === "link_required")) {
    return "link_required";
  }
  if (
    warnings.length > 0 ||
    revisions.some((revision) => revision.verification === "partial")
  ) {
    return "partial";
  }
  return "verified";
}

function pieceQuantity(piece: PieceRegisterRow | undefined): number {
  if (!piece) return 0;
  const quantity = Number(piece.quantity);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
}

function quantityForIds(
  pieceById: Map<string, PieceRegisterRow>,
  pieceIds: ReadonlySet<string>,
): number {
  return [...pieceIds].reduce(
    (total, pieceId) => total + pieceQuantity(pieceById.get(pieceId)),
    0,
  );
}

export function derivePieceIntelligence(
  snapshot: PieceIntelligenceSnapshot,
  now: Date,
): PieceIntelligenceModel {
  const derivedRevisions = deriveRevisionExposure(snapshot);
  const revisions = snapshot.availability.relationships === "unavailable"
    ? derivedRevisions.map((revision) => ({ ...revision, verification: "partial" as const }))
    : derivedRevisions;
  const attention = buildAttentionRows(revisions, snapshot, now);
  const warnings = unavailableSourceWarnings(snapshot);
  const pieceById = new Map(
    selectActionableLeafPieces(snapshot.pieces).map((piece) => [piece.id, piece]),
  );
  const affectedPieceIds = new Set(revisions.flatMap((revision) => revision.affectedPieceIds));
  const blockedPieceIds = new Set(
    attention
      .filter((row) => row.onHold || row.fabBlocked)
      .map((row) => row.pieceId),
  );
  const fieldRiskPieceIds = new Set(
    attention.filter((row) => row.fieldRisk).map((row) => row.pieceId),
  );

  return {
    verification: modelVerification(revisions, warnings),
    unavailableSourceWarnings: warnings,
    revisions,
    attention,
    metrics: {
      affectedPieces: quantityForIds(pieceById, affectedPieceIds),
      blockedPieces: quantityForIds(pieceById, blockedPieceIds),
      fieldRiskPieces: quantityForIds(pieceById, fieldRiskPieceIds),
      linkRequiredRevisions: revisions.filter((revision) =>
        revision.verification === "link_required"
      ).length,
      nextRelease: deriveNextReleaseReadiness(snapshot),
    },
  };
}

function availabilityFor(...values: SourceAvailability[]): SourceAvailability {
  return values.every((value) => value === "available") ? "available" : "unavailable";
}

function displayValue(value: string | number | null | undefined): string {
  return value === null || value === undefined || value === "" ? "Not recorded" : String(value);
}

function humanize(value: string): string {
  const words = value.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Activity recorded";
}

function joinedOrFallback(values: string[], fallback: string): string {
  const unique = [...new Set(values.filter(Boolean))].sort(naturalCollator.compare);
  return unique.length > 0 ? unique.join(", ") : fallback;
}

function exactDrawingsForPiece(
  pieceId: string,
  snapshot: PieceIntelligenceSnapshot,
): ReadinessDrawing[] {
  if (snapshot.availability.relationships === "unavailable") return [];
  const drawingSetIds = new Set(
    snapshot.pieceDrawingSets
      .filter((link) => link.piece_id === pieceId)
      .map((link) => link.drawing_set_id),
  );
  const drawingIds = new Set(
    snapshot.pieceDrawings
      .filter((link) => link.piece_id === pieceId)
      .map((link) => link.drawing_id),
  );
  return snapshot.drawings
    .filter((drawing) =>
      drawingIds.has(drawing.id) ||
      Boolean(drawing.drawing_set_id && drawingSetIds.has(drawing.drawing_set_id)),
    )
    .sort((left, right) =>
      naturalCollator.compare(left.sheet_number ?? left.id, right.sheet_number ?? right.id),
    );
}

function eventFacts(
  pieceId: string,
  revisionIds: ReadonlySet<string>,
  snapshot: PieceIntelligenceSnapshot,
): PieceThreadFact[] {
  const facts = [
    ...(snapshot.availability.events === "available" ? snapshot.pieceEvents : [])
      .filter((event) => event.piece_id === pieceId)
      .map((event) => ({
        createdAt: event.created_at,
        id: `event:${event.id}`,
        label: event.created_at,
        value: event.reason
          ? `${humanize(event.event_type)} · ${event.reason}`
          : humanize(event.event_type),
      })),
    ...(snapshot.availability.impacts === "available" ? snapshot.drawingImpacts : [])
      .filter((impact) => revisionIds.has(impact.drawing_revision_id))
      .map((impact) => ({
        createdAt: impact.created_at,
        id: `impact:${impact.id}`,
        label: impact.created_at,
        value: `Change impact · ${impact.title}`,
      })),
  ];
  return facts
    .sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt) || naturalCollator.compare(left.id, right.id),
    )
    .map(({ label, value }) => ({ label, value }));
}

const lifecycleOrder: ExposureLifecycle[] = [
  "not_started",
  "released",
  "in_fabrication",
  "fabricated",
  "shipped",
  "delivered",
  "erected",
];

function milestoneValue(
  piece: PieceRegisterRow,
  threshold: ExposureLifecycle,
  eventTypes: ReadonlySet<string>,
  events: PieceIntelligenceSnapshot["pieceEvents"],
): string {
  const recorded = events
    .filter((event) => event.piece_id === piece.id)
    .filter((event) => eventTypes.has(event.event_type.trim().toLowerCase()))
    .sort((left, right) =>
      right.created_at.localeCompare(left.created_at) ||
      naturalCollator.compare(right.id, left.id),
    )[0];
  if (recorded) {
    const date = recorded.created_at.slice(0, 10);
    return isIsoDate(date) ? `Recorded ${date}` : "Recorded";
  }
  return lifecycleOrder.indexOf(lifecycleFor(piece)) >= lifecycleOrder.indexOf(threshold)
    ? "Confirmed by lifecycle"
    : "Not recorded";
}

export function buildPieceDigitalThread(
  pieceId: string,
  snapshot: PieceIntelligenceSnapshot,
): PieceDigitalThreadModel | null {
  const piece = selectActionableLeafPieces(snapshot.pieces)
    .find((candidate) => candidate.id === pieceId);
  if (!piece) return null;

  const workPackage = piece.work_package_id
    ? snapshot.workPackages.find((candidate) => candidate.id === piece.work_package_id)
    : undefined;
  const drawings = exactDrawingsForPiece(pieceId, snapshot);
  const drawingIds = new Set(drawings.map((drawing) => drawing.id));
  const revisions = snapshot.drawingRevisions
    .filter((revision) => drawingIds.has(revision.drawing_id) && revision.is_current && !revision.archived_at)
    .sort((left, right) =>
      naturalCollator.compare(left.revision_code ?? left.id, right.revision_code ?? right.id),
    );
  const revisionIds = new Set(revisions.map((revision) => revision.id));
  const impacts = snapshot.drawingImpacts.filter((impact) =>
    revisionIds.has(impact.drawing_revision_id),
  );
  const openRfis = exactOpenRfis(drawings, snapshot);
  const drawingSetIds = new Set(
    snapshot.pieceDrawingSets
      .filter((link) => link.piece_id === pieceId)
      .map((link) => link.drawing_set_id),
  );
  const linkedSetNames = snapshot.drawingSets
    .filter((drawingSet) => drawingSetIds.has(drawingSet.id))
    .map((drawingSet) => drawingSet.set_name ?? drawingSet.id);
  const reviewOrSignoffRecorded = revisions.some((revision) =>
    snapshot.drawingReviews.some((review) => review.drawing_revision_id === revision.id) ||
    snapshot.drawingSignoffs.some((signoff) =>
      signoff.drawing_id === revision.drawing_id && signoff.is_voided !== true
    ),
  );
  const activeSubmittals = snapshot.submittals.filter((submittal) =>
    submittal.is_deleted !== true &&
    !submittal.deleted_at &&
    (submittal.drawing_set_ids ?? []).some((drawingSetId) => drawingSetIds.has(drawingSetId)),
  );
  const activeSubmittalRoundIds = new Set(
    activeSubmittals
      .map((submittal) => submittal.current_round_id)
      .filter((roundId): roundId is string => Boolean(roundId)),
  );
  const activeSheetResponses = snapshot.sheetResponses.filter((response) =>
    response.is_deleted !== true &&
    !response.deleted_at &&
    Boolean(response.drawing_id && drawingIds.has(response.drawing_id)) &&
    activeSubmittalRoundIds.has(response.submittal_round_id),
  );
  const approvalRecorded = reviewOrSignoffRecorded ||
    activeSubmittals.length > 0 ||
    activeSheetResponses.length > 0;
  const unresolvedDispositions = snapshot.commentDispositions.filter((disposition) =>
    disposition.is_deleted !== true &&
    disposition.status !== "resolved" &&
    disposition.related_piece_ids?.includes(pieceId),
  );
  const trustedImpacts = snapshot.availability.impacts === "available" ? impacts : [];
  const changeOrderSignal = trustedImpacts.some((impact) =>
    impact.impact_type.toLowerCase() === "change_order"
  );
  const fieldNeededDate = isIsoDate(workPackage?.scheduled_start_date)
    ? workPackage.scheduled_start_date
    : null;
  const modelAndDrawingAvailability = availabilityFor(
    snapshot.availability.relationships,
    snapshot.availability.approvals,
  );
  const commercialAvailability = availabilityFor(
    snapshot.availability.relationships,
    snapshot.availability.impacts,
    snapshot.availability.rfis,
  );
  const historyAvailability = availabilityFor(
    snapshot.availability.events,
    snapshot.availability.impacts,
  );

  const commercialFacts: PieceThreadFact[] = [
    { label: "Fabrication hold", value: piece.on_hold ? displayValue(piece.on_hold_reason ?? "On hold") : "No hold recorded" },
  ];
  if (
    snapshot.availability.relationships === "available" &&
    snapshot.availability.rfis === "available"
  ) {
    commercialFacts.push({
      label: "Open RFIs",
      value: joinedOrFallback(
        openRfis.map((rfi) => rfi.rfi_number ?? rfi.id),
        "No linked open RFI",
      ),
    });
  }
  if (changeOrderSignal) {
    commercialFacts.push(
      { label: "Change exposure", value: "Change impact recorded" },
      { label: "Change order", value: "CO record not linked" },
    );
  }

  return {
    pieceId,
    identity: {
      availability: "available",
      markAndLot: markAndLot(piece),
      facts: [
        { label: "Piece mark", value: piece.piece_mark },
        { label: "Lot", value: displayValue(piece.lot_code) },
        { label: "Quantity", value: displayValue(piece.quantity) },
        { label: "Profile", value: displayValue(piece.profile) },
        { label: "Grade", value: displayValue(piece.material_grade) },
        { label: "Work package", value: workPackageLabel(workPackage) },
        { label: "Sequence", value: displayValue(workPackage?.sequence_number ?? piece.sequence_number) },
        { label: "Source", value: displayValue(piece.source_system) },
      ],
    },
    modelAndDrawing: {
      availability: modelAndDrawingAvailability,
      facts: snapshot.availability.relationships === "available" ? [
        { label: "Drawing sets", value: joinedOrFallback(linkedSetNames, "Not linked") },
        {
          label: "Sheets",
          value: joinedOrFallback(
            drawings.map((drawing) => drawing.sheet_number ?? drawing.id),
            "Not linked",
          ),
        },
        {
          label: "Current revisions",
          value: joinedOrFallback(
            revisions.map((revision) => {
              const drawing = drawings.find((candidate) => candidate.id === revision.drawing_id);
              return `${drawing?.sheet_number ?? revision.drawing_id} Rev ${revision.revision_code ?? "Unspecified"}`;
            }),
            "Not recorded",
          ),
        },
        ...(snapshot.availability.approvals === "available" ? [
          {
            label: "Submittal status",
            value: joinedOrFallback(
              activeSubmittals.map((submittal) => submittal.status),
              "Not recorded",
            ),
          },
          {
            label: "Sheet response",
            value: joinedOrFallback(
              activeSheetResponses.map((response) => {
                const drawing = drawings.find((candidate) => candidate.id === response.drawing_id);
                return `${drawing?.sheet_number ?? response.drawing_id}: ${response.response_status}`;
              }),
              "Not recorded",
            ),
          },
          { label: "Approval evidence", value: approvalRecorded ? "Recorded" : "Not recorded" },
          { label: "Unresolved dispositions", value: String(unresolvedDispositions.length) },
        ] : []),
        { label: "Link quality", value: drawings.length > 0 ? "Exact relationship" : "Not linked" },
      ] : [],
    },
    commercial: {
      availability: commercialAvailability,
      facts: commercialFacts,
    },
    productionAndLogistics: {
      availability: "available",
      facts: [
        { label: "Lifecycle", value: lifecycleLabels[lifecycleFor(piece)] },
        {
          label: "Release",
          value: milestoneValue(
            piece,
            "released",
            new Set([
              "released_for_fabrication",
              "released",
              "fab_released",
              "fabrication_released",
            ]),
            snapshot.availability.events === "available" ? snapshot.pieceEvents : [],
          ),
        },
        { label: "Shop station", value: displayValue(piece.current_station) },
        {
          label: "Fabrication completion",
          value: milestoneValue(
            piece,
            "fabricated",
            new Set(["fabricated", "fabrication_completed", "fabrication_complete"]),
            snapshot.availability.events === "available" ? snapshot.pieceEvents : [],
          ),
        },
        {
          label: "Shipment / load",
          value: milestoneValue(
            piece,
            "shipped",
            new Set(["loaded", "load", "shipped", "shipment"]),
            snapshot.availability.events === "available" ? snapshot.pieceEvents : [],
          ),
        },
        {
          label: "Delivery",
          value: milestoneValue(
            piece,
            "delivered",
            new Set(["delivered", "delivery"]),
            snapshot.availability.events === "available" ? snapshot.pieceEvents : [],
          ),
        },
        {
          label: "Erection",
          value: milestoneValue(
            piece,
            "erected",
            new Set(["erected", "erection"]),
            snapshot.availability.events === "available" ? snapshot.pieceEvents : [],
          ),
        },
        { label: "Field need", value: fieldNeededDate ?? "Not recorded" },
      ],
    },
    history: {
      availability: historyAvailability,
      facts: eventFacts(pieceId, revisionIds, snapshot),
    },
  };
}
